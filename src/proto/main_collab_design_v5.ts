// src/main_collab_design_v5.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
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

// Redirect process.stdout.write
const originalStdoutWrite = process.stdout.write;
process.stdout.write = function(chunk: string | Uint8Array, encoding?: BufferEncoding, callback?: (error: Error | null | undefined) => void): boolean {
    logFile.write(chunk, encoding);
    return originalStdoutWrite.apply(process.stdout, [chunk, encoding, callback]);
} as any;

// Redirect process.stderr.write
const originalStderrWrite = process.stderr.write;
process.stderr.write = function(chunk: string | Uint8Array, encoding?: BufferEncoding, callback?: (error: Error | null | undefined) => void): boolean {
    logFile.write(chunk, encoding);
    return originalStderrWrite.apply(process.stderr, [chunk, encoding, callback]);
} as any;

async function testCollaborativeStreaming() {
    const customHandlers = {
        [GraphEvents.LLM_STREAM]: new LLMStreamHandler(),
        [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
        [GraphEvents.LLM_START]: {
            handle: (event: string, data: t.StreamEventData) => {
                console.log('LLM Start:', event);
                // console.dir(data, { depth: null });
            }
        },
        [GraphEvents.LLM_END]: {
            handle: (event: string, data: t.StreamEventData) => {
                console.log('LLM End:', event);
                // console.dir(data, { depth: null });
            }
        },
        [GraphEvents.CHAT_MODEL_END]: {
            handle: (event: string, data: t.StreamEventData) => {
                console.log('Chat Model End:', event);
                // console.dir(data, { depth: null });
            }
        },
        [GraphEvents.TOOL_END]: {
            handle: (event: string, data: t.StreamEventData) => {
                console.log('Tool End:', event);
                console.dir(data, { depth: null });
            }
        },
    };

    const members: Member[] = [
        {
            name: 'researcher',
            systemPrompt: 'You are a web researcher. You may use the Tavily search engine to search the web for important information, so the Chart Generator in your team can make useful plots.',
            tools: [tavilyTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0,
            },
        },
        {
            name: 'chart_generator',
            systemPrompt: 'You excel at generating bar charts. Use the researcher\'s information to generate the charts.',
            tools: [chartTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
    ];

    const supervisorConfig = {
        systemPrompt: supervisorPrompt,
        llmConfig: {
            provider: Providers.OPENAI,
            modelName: 'gpt-4o',
            temperature: 0,
        },
    };

    const collaborativeProcessor = new CollaborativeProcessor(members, supervisorConfig, customHandlers);
    await collaborativeProcessor.initialize();

    const config = {
        configurable: { thread_id: 'collaborative-conversation-1' },
        streamMode: 'values',
        version: 'v2' as const,
    };

    console.log('\nCollaborative Test: Create a chart');

    const input = {
        messages: [new HumanMessage('Create a chart showing the population growth of the top 5 most populous countries over the last 50 years.')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testCollaborativeStreaming();
}

main().catch(console.error).finally(() => {
    logFile.end();
});
