// src/main_standard.ts
import dotenv from 'dotenv';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type * as t from '@/types';
import {
  ChatModelStreamHandler,
  LLMStreamHandler,
} from '@/stream';
import { GraphEvents, Providers } from '@/common';
import { Processor } from '@/processor';
import { HumanMessage, BaseMessage } from '@langchain/core/messages';

dotenv.config();

const userName = 'Jo';
const location = 'New York';
const currentDate = new Date().toLocaleString();

async function testStandardStreaming() {
  const conversationHistory: BaseMessage[] = [];

  const customHandlers = {
    [GraphEvents.LLM_STREAM]: new LLMStreamHandler(),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.LLM_START]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.dir(data, { depth: null });
      }
    },
    [GraphEvents.LLM_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.dir(data, { depth: null });

        const response = data.output.generations[0][0].message.content;

        if (response.trim() !== '') {
          conversationHistory.push(new HumanMessage(response));
          console.log('Updated conversation history:', conversationHistory);
        }
      }
    },
    [GraphEvents.CHAT_MODEL_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        const response = data?.output?.content;

        if (Array.isArray(response)) {
          console.dir(response, { depth: null });
        } else if (typeof response === 'string' && response.trim() !== '') {
          conversationHistory.push(new HumanMessage(response));
          console.log('Updated conversation history:', conversationHistory);
        }
      }
    },
    [GraphEvents.TOOL_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.dir(data, { depth: null });
      }
    },
  };

  const processor = await Processor.create<t.IState>({
    graphConfig: {
      type: 'standard',
      llmConfig: {
        provider: Providers.OPENAI,
        model: 'gpt-4',
        temperature: 0.7,
      },
      tools: [new TavilySearchResults({})],
    },
    customHandlers,
  });

  const config = {
    configurable: { thread_id: 'conversation-num-1' },
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('\nTest 1: Initial greeting');

  conversationHistory.push(new HumanMessage(`Hi I'm ${userName}.`));
  let inputs = { messages: conversationHistory };
  await processor.processStream(inputs, config);

  console.log('\nTest 2: Weather query');

  const userMessage = `
  Make a search for the weather in ${location} today, which is ${currentDate}.
  Make sure to always refer to me by name.
  After giving me a thorough summary, tell me a joke about the weather forecast we went over.
  `;

  conversationHistory.push(new HumanMessage(userMessage));

  inputs = { messages: conversationHistory };
  await processor.processStream(inputs, config);
}

testStandardStreaming();
