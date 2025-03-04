import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';
import { BaseMessage } from '@langchain/core/messages';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { RunnableConfig } from '@langchain/core/runnables';
import { END, START, StateGraph } from '@langchain/langgraph';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { HandlerRegistry, LLMStreamHandler, GraphStreamProcessor } from '@/proto/stream';
import type * as t from '@/types/graph';

dotenv.config();

const graphState: t.GraphStateChannels = {
    messages: {
        value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
    },
};

// Set up the tools
const tools = [new TavilySearchResults({})];

// Create the ToolNode
const toolNode = new ToolNode<{ messages: BaseMessage[] }>(tools);

// Set up the model
const model = new ChatOpenAI({ model: 'gpt-4o' });
const boundModel = model.bindTools(tools);

// Define the graph
const routeMessage = (state: t.IState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    if (!lastMessage?.tool_calls?.length) {
        return END;
    }
    return 'tools';
};

const callModel = async (
    state: t.IState,
    config?: RunnableConfig,
) => {
    const { messages } = state;
    const responseMessage = await boundModel.invoke(messages, config);
    return { messages: [responseMessage] };
};

const workflow: t.Workflow = new StateGraph<t.IState>({
    channels: graphState,
})
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', routeMessage)
    .addEdge('tools', 'agent');

const graph = workflow.compile();

// Test the streaming functionality
async function testStreaming() {
    const handlerRegistry = new HandlerRegistry();
    handlerRegistry.register('on_llm_stream', new LLMStreamHandler());

    // Register custom handlers
    handlerRegistry.register('on_llm_start', {
        handle: (event, data) => {
            console.log(event);
            console.dir(data, { depth: null });
        }
    });

    const processor = new GraphStreamProcessor(handlerRegistry);

    const config: Partial<RunnableConfig> & { version: 'v1' | 'v2', streamMode: string } = {
        configurable: { thread_id: 'conversation-num-1' },
        streamMode: 'values',
        version: 'v1' as const,
    };

    console.log('Test 1: Initial greeting');
    let inputs = { messages: [['user', 'Hi I\'m Jo.']] };
    // await processor.processStream(graph, inputs, config);
    console.log('\n');

    console.log('Test 2: Weather query');
    inputs = { messages: [['user', 'Make a search for the weather in new york today, which is 7/7/24']] };
    await processor.processStream(graph, inputs, config);
    console.log('\n');
}

testStreaming();
