import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { FakeListChatModel } from '@langchain/core/utils/testing';

type SplitStrategy = {
  type: 'regex' | 'fixed';
  value: RegExp | number;
};

export class FakeChatModel extends FakeListChatModel {
  private splitStrategy: SplitStrategy;

  constructor({
    responses,
    sleep,
    emitCustomEvent,
    splitStrategy = { type: 'regex', value: /(?<=\s+)|(?=\s+)/ }
  }: {
    responses: string[];
    sleep?: number;
    emitCustomEvent?: boolean;
    splitStrategy?: SplitStrategy;
  }) {
    super({ responses, sleep, emitCustomEvent });
    this.splitStrategy = splitStrategy;
  }

  private splitText(text: string): string[] {
    if (this.splitStrategy.type === 'regex') {
      return text.split(this.splitStrategy.value as RegExp);
    } else {
      const chunkSize = this.splitStrategy.value as number;
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      return chunks;
    }
  }

  async *_streamResponseChunks(
    _messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const response = this._currentResponse();
    this._incrementResponse();

    if (this.emitCustomEvent) {
      await runManager?.handleCustomEvent('some_test_event', {
        someval: true,
      });
    }

    const chunks = this.splitText(response);

    for await (const chunk of chunks) {
      await this._sleepIfRequested();

      if (options.thrownErrorString != null && options.thrownErrorString) {
        throw new Error(options.thrownErrorString);
      }

      const responseChunk = this._createResponseChunk(chunk);
      yield responseChunk;
      void runManager?.handleLLMNewToken(chunk);
    }
  }
}

export function createFakeStreamingLLM(
  responses: string[],
  sleep?: number,
  splitStrategy?: SplitStrategy
): FakeChatModel {
  return new FakeChatModel({
    sleep,
    responses,
    emitCustomEvent: true,
    splitStrategy,
  });
}