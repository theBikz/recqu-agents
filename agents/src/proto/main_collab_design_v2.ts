// src/collaborative_main.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
import { tavilyTool, chartTool } from '@/tools/example';
import { GraphEvents, Providers } from '@/common';

dotenv.config();

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
                // console.dir(data, { depth: null });
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

    const collaborativeProcessor = new CollaborativeProcessor(members, {
        llmConfig: {
            provider: Providers.OPENAI,
            modelName: 'gpt-4o',
            temperature: 0.5,
        },
    }, customHandlers);
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

main().catch(console.error);
