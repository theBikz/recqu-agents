'use strict';

var ollama = require('@langchain/ollama');
var deepseek = require('@langchain/deepseek');
var mistralai = require('@langchain/mistralai');
var aws = require('@langchain/aws');
var googleVertexai = require('@langchain/google-vertexai');
var openai = require('@langchain/openai');
var googleGenai = require('@langchain/google-genai');
var web = require('@langchain/community/chat_models/bedrock/web');
var llm$1 = require('./anthropic/llm.cjs');
var llm = require('./openrouter/llm.cjs');
var _enum = require('../common/enum.cjs');

// src/llm/providers.ts
const llmProviders = {
    [_enum.Providers.OPENAI]: openai.ChatOpenAI,
    [_enum.Providers.OLLAMA]: ollama.ChatOllama,
    [_enum.Providers.AZURE]: openai.AzureChatOpenAI,
    [_enum.Providers.VERTEXAI]: googleVertexai.ChatVertexAI,
    [_enum.Providers.DEEPSEEK]: deepseek.ChatDeepSeek,
    [_enum.Providers.MISTRALAI]: mistralai.ChatMistralAI,
    [_enum.Providers.ANTHROPIC]: llm$1.CustomAnthropic,
    [_enum.Providers.OPENROUTER]: llm.ChatOpenRouter,
    [_enum.Providers.BEDROCK_LEGACY]: web.BedrockChat,
    [_enum.Providers.BEDROCK]: aws.ChatBedrockConverse,
    // [Providers.ANTHROPIC]: ChatAnthropic,
    [_enum.Providers.GOOGLE]: googleGenai.ChatGoogleGenerativeAI,
};
const manualToolStreamProviders = new Set([_enum.Providers.ANTHROPIC, _enum.Providers.BEDROCK, _enum.Providers.OLLAMA]);
const getChatModelClass = (provider) => {
    const ChatModelClass = llmProviders[provider];
    if (!ChatModelClass) {
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
    return ChatModelClass;
};

exports.getChatModelClass = getChatModelClass;
exports.llmProviders = llmProviders;
exports.manualToolStreamProviders = manualToolStreamProviders;
//# sourceMappingURL=providers.cjs.map
