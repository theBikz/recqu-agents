// src/main_philosophical_cafe.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
import { GraphEvents, Providers } from '@/common';
import fs from 'fs';
import util from 'util';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

dotenv.config();

// Create a write stream
const logFile = fs.createWriteStream('philosophical_cafe.log', { flags: 'a' });

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

// Define tools for thinking and speaking
const ThinkTool = new DynamicStructuredTool({
    name: 'think',
    description: 'Think about the current topic or situation.',
    schema: z.object({
        thought: z.string().describe('The character\'s internal thought'),
    }),
    func: async ({ thought }) => {
        return `[Thinking: ${thought}]`;
    }
});

const SpeakTool = new DynamicStructuredTool({
    name: 'speak',
    description: 'Say something out loud in the conversation.',
    schema: z.object({
        speech: z.string().describe('What the character says out loud'),
    }),
    func: async ({ speech }) => {
        return speech;
    }
});

async function testPhilosophicalCafe() {
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

    // Define the fictional cafe patrons
    const members: Member[] = [
        {
            name: 'Luna',
            systemPrompt: 'You are Luna, a free-spirited artist with a penchant for existential questions. You often challenge conventional wisdom and believe in the power of individual expression. Speak casually and use artistic metaphors. Always either think or speak each turn, sometimes both.',
            tools: [ThinkTool, SpeakTool],
            llmConfig: {
                provider: Providers.BEDROCK,
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                region: process.env.BEDROCK_AWS_REGION,
                credentials: {
                    accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
                },
            },
        },
        {
            name: 'Zephyr',
            systemPrompt: 'You are Zephyr, a tech-savvy futurist who believes in the potential of technology to solve human problems. You\'re optimistic but also concerned about ethical implications. Use tech jargon and futuristic concepts in your speech. Always either think or speak each turn, sometimes both.',
            tools: [ThinkTool, SpeakTool],
            llmConfig: {
                provider: Providers.BEDROCK,
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                region: process.env.BEDROCK_AWS_REGION,
                credentials: {
                    accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
                },
            },
        },
        {
            name: 'Sage',
            systemPrompt: 'You are Sage, a retired professor with a dry sense of humor. You\'re skeptical of grand theories and prefer practical wisdom. Your speech is peppered with historical references and gentle sarcasm. Always either think or speak each turn, sometimes both.',
            tools: [ThinkTool, SpeakTool],
            llmConfig: {
                provider: Providers.BEDROCK,
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                region: process.env.BEDROCK_AWS_REGION,
                credentials: {
                    accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
                },
            },
        },
        {
            name: 'Nova',
            systemPrompt: 'You are Nova, an enthusiastic environmental activist with a background in quantum physics. You see interconnections everywhere and often draw parallels between natural systems and human behavior. Your speech is energetic and filled with scientific analogies. Always either think or speak each turn, sometimes both.',
            tools: [ThinkTool, SpeakTool],
            llmConfig: {
                provider: Providers.BEDROCK,
                model: 'anthropic.claude-3-sonnet-20240229-v1:0',
                region: process.env.BEDROCK_AWS_REGION,
                credentials: {
                    accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
                },
            },
        },
    ];

    const supervisorPrompt = `
You are the author orchestrating a casual, candid conversation between {members} at a local cafe. Your role is to guide the flow of the conversation.

Consider the following:
1. Encourage natural, overlapping dialogue. Characters can interrupt or talk over each other.
2. Ensure all characters are actively participating by either speaking or thinking in each turn.
3. Introduce unexpected elements or topics to keep the conversation lively and unpredictable.
4. Allow for moments of humor, disagreement, or sudden insights.
5. Keep the tone casual and fitting for a cafe setting.
6. Multiple tools can be run at once.

Remember, you're crafting a scene, not moderating a debate. Let the characters' personalities shine through their interactions.
`;

    const supervisorConfig = {
        systemPrompt: supervisorPrompt,
        llmConfig: {
            provider: Providers.BEDROCK,
            model: 'anthropic.claude-3-sonnet-20240229-v1:0',
            region: process.env.BEDROCK_AWS_REGION,
            credentials: {
                accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
            },
        },
    };

    const collaborativeProcessor = new CollaborativeProcessor(members, supervisorConfig, customHandlers);
    await collaborativeProcessor.initialize();

    const config = {
        configurable: { thread_id: 'philosophical-cafe-1' },
        streamMode: 'events',
        version: 'v2',
    };

    console.log('\nCafe: A Chance Encounter');

    const input = {
        messages: [new HumanMessage('It\'s a rainy Tuesday afternoon at a Cafe. Luna, Zephyr, Sage, and Nova find themselves sharing a table due to the crowded conditions. The aroma of coffee fills the air as a heated debate about the nature of reality unfolds at a nearby table. What happens next?')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testPhilosophicalCafe();
}

main().catch(console.error).finally(() => {
    logFile.end();
});
