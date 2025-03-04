import { ChatAnthropicMessages } from '@langchain/anthropic';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { AnthropicInput } from '@langchain/anthropic';
import type { AnthropicStreamUsage } from '@/llm/anthropic/types';
export type CustomAnthropicInput = AnthropicInput & {
    _lc_stream_delay?: number;
};
export declare class CustomAnthropic extends ChatAnthropicMessages {
    _lc_stream_delay: number;
    private message_start;
    private message_delta;
    private tools_in_params?;
    private emitted_usage?;
    constructor(fields: CustomAnthropicInput);
    /**
     * Get stream usage as returned by this client's API response.
     * @returns {AnthropicStreamUsage} The stream usage object.
     */
    getStreamUsage(): AnthropicStreamUsage | undefined;
    resetTokenEvents(): void;
    private createGenerationChunk;
    _streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun): AsyncGenerator<ChatGenerationChunk>;
}
