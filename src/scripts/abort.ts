/* eslint-disable no-console */
// src/scripts/cli.ts
import { config } from 'dotenv';
config();
import { HumanMessage, BaseMessage } from '@langchain/core/messages';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type * as t from '@/types';
import { ChatModelStreamHandler, createContentAggregator } from '@/stream';
import { ToolEndHandler } from '@/events';

import { getArgs } from '@/scripts/args';
import { Run } from '@/run';
import { GraphEvents, Callback } from '@/common';
import { getLLMConfig } from '@/utils/llmConfig';

const conversationHistory: BaseMessage[] = [];

async function testStandardStreaming(): Promise<void> {
  const { userName, location, provider, currentDate } = await getArgs();
  const { contentParts, aggregateContent } = createContentAggregator();
  const controller = new AbortController();

  const customHandlers = {
    [GraphEvents.TOOL_END]: new ToolEndHandler(),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.ON_RUN_STEP_COMPLETED]: {
      handle: (event: GraphEvents.ON_RUN_STEP_COMPLETED, data: t.StreamEventData): void => {
        console.log('====== ON_RUN_STEP_COMPLETED ======');
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
      }
    },
  };

  const llmConfig = getLLMConfig(provider);
  const signal = controller.signal;
  const run = await Run.create<t.IState>({
    runId: 'test-run-id',
    graphConfig: {
      type: 'standard',
      signal,
      llmConfig,
      tools: [new TavilySearchResults()],
      instructions: 'You are a friendly AI assistant. Always address the user by their name.',
      additional_instructions: `The user's name is ${userName} and they are located in ${location}.`,
    },
    customHandlers,
  });

  const config = {
    configurable: {
      provider,
      thread_id: 'conversation-num-1',
    },
    signal,
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('Test 1: Weather query (content parts test)');

  const userMessage = `
  Make a search for the weather in ${location} today, which is ${currentDate}.
  Make sure to always refer to me by name, which is ${userName}.
  After giving me a thorough summary, tell me a joke about the weather forecast we went over.
  `;

  conversationHistory.push(new HumanMessage(userMessage));

  const inputs = {
    messages: conversationHistory,
  };

  // Set a timeout to abort the operation after 5 seconds
  setTimeout(() => {
    controller.abort();
    console.log('Operation aborted');
    console.log('Current content parts:');
    console.dir(contentParts, { depth: null });
  }, 4000);

  try {
    const finalContentParts = await run.processStream(inputs, config);
    const finalMessages = run.getRunMessages();
    if (finalMessages) {
      conversationHistory.push(...finalMessages);
      console.dir(conversationHistory, { depth: null });
    }
    console.dir(finalContentParts, { depth: null });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      console.log('Operation was aborted');
    } else {
      console.error('An error occurred:', error);
    }
  }

  console.log('\n\n====================\n\n');
  console.dir(contentParts, { depth: null });
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  console.log('Conversation history:');
  process.exit(1);
});

testStandardStreaming().catch((err) => {
  console.error(err);
  console.log('Conversation history:');
  console.dir(conversationHistory, { depth: null });
  process.exit(1);
});