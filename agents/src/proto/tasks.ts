import fs from 'fs';
import util from 'util';
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
  ChatModelStreamHandler,
} from '@/stream';
import { Processor } from '@/processor';
import { taskManagerPrompt } from '@/prompts/taskmanager';
import { tavilyTool, chartTool } from '@/tools/example';
import { GraphEvents, Providers } from '@/common';

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

async function testTaskManagerStreaming() {
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

  const processor = await Processor.create<TaskManagerStateChannels>({
    graphConfig: {
      type: 'taskmanager',
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
        systemPrompt: taskManagerPrompt,
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
    configurable: { thread_id: 'taskmanager-conversation-1' },
    streamMode: 'values',
    version: 'v2' as const,
  };

  console.log('\nTaskManager Test: Create a chart');

  const input = {
    messages: [new HumanMessage('Create a chart showing the population growth of the top 5 most populous countries over the last 50 years.')],
  };

  await processor.processStream(input, config);
}

async function main() {
  await testTaskManagerStreaming();
}

main().catch(console.error).finally(() => {
  logFile.end();
});
