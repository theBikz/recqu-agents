// eslint-disable-next-line import/no-named-as-default
import Anthropic from '@anthropic-ai/sdk';
import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources';
import { BindToolsInput } from '@langchain/core/language_models/chat_models';

export type AnthropicToolResponse = {
  type: 'tool_use';
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>;
};

export type AnthropicMessageParam = Anthropic.MessageParam;
export type AnthropicMessageDeltaEvent= Anthropic.MessageDeltaEvent;
export type AnthropicMessageStartEvent= Anthropic.MessageStartEvent;
export type AnthropicMessageResponse =
  | Anthropic.ContentBlock
  | AnthropicToolResponse;
export type AnthropicMessageCreateParams =
  Anthropic.MessageCreateParamsNonStreaming;
export type AnthropicStreamingMessageCreateParams =
  Anthropic.MessageCreateParamsStreaming;
export type AnthropicMessageStreamEvent = Anthropic.MessageStreamEvent;
export type AnthropicRequestOptions = Anthropic.RequestOptions;
export type AnthropicToolChoice =
  | {
      type: 'tool';
      name: string;
    }
  | 'any'
  | 'auto'
  | 'none'
  | string;
export type ChatAnthropicToolType = AnthropicTool | BindToolsInput;
export type AnthropicTextBlockParam = Anthropic.Messages.TextBlockParam;
export type AnthropicImageBlockParam = Anthropic.Messages.ImageBlockParam;
export type AnthropicToolUseBlockParam = Anthropic.Messages.ToolUseBlockParam;
export type AnthropicToolResultBlockParam =
  Anthropic.Messages.ToolResultBlockParam;

/**
 * Stream usage information for Anthropic API calls
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#pricing
 */
export interface AnthropicStreamUsage {
  /**
   * The number of input tokens used in the request
   */
  input_tokens: number;

  /**
   * The number of cache creation input tokens used (write operations)
   */
  cache_creation_input_tokens?: number;

  /**
   * The number of cache input tokens used (read operations)
   */
  cache_read_input_tokens?: number;

  /**
   * The number of output tokens generated in the response
   */
  output_tokens: number;
  /**
   * The total number of tokens generated in the response
   */
  total_tokens: number;
}