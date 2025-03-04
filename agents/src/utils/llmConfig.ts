// src/utils/llmConfig.ts
import { Providers } from '@/common';
import type * as or from '@/llm/openrouter/llm';
import type * as t from '@/types';

export const llmConfigs: Record<string, t.LLMConfig | undefined> = {
  [Providers.OPENAI]: {
    provider: Providers.OPENAI,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    streaming: true,
    streamUsage: true,
    // disableStreaming: true,
  },
  alibaba: {
    provider: Providers.OPENAI,
    streaming: true,
    streamUsage: true,
    model: 'qwen-max',
    openAIApiKey: process.env.ALIBABA_API_KEY,
    configuration: {
      baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    },
  },
  [Providers.OPENROUTER]: {
    provider: Providers.OPENROUTER,
    streaming: true,
    streamUsage: true,
    model: 'deepseek/deepseek-r1',
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: process.env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
      },
    },
    include_reasoning: true,
  } as or.ChatOpenRouterCallOptions & t.LLMConfig,
  [Providers.AZURE]: {
    provider: Providers.AZURE,
    temperature: 0.7,
    streaming: true,
    streamUsage: true,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    model: process.env.AZURE_MODEL_NAME ?? 'gpt-4o',
  },
  [Providers.OLLAMA]: {
    provider: Providers.OLLAMA,
    model: 'llama3.2',
    streaming: true,
    streamUsage: true,
    baseUrl: 'http://host.docker.internal:11434'
  },
  [Providers.DEEPSEEK]: {
    provider: Providers.DEEPSEEK,
    model: 'deepseek-reasoner',
    streaming: true,
    streamUsage: true,
  },
  [Providers.ANTHROPIC]: {
    provider: Providers.ANTHROPIC,
    model: 'claude-3-5-sonnet-20240620',
    streaming: true,
    streamUsage: true,
  },
  [Providers.MISTRALAI]: {
    provider: Providers.MISTRALAI,
    model: 'mistral-large-latest',
    streaming: true,
    streamUsage: true,
  },
  [Providers.VERTEXAI]: {
    provider: Providers.VERTEXAI,
    modelName: 'gemini-2.0-flash-exp',
    streaming: true,
    streamUsage: true,
    keyFile: process.env.VERTEXAI_KEY_FILE,
  } as t.VertexAIClientOptions & t.LLMConfig,
  [Providers.GOOGLE]: {
    provider: Providers.GOOGLE,
    model: 'gemini-2.0-flash-exp',
    streaming: true,
    streamUsage: true,
  },
  [Providers.BEDROCK]: {
    provider: Providers.BEDROCK,
    // model: 'anthropic.claude-3-sonnet-20240229-v1:0',
    model: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    region: process.env.BEDROCK_AWS_REGION,
    credentials: {
      accessKeyId: process.env.BEDROCK_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.BEDROCK_AWS_SECRET_ACCESS_KEY!,
    },
    streaming: true,
    streamUsage: true,
  },
  perplexity: {
    provider: Providers.OPENAI,
    model: 'llama-3.1-sonar-small-128k-online',
    streaming: true,
    streamUsage: true,
    apiKey: process.env.PERPLEXITY_API_KEY,
    configuration: {
      baseURL: 'https://api.perplexity.ai/',
    }
  },
};

export function getLLMConfig(provider: string): t.LLMConfig {
  const config = llmConfigs[provider];
  if (config === undefined) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return config;
}
