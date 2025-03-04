import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { FakeListChatModel } from '@langchain/core/utils/testing';
type SplitStrategy = {
    type: 'regex' | 'fixed';
    value: RegExp | number;
};
export declare class FakeChatModel extends FakeListChatModel {
    private splitStrategy;
    constructor({ responses, sleep, emitCustomEvent, splitStrategy }: {
        responses: string[];
        sleep?: number;
        emitCustomEvent?: boolean;
        splitStrategy?: SplitStrategy;
    });
    private splitText;
    _streamResponseChunks(_messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk>;
}
export declare function createFakeStreamingLLM(responses: string[], sleep?: number, splitStrategy?: SplitStrategy): FakeChatModel;
export {};
