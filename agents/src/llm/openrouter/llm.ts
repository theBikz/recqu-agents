import { ChatOpenAI } from '@langchain/openai';
import type { ChatOpenAICallOptions, OpenAIClient } from '@langchain/openai';
import type { AIMessageChunk, HumanMessageChunk, SystemMessageChunk, FunctionMessageChunk, ToolMessageChunk, ChatMessageChunk} from '@langchain/core/messages';
export interface ChatOpenRouterCallOptions extends ChatOpenAICallOptions {
  include_reasoning?: boolean;
}
export class ChatOpenRouter extends ChatOpenAI<ChatOpenRouterCallOptions> {
  constructor(_fields: Partial<ChatOpenRouterCallOptions>) {
    const { include_reasoning, ...fields } = _fields;
    super({
      ...fields,
      modelKwargs: {
        include_reasoning,
      }
    });
  }
  protected override _convertOpenAIDeltaToBaseMessageChunk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delta: Record<string, any>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?:
    | 'function'
    | 'user'
    | 'system'
    | 'developer'
    | 'assistant'
    | 'tool'
  ): AIMessageChunk | HumanMessageChunk | SystemMessageChunk | FunctionMessageChunk | ToolMessageChunk | ChatMessageChunk {
    const messageChunk = super._convertOpenAIDeltaToBaseMessageChunk(
      delta,
      rawResponse,
      defaultRole
    );
    messageChunk.additional_kwargs.reasoning = delta.reasoning;
    return messageChunk;
  }
}