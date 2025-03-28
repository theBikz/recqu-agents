/**
 * This util file contains functions for converting LangChain messages to Anthropic messages.
 */
import { BaseMessage } from '@langchain/core/messages';
import { ToolCall } from '@langchain/core/messages/tool';
import type { AnthropicToolResponse, AnthropicMessageCreateParams } from '@/llm/anthropic/types';
export declare function _convertLangChainToolCallToAnthropic(toolCall: ToolCall): AnthropicToolResponse;
/**
 * Formats messages as a prompt for the model.
 * Used in LangSmith, export is important here.
 * @param messages The base messages to format as a prompt.
 * @returns The formatted prompt.
 */
export declare function _convertMessagesToAnthropicPayload(messages: BaseMessage[]): AnthropicMessageCreateParams;
