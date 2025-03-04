/**
 * This util file contains functions for converting Anthropic messages to LangChain messages.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AIMessageChunk } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/messages/tool';
import { ChatGeneration } from '@langchain/core/outputs';
import { AnthropicMessageResponse } from '../types.js';
export declare function extractToolCalls(content: Record<string, any>[]): ToolCall[];
export declare function _makeMessageChunkFromAnthropicEvent(data: Anthropic.Messages.RawMessageStreamEvent, fields: {
    streamUsage: boolean;
    coerceContentToString: boolean;
}): {
    chunk: AIMessageChunk;
} | null;
export declare function anthropicResponseToChatMessages(messages: AnthropicMessageResponse[], additionalKwargs: Record<string, unknown>): ChatGeneration[];
