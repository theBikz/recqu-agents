// src/main_collab_community_event.ts
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
const logFile = fs.createWriteStream('event_log.log', { flags: 'a' });

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

async function testCollaborativeCommunityEvent() {
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

    // Define the collaborative members
    const members: Member[] = [
        {
            name: 'resource_finder',
            systemPrompt: 'You are a resource finder. You utilize the Tavily search engine to gather necessary resources and contacts needed for the community event.',
            tools: [tavilyTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0,
            },
        },
        {
            name: 'event_scheduler',
            systemPrompt: 'You are an event scheduler. You manage the timeline of the event activities using the Chart Generator to visualize the schedule.',
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
        configurable: { thread_id: 'collaborative-event-planning-1' },
        streamMode: 'events',
        version: 'v2',
    };

    console.log('\nCollaborative Test: Plan a community event');

    const input = {
        messages: [new HumanMessage('Plan a community fair including activities for all ages, food vendors, and a performance stage.')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testCollaborativeCommunityEvent();
}

main().catch(console.error).finally(() => {
    logFile.end();
});
