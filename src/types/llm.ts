// src/types/llm.ts
import { ChatOllama } from '@langchain/ollama';
import { ChatDeepSeek } from '@langchain/deepseek';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatBedrockConverse } from '@langchain/aws';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock/web';
import { ChatOpenAI, AzureChatOpenAI, ClientOptions as OAIClientOptions } from '@langchain/openai';
import type { BindToolsInput, BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import type { ChatOpenAIFields, OpenAIChatInput, AzureOpenAIInput } from '@langchain/openai';
import type { BedrockChatFields } from '@langchain/community/chat_models/bedrock/web';
import type { GoogleGenerativeAIChatInput } from '@langchain/google-genai';
import type { ChatVertexAIInput } from '@langchain/google-vertexai';
import type { ChatDeepSeekCallOptions } from '@langchain/deepseek';
import type { ChatBedrockConverseInput } from '@langchain/aws';
import type { ChatMistralAIInput } from '@langchain/mistralai';
import type { StructuredTool } from '@langchain/core/tools';
import type { AnthropicInput } from '@langchain/anthropic';
import type { Runnable } from '@langchain/core/runnables';
import type { ChatOllamaInput } from '@langchain/ollama';
import type { OpenAI as OpenAIClient } from 'openai';
import type { ChatOpenRouterCallOptions } from '@/llm/openrouter/llm';
import { ChatOpenRouter } from '@/llm/openrouter/llm';
import { Providers } from '@/common';

export type AzureClientOptions = (Partial<OpenAIChatInput> & Partial<AzureOpenAIInput> & {
        openAIApiKey?: string;
        openAIApiVersion?: string;
        openAIBasePath?: string;
        deploymentName?: string;
    } & BaseChatModelParams & {
        configuration?: OAIClientOptions;
    });

export type ChatOpenAIToolType = BindToolsInput | OpenAIClient.ChatCompletionTool;
export type CommonToolType = StructuredTool | ChatOpenAIToolType;

export type OpenAIClientOptions = ChatOpenAIFields;
export type OllamaClientOptions = ChatOllamaInput;
export type AnthropicClientOptions = AnthropicInput;
export type MistralAIClientOptions = ChatMistralAIInput;
export type VertexAIClientOptions = ChatVertexAIInput;
export type BedrockClientOptions = BedrockChatFields;
export type BedrockConverseClientOptions = ChatBedrockConverseInput;
export type GoogleClientOptions = GoogleGenerativeAIChatInput;
export type DeepSeekClientOptions = ChatDeepSeekCallOptions;

export type ClientOptions = OpenAIClientOptions | AzureClientOptions | OllamaClientOptions | AnthropicClientOptions | MistralAIClientOptions | VertexAIClientOptions | BedrockClientOptions | BedrockConverseClientOptions | GoogleClientOptions | DeepSeekClientOptions;

export type LLMConfig = {
  provider: Providers;
} & ClientOptions;

export type ProviderOptionsMap = {
  [Providers.AZURE]: AzureClientOptions;
  [Providers.OPENAI]: OpenAIClientOptions;
  [Providers.OLLAMA]: OllamaClientOptions;
  [Providers.GOOGLE]: GoogleClientOptions;
  [Providers.VERTEXAI]: VertexAIClientOptions;
  [Providers.DEEPSEEK]: DeepSeekClientOptions;
  [Providers.ANTHROPIC]: AnthropicClientOptions;
  [Providers.MISTRALAI]: MistralAIClientOptions;
  [Providers.OPENROUTER]: ChatOpenRouterCallOptions;
  [Providers.BEDROCK_LEGACY]: BedrockClientOptions;
  [Providers.BEDROCK]: BedrockConverseClientOptions;
};

export type ChatModelMap = {
  [Providers.OPENAI]: ChatOpenAI;
  [Providers.OLLAMA]: ChatOllama;
  [Providers.AZURE]: AzureChatOpenAI;
  [Providers.DEEPSEEK]: ChatDeepSeek;
  [Providers.VERTEXAI]: ChatVertexAI;
  [Providers.ANTHROPIC]: ChatAnthropic;
  [Providers.MISTRALAI]: ChatMistralAI;
  [Providers.OPENROUTER]: ChatOpenRouter;
  [Providers.BEDROCK_LEGACY]: BedrockChat;
  [Providers.BEDROCK]: ChatBedrockConverse;
  [Providers.GOOGLE]: ChatGoogleGenerativeAI;
};

export type ChatModelConstructorMap = {
  [P in Providers]: new (config: ProviderOptionsMap[P]) => ChatModelMap[P];
};

export type ChatModelInstance = ChatModelMap[Providers];

export type ModelWithTools = ChatModelInstance & {
  bindTools(tools: CommonToolType[]): Runnable;
}