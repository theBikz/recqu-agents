// src/collab.ts
import 'dotenv/config';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { END, StateGraphArgs, START, StateGraph } from '@langchain/langgraph';
import { chartTool, tavilyTool } from '@/tools/example';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from '@langchain/core/prompts';
import { ChatOpenAI } from '@langchain/openai';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { JsonOutputToolsParser } from 'langchain/output_parsers';
import { HandlerRegistry } from '@/events';

interface AgentStateChannels {
  messages: BaseMessage[];
  next: string;
}

export class CollaborativeProcessor {
    private graph: Runnable | null = null;
    private handlerRegistry: HandlerRegistry;

    constructor(customHandlers?: Record<string, any>) {
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
                value: (x?: string, y?: string) => y ?? x ?? END,
                default: () => END,
            },
        };

        async function createAgent(
            llm: ChatOpenAI,
            tools: any[],
            systemPrompt: string
        ): Promise<AgentExecutor> {
            const prompt = await ChatPromptTemplate.fromMessages([
                ['system', systemPrompt],
                new MessagesPlaceholder('messages'),
                new MessagesPlaceholder('agent_scratchpad'),
            ]);
            const agent = await createOpenAIToolsAgent({ llm, tools, prompt });
            return new AgentExecutor({ agent, tools });
        }

        const members = ['researcher', 'chart_generator'];

        const systemPrompt =
      'You are a supervisor tasked with managing a conversation between the' +
      ' following workers: {members}. Given the following user request,' +
      ' respond with the worker to act next. Each worker will perform a' +
      ' task and respond with their results and status. When finished,' +
      ' respond with FINISH.';
        const options = [END, ...members];

        const functionDef = {
            name: 'route',
            description: 'Select the next role.',
            parameters: {
                title: 'routeSchema',
                type: 'object',
                properties: {
                    next: {
                        title: 'Next',
                        anyOf: [
                            { enum: options },
                        ],
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
        ' Or should we FINISH? Select one of: {options}',
            ],
        ]);

        const formattedPrompt = await prompt.partial({
            options: options.join(', '),
            members: members.join(', '),
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
            .pipe((x) => (x[0].args));

        const researcherAgent = await createAgent(
            llm,
            [tavilyTool],
            'You are a web researcher. You may use the Tavily search engine to search the web for' +
        ' important information, so the Chart Generator in your team can make useful plots.',
        );

        const researcherNode = async (
            state: AgentStateChannels,
            config?: RunnableConfig,
        ) => {
            const result = await researcherAgent.invoke(state, config);
            return {
                messages: [
                    new HumanMessage({ content: result.output, name: 'Researcher' }),
                ],
            };
        };

        const chartGenAgent = await createAgent(
            llm,
            [chartTool],
            'You excel at generating bar charts. Use the researcher\'s information to generate the charts.',
        );

        const chartGenNode = async (
            state: AgentStateChannels,
            config?: RunnableConfig,
        ) => {
            const result = await chartGenAgent.invoke(state, config);
            return {
                messages: [
                    new HumanMessage({ content: result.output, name: 'ChartGenerator' }),
                ],
            };
        };

        const workflow = new StateGraph({
            channels: agentStateChannels,
        })
            .addNode('researcher', researcherNode)
            .addNode('chart_generator', chartGenNode)
            .addNode('supervisor', supervisorChain);

        members.forEach((member) => {
            workflow.addEdge(member, 'supervisor');
        });

        workflow.addConditionalEdges(
            'supervisor',
            (x: AgentStateChannels) => x.next,
        );

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
        const stream = await this.graph.streamEvents(inputs, config);
        for await (const event of stream) {
            const handler = this.handlerRegistry.getHandler(event.event);
            if (handler) {
                handler.handle(event.event, event.data);
            }
        }
    }
}
