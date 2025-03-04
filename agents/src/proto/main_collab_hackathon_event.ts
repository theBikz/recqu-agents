// src/main_collab_hackathon_event.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
import { EmailNotifier, FileManager, UniqueIDGenerator, DatetimeFormatter } from '@/tools/hackathon_tools';
import { supervisorPrompt } from '@/prompts/collab';
import { GraphEvents, Providers } from '@/common';
import fs from 'fs';
import util from 'util';

dotenv.config();

// Create a write stream
const logFile = fs.createWriteStream('hackathon_event.log', { flags: 'a' });

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

async function testCollaborativeHackathonEvent() {
    const customHandlers = {
        [GraphEvents.LLM_STREAM]: new LLMStreamHandler(),
        [GraphEvents.CHAT_MODEL_STREAM]: new ChatModelStreamHandler(),
        [GraphEvents.LLM_START]: {
            handle: (event: string, data: t.StreamEventData) => {
                console.log('LLM Start:', event);
            }
        },
        [GraphEvents.LLM_END]: {
            handle: (event: string, data: t.streamEventData) => {
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
            name: 'email_notifier',
            systemPrompt: 'You are responsible for sending out email notifications regarding the hackathon event.',
            tools: [EmailNotifier],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0,
            },
        },
        {
            name: 'file_manager',
            systemPrompt: 'You manage the file storage for hackathon materials. You can create, read, and delete files as needed.',
            tools: [FileManager],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'unique_id_generator',
            systemPrompt: 'You generate unique IDs for participants and teams to ensure everyone has a unique identifier.',
            tools: [UniqueIDGenerator],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'datetime_formatter',
            systemPrompt: 'You format and manipulate dates and times for scheduling purposes.',
            tools: [DatetimeFormatter],
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
        configurable: { thread_id: 'collaborative-hackathon-planning-1' },
        streamMode: 'events',
        version: 'v2',
    };

    console.log('\nCollaborative Test: Plan a hackathon event');

    const input = {
        messages: [new HumanMessage('Organize a hackathon event including sending invitations, managing files, generating unique IDs, and scheduling sessions.')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testCollaborativeHackathonEvent();
}

main().catch(console.error).finally(() => {
    logFile.end();
});
