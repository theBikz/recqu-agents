import { AIMessageChunk } from '@langchain/core/messages';
import { ChatAnthropicMessages } from '@langchain/anthropic';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { _makeMessageChunkFromAnthropicEvent } from './utils/message_outputs.mjs';
import { _convertMessagesToAnthropicPayload } from './utils/message_inputs.mjs';
import { TextStream } from '../text.mjs';

function _toolsInParams(params) {
    return !!(params.tools && params.tools.length > 0);
}
function extractToken(chunk) {
    if (typeof chunk.content === 'string') {
        return [chunk.content, 'string'];
    }
    else if (Array.isArray(chunk.content) &&
        chunk.content.length >= 1 &&
        'input' in chunk.content[0]) {
        return typeof chunk.content[0].input === 'string'
            ? [chunk.content[0].input, 'input']
            : [JSON.stringify(chunk.content[0].input), 'input'];
    }
    else if (Array.isArray(chunk.content) &&
        chunk.content.length >= 1 &&
        'text' in chunk.content[0]) {
        return [chunk.content[0].text, 'content'];
    }
    return [undefined];
}
function cloneChunk(text, tokenType, chunk) {
    if (tokenType === 'string') {
        return new AIMessageChunk(Object.assign({}, chunk, { content: text }));
    }
    else if (tokenType === 'input') {
        return chunk;
    }
    const content = chunk.content[0];
    if (tokenType === 'content' && content.type === 'text') {
        return new AIMessageChunk(Object.assign({}, chunk, { content: [Object.assign({}, content, { text })] }));
    }
    else if (tokenType === 'content' && content.type === 'text_delta') {
        return new AIMessageChunk(Object.assign({}, chunk, { content: [Object.assign({}, content, { text })] }));
    }
    return chunk;
}
class CustomAnthropic extends ChatAnthropicMessages {
    _lc_stream_delay;
    message_start;
    message_delta;
    tools_in_params;
    emitted_usage;
    constructor(fields) {
        super(fields);
        this._lc_stream_delay = fields._lc_stream_delay ?? 25;
    }
    /**
     * Get stream usage as returned by this client's API response.
     * @returns {AnthropicStreamUsage} The stream usage object.
     */
    getStreamUsage() {
        if (this.emitted_usage === true) {
            return;
        }
        const inputUsage = (this.message_start?.message)?.usage;
        const outputUsage = this.message_delta?.usage;
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
    resetTokenEvents() {
        this.message_start = undefined;
        this.message_delta = undefined;
        this.emitted_usage = undefined;
        this.tools_in_params = undefined;
    }
    createGenerationChunk({ token, chunk, usageMetadata, shouldStreamUsage, }) {
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
    async *_streamResponseChunks(messages, options, runManager) {
        const params = this.invocationParams(options);
        const formattedMessages = _convertMessagesToAnthropicPayload(messages);
        this.tools_in_params = _toolsInParams({
            ...params,
            ...formattedMessages});
        const coerceContentToString = !this.tools_in_params;
        const stream = await this.createStreamWithRetry({
            ...params,
            ...formattedMessages,
            stream: true,
        }, {
            headers: options.headers,
        });
        const shouldStreamUsage = this.streamUsage ?? options.streamUsage;
        for await (const data of stream) {
            if (options.signal?.aborted === true) {
                stream.controller.abort();
                throw new Error('AbortError: User aborted the request.');
            }
            const type = data.type ?? '';
            if (type === 'message_start') {
                this.message_start = data;
            }
            else if (type === 'message_delta') {
                this.message_delta = data;
            }
            let usageMetadata;
            if (this.tools_in_params !== true && this.emitted_usage !== true) {
                usageMetadata = this.getStreamUsage();
            }
            const result = _makeMessageChunkFromAnthropicEvent(data, {
                streamUsage: shouldStreamUsage,
                coerceContentToString,
            });
            if (!result)
                continue;
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
                await runManager?.handleLLMNewToken(token, undefined, undefined, undefined, undefined, { chunk: generationChunk });
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
                    await runManager?.handleLLMNewToken(token, undefined, undefined, undefined, undefined, { chunk: generationChunk });
                }
            }
            finally {
                await generator.return();
            }
        }
        this.resetTokenEvents();
    }
}

export { CustomAnthropic };
//# sourceMappingURL=llm.mjs.map
