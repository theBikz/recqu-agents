// src/llm/providers.ts
import { ChatOllama } from '@langchain/ollama';
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatBedrockConverse } from '@langchain/aws';
// import { ChatAnthropic } from '@langchain/anthropic';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock/web';
import type { ChatModelConstructorMap, ProviderOptionsMap, ChatModelMap } from '@/types';
import { CustomAnthropic } from '@/llm/anthropic/llm';
import { ChatOpenRouter } from '@/llm/openrouter/llm';
import { Providers } from '@/common';

export const llmProviders: Partial<ChatModelConstructorMap> = {
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

export const manualToolStreamProviders = new Set<Providers | string>([Providers.ANTHROPIC, Providers.BEDROCK, Providers.OLLAMA]);

export const getChatModelClass = <P extends Providers>(
  provider: P
): new (config: ProviderOptionsMap[P]) => ChatModelMap[P] => {
  const ChatModelClass = llmProviders[provider];
  if (!ChatModelClass) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  return ChatModelClass;
};