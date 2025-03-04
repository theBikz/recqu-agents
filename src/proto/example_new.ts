import dotenv from 'dotenv';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { SqliteSaver } from '@langchain/langgraph/checkpoint/sqlite';
import { START, END, MessageGraph } from '@langchain/langgraph';
dotenv.config();

// Define the function that determines whether to continue or not
/* @ts-ignore */
function shouldContinue(messages) {
    const lastMessage = messages[messages.length - 1];
    // If there is no function call, then we finish
    if (!(lastMessage instanceof AIMessage && lastMessage.tool_calls)) {
        return END;
    } else {
        return 'action';
    }
}

// Define tools and model
const tools = [new TavilySearchResults({ maxResults: 1 })];
const model = new ChatAnthropic({ model: 'claude-3-haiku-20240307' }).bindTools(tools);

// Define the workflow
const workflow = new MessageGraph()
    .addNode('agent', model)
/* @ts-ignore */
    .addNode('action', new ToolNode(tools));

workflow.addEdge(START, 'agent');
workflow.addConditionalEdges('agent', shouldContinue);
workflow.addEdge('action', 'agent');

// Set up memory
const memory = SqliteSaver.fromConnString(':memory:');

// Compile the app
const app = workflow.compile({ checkpointer: memory, interruptBefore: ['action'] });

// Run the graph
async function runGraph() {
    const thread = { configurable: { thread_id: '4' } };

    console.log('Initial run:');
    for await (const event of await app.stream(
        [['user', 'what is the weather in sf currently']],
        { ...thread, streamMode: 'values' }
    )) {
        for (const v of event.values()) {
            console.log(v);
        }
    }

    console.log('\nResuming after interruption:');
    for await (const event of await app.stream(null, {
        ...thread,
        streamMode: 'values',
    })) {
        for (const v of event.values()) {
            console.log(v);
        }
    }
}

// Execute the graph
runGraph().catch(console.error);
