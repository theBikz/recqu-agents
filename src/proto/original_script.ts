// src/main.ts
import dotenv from 'dotenv';
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import type * as t from '@/types';
import {
  ChatModelStreamHandler,
  LLMStreamHandler,
} from '@/stream';
import { GraphEvents, Providers } from '@/common';
import { Processor } from '@/processor';

dotenv.config();

const userName = 'Jo';
const location = 'New York';
const currentDate = new Date().toLocaleString();

async function testStreaming() {
  const conversationHistory: string[][] = [];

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
          conversationHistory.push(['assistant', response]);
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
          conversationHistory.push(['assistant', response]);
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

  const llmConfig: t.LLMConfig = {
    provider: Providers.OPENAI,
    model: 'gpt-4o',
    temperature: 0.7,
  };

  // const llmConfig: t.LLMConfig = {
  //   provider: Providers.ANTHROPIC,
  //   model: 'claude-3-haiku-20240307',
  //   streaming: true,
  // };

  // const llmConfig: t.LLMConfig = {
  //   provider: Providers.MISTRALAI,
  //   model: 'mistral-large-latest',
  // };

  // const llmConfig: t.LLMConfig = {
  //   provider: Providers.VERTEXAI,
  //   modelName: 'gemini-1.5-flash-001',
  //   streaming: true,
  // };

  // const llmConfig: t.LLMConfig = {
  //   provider: Providers.BEDROCK,
  //   model: 'anthropic.claude-3-sonnet-20240229-v1:0',
  //   region: process.env.BEDROCK_AWS_REGION,
  //   credentials: {
  //     accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
  //     secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
  //   },
  // };

  const processor = new Processor({
    llmConfig,
    customHandlers,
    tools: [new TavilySearchResults({})],
  });

  const config = {
    configurable: { thread_id: 'conversation-num-1' },
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('\nTest 1: Initial greeting');

  conversationHistory.push(['user', `Hi I'm ${userName}.`]);
  let inputs = { messages: conversationHistory };
  await processor.processStream(inputs, config);

  console.log('\nTest 2: Weather query');

  const userMessage = `
  Make a search for the weather in ${location} today, which is ${currentDate}.
  Make sure to always refer to me by name.
  After giving me a thorough summary, tell me a joke about the weather forecast we went over.
  `;

  conversationHistory.push(['user', userMessage]);

  inputs = { messages: conversationHistory };
  await processor.processStream(inputs, config);

}

testStreaming();