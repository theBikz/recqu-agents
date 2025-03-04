// src/main_collab_global_analysis.ts
import dotenv from 'dotenv';
import { HumanMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import {
    ChatModelStreamHandler,
    LLMStreamHandler,
} from '@/stream';
import { CollaborativeProcessor, Member } from '@/collab_design_v5';
import { WeatherDataTool, TimeZoneTool, CurrencyConversionTool, IPGeolocationTool } from '@/tools/global_analysis_tools';
import { supervisorPrompt } from '@/prompts/collab';
import { GraphEvents, Providers } from '@/common';
import { setupLogging } from '@/utils/logging';

dotenv.config();

// Setup logging
setupLogging('global_analysis.log');

async function testCollaborativeGlobalAnalysis() {
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
            name: 'weather_analyst',
            systemPrompt: 'You are a weather analyst. Use the Weather Data tool to provide weather information for different cities.',
            tools: [WeatherDataTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0,
            },
        },
        {
            name: 'time_zone_expert',
            systemPrompt: 'You are a time zone expert. Use the Time Zone tool to provide time information for different locations.',
            tools: [TimeZoneTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'currency_converter',
            systemPrompt: 'You are a currency conversion expert. Use the Currency Conversion tool to convert between different currencies.',
            tools: [CurrencyConversionTool],
            llmConfig: {
                provider: Providers.OPENAI,
                modelName: 'gpt-4o',
                temperature: 0.2,
            },
        },
        {
            name: 'ip_analyst',
            systemPrompt: 'You analyze IP addresses. Use the IP Geolocation tool to provide information about IP addresses.',
            tools: [IPGeolocationTool],
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
        configurable: { thread_id: 'collaborative-global-analysis-1' },
        streamMode: 'events',
        version: 'v2',
    };

    console.log('\nCollaborative Test: Perform global analysis');

    const input = {
        messages: [new HumanMessage('Analyze the weather in New York and Tokyo, compare their time zones, convert 3500 USD to EUR, and provide geolocation information for the IP address 8.8.8.8.')],
    };

    await collaborativeProcessor.processStream(input, config);
}

async function main() {
    await testCollaborativeGlobalAnalysis();
}

main().catch(console.error);
