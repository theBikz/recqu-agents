// src/main_collaborative.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
  ChatModelStreamHandler,
  LLMStreamHandler,
} from '@/stream';
import { Processor } from '@/processor';
import { AgentStateChannels } from '@/graphs/CollabGraph';
import { tavilyTool, chartTool } from '@/tools/example';
import { supervisorPrompt } from '@/prompts/collab';
import { GraphEvents, Providers } from '@/common';
import fs from 'fs';
import util from 'util';

dotenv.config();

// Create a write stream
const logFile = fs.createWriteStream('output.log', { flags: 'a' });

// Redirect console.log and console.error
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  logFile.write(util.format.apply(null, args) + '\n');
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  logFile.write(util.format.apply(null, args) + '\n');
  originalConsoleError.apply(console, args);
};

async function testCollaborativeStreaming() {
  const customHandlers = {
    [GraphEvents.LLM_STREAM]: new LLMStreamHandler(),
    [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
    [GraphEvents.LLM_START]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.log('LLM Start:', event);
      }
    },
    [GraphEvents.LLM_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.log('LLM End:', event);
      }
    },
    [GraphEvents.CHAT_MODEL_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.log('Chat Model End:', event);
      }
    },
    [GraphEvents.TOOL_END]: {
      handle: (event: string, data: t.StreamEventData) => {
        console.log('Tool End:', event);
        console.dir(data, { depth: null });
      }
    },
  };

  const processor = await Processor.create<AgentStateChannels>({
    graphConfig: {
      type: 'collaborative',
      members: [
        {
          name: 'researcher',
          systemPrompt: 'You are a web researcher. You may use the Tavily search engine to search the web for important information, so the Chart Generator in your team can make useful plots.',
          tools: [tavilyTool],
          llmConfig: {
            provider: Providers.OPENAI,

            model: 'gpt-4o',
            temperature: 0,
          },
        },
        {
          name: 'chart_generator',
          systemPrompt: 'You excel at generating bar charts. Use the researcher\'s information to generate the charts.',
          tools: [chartTool],
          llmConfig: {
            provider: Providers.OPENAI,

            model: 'gpt-4o',
            temperature: 0.2,
          },
        },
      ],
      supervisorConfig: {
        systemPrompt: supervisorPrompt,
        llmConfig: {
          provider: Providers.OPENAI,
          model: 'gpt-4o',
          temperature: 0,
        },
      },
    },
    customHandlers,
  });

  const config = {
    configurable: { thread_id: 'collaborative-conversation-1' },
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('\nCollaborative Test: Create a chart');

  const input = {
    messages: [new HumanMessage('Create a chart showing the population growth of the top 5 most populous countries over the last 50 years.')],
  };

  await processor.processStream(input, config);
}

async function main() {
  await testCollaborativeStreaming();
}

main().catch(console.error).finally(() => {
  logFile.end();
});
