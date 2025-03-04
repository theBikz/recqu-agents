// src/scripts/cli.ts
import { config } from 'dotenv';
config();
import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type * as t from '@/types';
import { ChatModelStreamHandler, createContentAggregator } from '@/stream';
import { ToolEndHandler, ModelEndHandler, createMetadataAggregator } from '@/events';
import { createCodeExecutionTool } from '@/tools/CodeExecutor';
import { getLLMConfig } from '@/utils/llmConfig';
import { getArgs } from '@/scripts/args';
import { GraphEvents } from '@/common';
import { Run } from '@/run';

const conversationHistory: BaseMessage[] = [];

async function testCodeExecution(): Promise<void> {
  const { userName, location, provider, currentDate } = await getArgs();
  const { contentParts, aggregateContent } = createContentAggregator();
  const customHandlers = {
    [GraphEvents.TOOL_END]: new ToolEndHandler(),
    [GraphEvents.CHAT_MODEL_END]: new ModelEndHandler(),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      handle: (event: GraphEvents.ON_RUN_STEP_COMPLETED, data: t.StreamEventData): void => {
        console.log('====== ON_RUN_STEP_COMPLETED ======');
        console.dir(data, { depth: null });
        aggregateContent({ event, data: data as unknown as { result: t.ToolEndEvent } });
      }
    },
    [GraphEvents.ON_RUN_STEP]: {
      handle: (event: GraphEvents.ON_RUN_STEP, data: t.StreamEventData): void => {
        console.log('====== ON_RUN_STEP ======');
        console.dir(data, { depth: null });
        aggregateContent({ event, data: data as t.RunStep });
      }
    },
    [GraphEvents.ON_RUN_STEP_DELTA]: {
      handle: (event: GraphEvents.ON_RUN_STEP_DELTA, data: t.StreamEventData): void => {
        console.log('====== ON_RUN_STEP_DELTA ======');
        console.dir(data, { depth: null });
        aggregateContent({ event, data: data as t.RunStepDeltaEvent });
      }
    },
    [GraphEvents.ON_MESSAGE_DELTA]: {
      handle: (event: GraphEvents.ON_MESSAGE_DELTA, data: t.StreamEventData): void => {
        console.log('====== ON_MESSAGE_DELTA ======');
        console.dir(data, { depth: null });
        aggregateContent({ event, data: data as t.MessageDeltaEvent });
      }
    },
    [GraphEvents.TOOL_START]: {
      handle: (_event: string, data: t.StreamEventData, metadata?: Record<string, unknown>): void => {
        console.log('====== TOOL_START ======');
        console.dir(data, { depth: null });
      }
    },
  };

  const llmConfig = getLLMConfig(provider);

  const run = await Run.create<t.IState>({
    runId: 'message-num-1',
    graphConfig: {
      type: 'standard',
      llmConfig,
      tools: [new TavilySearchResults(), createCodeExecutionTool()],
      instructions: 'You are a friendly AI assistant with coding capabilities. Always address the user by their name.',
      additional_instructions: `The user's name is ${userName} and they are located in ${location}.`,
    },
    returnContent: true,
    customHandlers,
  });

  const config = {
    configurable: {
      provider,
      thread_id: 'conversation-num-1',
    },
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('Test 1: Simple Code Execution');

  const userMessage1 = `how much memory is this (its in bytes) in MB? 31192000`;
  // const userMessage1 = `can you show me a good use case for rscript by running some code`;

  conversationHistory.push(new HumanMessage(userMessage1));

  let inputs = {
    messages: conversationHistory,
  };
  const finalContentParts1 = await run.processStream(inputs, config);
  const finalMessages1 = run.getRunMessages();
  if (finalMessages1) {
    conversationHistory.push(...finalMessages1);
  }
  console.log('\n\n====================\n\n');
  console.dir(contentParts, { depth: null });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Conversation history:');
  console.dir(conversationHistory, { depth: null });
  process.exit(1);
});

testCodeExecution().catch((err) => {
  console.error(err);
  console.log('Conversation history:');
  console.dir(conversationHistory, { depth: null });
  process.exit(1);
});