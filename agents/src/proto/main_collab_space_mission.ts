// src/main_collab_space_mission.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
import { NasaAPODTool, ISSLocationTool, LaunchScheduleTool, MissionIDGenerator } from '@/tools/space_mission_tools';
import { supervisorPrompt } from '@/prompts/collab';
import { GraphEvents, Providers } from '@/common';
import fs from 'fs';
import util from 'util';

dotenv.config();

// Create a write stream
const logFile = fs.createWriteStream('space_mission.log', { flags: 'a' });

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

async function testCollaborativeSpaceMission() {
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
            name: 'astronomy_expert',
            systemPrompt: 'You are an astronomy expert. Use the NASA APOD tool to provide interesting astronomical information for the mission.',
            tools: [NasaAPODTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0,
            },
        },
        {
            name: 'iss_tracker',
            systemPrompt: 'You track the International Space Station. Use the ISS Location tool to provide updates on its position.',
            tools: [ISSLocationTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'launch_coordinator',
            systemPrompt: 'You coordinate space launches. Use the Launch Schedule tool to plan mission launches around other scheduled events.',
            tools: [LaunchScheduleTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'mission_id_assigner',
            systemPrompt: 'You assign unique IDs to space missions. Use the Mission ID Generator to create identifiers for new missions.',
            tools: [MissionIDGenerator],
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
        configurable: { thread_id: 'collaborative-space-mission-planning-1' },
        streamMode: 'events',
        version: 'v2',
    };

    console.log('\nCollaborative Test: Plan a space mission');

    const input = {
        messages: [new HumanMessage('Plan a space mission to observe a newly discovered exoplanet. Consider astronomical events, ISS positioning, launch schedules, and assign a unique mission ID.')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testCollaborativeSpaceMission();
}

main().catch(console.error).finally(() => {
    logFile.end();
});
