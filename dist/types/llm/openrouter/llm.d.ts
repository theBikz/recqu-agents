import { ChatOpenAI } from '@langchain/openai';
import type { ChatOpenAICallOptions, OpenAIClient } from '@langchain/openai';
import type { AIMessageChunk, HumanMessageChunk, SystemMessageChunk, FunctionMessageChunk, ToolMessageChunk, ChatMessageChunk } from '@langchain/core/messages';
export interface ChatOpenRouterCallOptions extends ChatOpenAICallOptions {
    include_reasoning?: boolean;
}
export declare class ChatOpenRouter extends ChatOpenAI<ChatOpenRouterCallOptions> {
    constructor(_fields: Partial<ChatOpenRouterCallOptions>);
    protected _convertOpenAIDeltaToBaseMessageChunk(delta: Record<string, any>, rawResponse: OpenAIClient.ChatCompletionChunk, defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'): AIMessageChunk | HumanMessageChunk | SystemMessageChunk | FunctionMessageChunk | ToolMessageChunk | ChatMessageChunk;
}
