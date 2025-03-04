import { AIMessageChunk } from '@langchain/core/messages';
import { ChatAnthropicMessages } from '@langchain/anthropic';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { BaseMessage, MessageContentComplex } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { AnthropicInput } from '@langchain/anthropic';
import type { AnthropicMessageCreateParams, AnthropicStreamUsage, AnthropicMessageStartEvent, AnthropicMessageDeltaEvent } from '@/llm/anthropic/types';
import { _makeMessageChunkFromAnthropicEvent } from './utils/message_outputs';
import { _convertMessagesToAnthropicPayload } from './utils/message_inputs';
import { TextStream } from '@/llm/text';

function _toolsInParams(params: AnthropicMessageCreateParams): boolean {
  return !!(params.tools && params.tools.length > 0);
}

function extractToken(chunk: AIMessageChunk): [string, 'string' | 'input' | 'content'] | [undefined] {
  if (typeof chunk.content === 'string') {
    return [chunk.content, 'string'];
  } else if (
    Array.isArray(chunk.content) &&
    chunk.content.length >= 1 &&
    'input' in chunk.content[0]
  ) {
    return typeof chunk.content[0].input === 'string'
      ? [chunk.content[0].input, 'input']
      : [JSON.stringify(chunk.content[0].input), 'input'];
  } else if (
    Array.isArray(chunk.content) &&
    chunk.content.length >= 1 &&
    'text' in chunk.content[0]
  ) {
    return [chunk.content[0].text, 'content'];
  }
  return [undefined];
}

function cloneChunk(text: string, tokenType: string, chunk: AIMessageChunk): AIMessageChunk {
  if (tokenType === 'string') {
    return new AIMessageChunk(Object.assign({}, chunk, { content: text }));
  } else if (tokenType === 'input') {
    return chunk;
  }
  const content = chunk.content[0] as MessageContentComplex;
  if (tokenType === 'content' && content.type === 'text') {
    return new AIMessageChunk(Object.assign({}, chunk, { content: [Object.assign({}, content, { text })] }));
  } else if (tokenType === 'content' && content.type === 'text_delta') {
    return new AIMessageChunk(Object.assign({}, chunk, { content: [Object.assign({}, content, { text })] }));
  }

  return chunk;
}

export type CustomAnthropicInput = AnthropicInput & { _lc_stream_delay?: number };

export class CustomAnthropic extends ChatAnthropicMessages {
  _lc_stream_delay: number;
  private message_start: AnthropicMessageStartEvent | undefined;
  private message_delta: AnthropicMessageDeltaEvent | undefined;
  private tools_in_params?: boolean;
  private emitted_usage?: boolean;
  constructor(fields: CustomAnthropicInput) {
    super(fields);
    this._lc_stream_delay = fields._lc_stream_delay ?? 25;
  }

  /**
   * Get stream usage as returned by this client's API response.
   * @returns {AnthropicStreamUsage} The stream usage object.
   */
  getStreamUsage(): AnthropicStreamUsage | undefined {
    if (this.emitted_usage === true) {
      return;
    }
    const inputUsage = (this.message_start?.message)?.usage as undefined | AnthropicStreamUsage;
    const outputUsage = this.message_delta?.usage as undefined | Partial<AnthropicStreamUsage>;
    if (!outputUsage) {
      return;
    }
    const totalUsage = {
      total_tokens: (inputUsage?.input_tokens ?? 0)
      + (inputUsage?.output_tokens ?? 0)
      + (inputUsage?.cache_creation_input_tokens ?? 0)
      + (inputUsage?.cache_read_input_tokens ?? 0)
      + (outputUsage.input_tokens ?? 0)
      + (outputUsage.output_tokens ?? 0)
      + (outputUsage.cache_creation_input_tokens ?? 0)
      + (outputUsage.cache_read_input_tokens ?? 0),
    };

    this.emitted_usage = true;
    return Object.assign(totalUsage, inputUsage, outputUsage);
  }

  resetTokenEvents(): void {
    this.message_start = undefined;
    this.message_delta = undefined;
    this.emitted_usage = undefined;
    this.tools_in_params = undefined;
  }

  private createGenerationChunk({
    token,
    chunk,
    usageMetadata,
    shouldStreamUsage,
  }: {
    token?: string,
    chunk: AIMessageChunk,
    shouldStreamUsage: boolean
    usageMetadata?: AnthropicStreamUsage,
  }): ChatGenerationChunk {
    const usage_metadata = shouldStreamUsage ? usageMetadata ?? chunk.usage_metadata : undefined;
    return new ChatGenerationChunk({
      message: new AIMessageChunk({
        // Just yield chunk as it is and tool_use will be concat by BaseChatModel._generateUncached().
        content: chunk.content,
        additional_kwargs: chunk.additional_kwargs,
        tool_call_chunks: chunk.tool_call_chunks,
        response_metadata: chunk.response_metadata,
        usage_metadata,
        id: chunk.id,
      }),
      text: token ?? '',
    });
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const params = this.invocationParams(options);
    const formattedMessages = _convertMessagesToAnthropicPayload(messages);
    this.tools_in_params = _toolsInParams({
      ...params,
      ...formattedMessages,
      stream: false,
    });
    const coerceContentToString = !this.tools_in_params;

    const stream = await this.createStreamWithRetry(
      {
        ...params,
        ...formattedMessages,
        stream: true,
      },
      {
        headers: options.headers,
      }
    );

    const shouldStreamUsage = this.streamUsage ?? options.streamUsage;

    for await (const data of stream) {
      if (options.signal?.aborted === true) {
        stream.controller.abort();
        throw new Error('AbortError: User aborted the request.');
      }

      const type = data.type ?? '';
      if (type === 'message_start') {
        this.message_start = data as AnthropicMessageStartEvent;
      } else if (type === 'message_delta') {
        this.message_delta = data as AnthropicMessageDeltaEvent;
      }

      let usageMetadata: AnthropicStreamUsage | undefined;
      if (this.tools_in_params !== true && this.emitted_usage !== true) {
        usageMetadata = this.getStreamUsage();
      }

      const result = _makeMessageChunkFromAnthropicEvent(data, {
        streamUsage: shouldStreamUsage,
        coerceContentToString,
      });
      if (!result) continue;

      const { chunk } = result;
      const [token = '', tokenType] = extractToken(chunk);

      if (!tokenType || tokenType === 'input' || (token === '' && usageMetadata)) {
        const generationChunk = this.createGenerationChunk({
          token,
          chunk,
          usageMetadata,
          shouldStreamUsage,
        });
        yield generationChunk;
        await runManager?.handleLLMNewToken(
          token,
          undefined,
          undefined,
          undefined,
          undefined,
          { chunk: generationChunk }
        );
        continue;
      }

      const textStream = new TextStream(token, {
        delay: this._lc_stream_delay,
        firstWordChunk: true,
        minChunkSize: 4,
        maxChunkSize: 8,
      });

      const generator = textStream.generateText();
      try {
        let emittedUsage = false;
        for await (const currentToken of generator) {
          const newChunk = cloneChunk(currentToken, tokenType, chunk);

          const generationChunk = this.createGenerationChunk({
            token: currentToken,
            chunk: newChunk,
            usageMetadata: emittedUsage ? undefined : usageMetadata,
            shouldStreamUsage,
          });

          if (usageMetadata && !emittedUsage) {
            emittedUsage = true;
          }
          yield generationChunk;

          await runManager?.handleLLMNewToken(
            token,
            undefined,
            undefined,
            undefined,
            undefined,
            { chunk: generationChunk }
          );
        }
      } finally {
        await generator.return();
      }
    }

    this.resetTokenEvents();
  }
}