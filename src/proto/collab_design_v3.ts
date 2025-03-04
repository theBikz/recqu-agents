// src/collab_design_v2.ts
import 'dotenv/config';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { END, StateGraphArgs, START, StateGraph } from '@langchain/langgraph';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { JsonOutputToolsParser } from 'langchain/output_parsers';
import { HandlerRegistry } from '@/events';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock/web';
import { Providers } from '@/common';

interface AgentStateChannels {
  messages: BaseMessage[];
  next: string | string[];
  parallelResults: { [key: string]: string };
}

export interface Member {
  name: string;
  systemPrompt: string;
  tools: any[];
  llmConfig: LLMConfig;
}

interface LLMConfig {
  provider: Providers;
  [key: string]: any;
}

const llmProviders: Record<Providers, any> = {
    [Providers.OPENAI]: ChatOpenAI,
    [Providers.VERTEXAI]: ChatVertexAI,
    [Providers.BEDROCK_LEGACY]: BedrockChat,
    [Providers.MISTRALAI]: ChatMistralAI,
    [Providers.BEDROCK]: ChatBedrockConverse,
    [Providers.ANTHROPIC]: ChatAnthropic,
};

export class CollaborativeProcessor {
    private graph: Runnable | null = null;
    private handlerRegistry: HandlerRegistry;
    private members: Member[];

    constructor(members: Member[], customHandlers?: Record<string, any>) {
        this.members = members;
        this.handlerRegistry = new HandlerRegistry();
        if (customHandlers) {
            for (const [eventType, handler] of Object.entries(customHandlers)) {
                this.handlerRegistry.register(eventType, handler);
            }
        }
    }

    async initialize(): Promise<void> {
        this.graph = await this.createGraph();
    }

    private async createGraph(): Promise<Runnable> {
        const agentStateChannels: StateGraphArgs['channels'] = {
            messages: {
                value: (x?: BaseMessage[], y?: BaseMessage[]) => (x ?? []).concat(y ?? []),
                default: () => [],
            },
            next: {
                value: (x?: string | string[], y?: string | string[]) => y ?? x ?? END,
                default: () => END,
            },
            parallelResults: {
                value: (x?: { [key: string]: string }, y?: { [key: string]: string }) => ({ ...x, ...y }),
                default: () => ({}),
            },
        };

        async function createAgent(
            llmConfig: LLMConfig,
            tools: any[],
            systemPrompt: string
        ): Promise<AgentExecutor> {
            const { provider, ...clientOptions } = llmConfig;
            const LLMClass = llmProviders[provider];
            if (!LLMClass) {
                throw new Error(`Unsupported LLM provider: ${provider}`);
            }
            const llm = new LLMClass(clientOptions);

            const prompt = await ChatPromptTemplate.fromMessages([
                ['system', systemPrompt],
                new MessagesPlaceholder('messages'),
                new MessagesPlaceholder('agent_scratchpad'),
            ]);
            const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
            return new AgentExecutor({ agent, tools });
        }

        const memberNames = this.members.map(member => member.name);

        const systemPrompt =
      'You are a supervisor tasked with managing a conversation between the' +
      ' following workers: {members}. Given the following user request,' +
      ' respond with the worker(s) to act next. You can choose multiple workers' +
      ' to act in parallel if appropriate. Each worker will perform a' +
      ' task and respond with their results and status. When finished,' +
      ' respond with FINISH.';
        const options = [END, ...memberNames];

        const functionDef = {
            name: 'route',
            description: 'Select the next role(s).',
            parameters: {
                title: 'routeSchema',
                type: 'object',
                properties: {
                    next: {
                        title: 'Next',
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: options,
                        },
                        minItems: 1,
                    },
                },
                required: ['next'],
            },
        };

        const toolDef = {
            type: 'function',
            function: functionDef,
        } as const;

        const prompt = ChatPromptTemplate.fromMessages([
            ['system', systemPrompt],
            new MessagesPlaceholder('messages'),
            [
                'system',
                'Given the conversation above, who should act next?' +
        ' You can choose multiple workers to act in parallel if appropriate.' +
        ' Or should we FINISH? Select from: {options}',
            ],
        ]);

        const formattedPrompt = await prompt.partial({
            options: options.join(', '),
            members: memberNames.join(', '),
        });

        const llm = new ChatOpenAI({
            modelName: 'gpt-4',
            temperature: 0,
        });

        const supervisorChain = formattedPrompt
            .pipe(llm.bindTools(
                [toolDef],
                {
                    tool_choice: { 'type': 'function', 'function': { 'name': 'route' } },
                },
            ))
            .pipe(new JsonOutputToolsParser())
            .pipe((x) => x[0].args);

        const workflow = new StateGraph({
            channels: agentStateChannels,
        });

        // Dynamically create agents and add nodes for each member
        for (const member of this.members) {
            const agent = await createAgent(member.llmConfig, member.tools, member.systemPrompt);
            const node = async (
                state: AgentStateChannels,
                config?: RunnableConfig,
            ) => {
                const result = await agent.invoke(state, config);
                return {
                    messages: [
                        new AIMessage({ content: result.output, name: member.name }),
                    ],
                    parallelResults: { [member.name]: result.output },
                };
            };
            workflow.addNode(member.name, node);
        }

        // Add aggregator node
        workflow.addNode('aggregator', async (state: AgentStateChannels) => {
            const aggregatedContent = Object.entries(state.parallelResults)
                .map(([name, result]) => `${name}: ${result}`)
                .join('\n\n');
            return {
                messages: [new AIMessage({ content: aggregatedContent, name: 'Aggregator' })],
                parallelResults: {},  // Clear parallel results after aggregation
            };
        });

        workflow.addNode('supervisor', async (state: AgentStateChannels) => {
            const result = await supervisorChain.invoke(state);
            return {
                next: result.next,
            };
        });

        // Add conditional edges for parallel execution
        workflow.addConditionalEdges(
            'supervisor',
            (x: AgentStateChannels) => {
                if (x.next === END) {
                    return [END];
                }
                return Array.isArray(x.next) ? x.next : [x.next];
            },
            {
                ...Object.fromEntries(this.members.map(m => [m.name, m.name])),
                [END]: END,
            }
        );

        // Add edges from all agent nodes to the aggregator
        this.members.forEach(member => {
            workflow.addEdge(member.name, 'aggregator');
        });

        // Add edge from aggregator to supervisor
        workflow.addEdge('aggregator', 'supervisor');

        workflow.addEdge(START, 'supervisor');

        return workflow.compile();
    }

    async processStream(
        inputs: { messages: BaseMessage[] },
        config: Partial<RunnableConfig> & { version: 'v1' | 'v2' },
    ) {
        if (!this.graph) {
            throw new Error('CollaborativeProcessor not initialized. Call initialize() first.');
        }
        const stream = this.graph.streamEvents(inputs, config);
        for await (const event of stream) {
            const handler = this.handlerRegistry.getHandler(event.event);
            if (handler) {
                handler.handle(event.event, event.data);
            }
        }
    }
}
