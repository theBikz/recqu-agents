import { ChatOllama } from '@langchain/ollama';
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock/web';
import { CustomAnthropic } from './anthropic/llm.mjs';
import { ChatOpenRouter } from './openrouter/llm.mjs';
import { Providers } from '../common/enum.mjs';

// src/llm/providers.ts
const llmProviders = {
    [Providers.OPENAI]: ChatOpenAI,
    [Providers.OLLAMA]: ChatOllama,
    [Providers.AZURE]: AzureChatOpenAI,
    [Providers.VERTEXAI]: ChatVertexAI,
    [Providers.DEEPSEEK]: ChatDeepSeek,
    [Providers.MISTRALAI]: ChatMistralAI,
    [Providers.ANTHROPIC]: CustomAnthropic,
    [Providers.OPENROUTER]: ChatOpenRouter,
    [Providers.BEDROCK_LEGACY]: BedrockChat,
    [Providers.BEDROCK]: ChatBedrockConverse,
    // [Providers.ANTHROPIC]: ChatAnthropic,
    [Providers.GOOGLE]: ChatGoogleGenerativeAI,
};
const manualToolStreamProviders = new Set([Providers.ANTHROPIC, Providers.BEDROCK, Providers.OLLAMA]);
const getChatModelClass = (provider) => {
    const ChatModelClass = llmProviders[provider];
    if (!ChatModelClass) {
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
    return ChatModelClass;
};

export { getChatModelClass, llmProviders, manualToolStreamProviders };
//# sourceMappingURL=providers.mjs.map
