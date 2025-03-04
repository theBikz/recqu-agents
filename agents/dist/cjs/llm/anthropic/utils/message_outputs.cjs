'use strict';

var messages = require('@langchain/core/messages');

function _makeMessageChunkFromAnthropicEvent(data, fields) {
    if (data.type === 'message_start') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { content, usage, ...additionalKwargs } = data.message;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filteredAdditionalKwargs = {};
        for (const [key, value] of Object.entries(additionalKwargs)) {
            if (value !== undefined && value !== null) {
                filteredAdditionalKwargs[key] = value;
            }
        }
        const usageMetadata = {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            total_tokens: usage.input_tokens + usage.output_tokens,
        };
        return {
            chunk: new messages.AIMessageChunk({
                content: fields.coerceContentToString ? '' : [],
                additional_kwargs: filteredAdditionalKwargs,
                usage_metadata: fields.streamUsage ? usageMetadata : undefined,
                id: data.message.id,
            }),
        };
    }
    else if (data.type === 'message_delta') {
        const usageMetadata = {
            input_tokens: 0,
            output_tokens: data.usage.output_tokens,
            total_tokens: data.usage.output_tokens,
        };
        return {
            chunk: new messages.AIMessageChunk({
                content: fields.coerceContentToString ? '' : [],
                additional_kwargs: { ...data.delta },
                usage_metadata: fields.streamUsage ? usageMetadata : undefined,
            }),
        };
    }
    else if (data.type === 'content_block_start' &&
        data.content_block.type === 'tool_use') {
        const toolCallContentBlock = data.content_block;
        return {
            chunk: new messages.AIMessageChunk({
                content: fields.coerceContentToString
                    ? ''
                    : [
                        {
                            index: data.index,
                            ...data.content_block,
                            input: '',
                        },
                    ],
                additional_kwargs: {},
                tool_call_chunks: [
                    {
                        id: toolCallContentBlock.id,
                        index: data.index,
                        name: toolCallContentBlock.name,
                        args: '',
                    },
                ],
            }),
        };
    }
    else if (data.type === 'content_block_delta' &&
        data.delta.type === 'text_delta') {
        const content = data.delta.text;
        if (content !== undefined) {
            return {
                chunk: new messages.AIMessageChunk({
                    content: fields.coerceContentToString
                        ? content
                        : [
                            {
                                index: data.index,
                                ...data.delta,
                            },
                        ],
                    additional_kwargs: {},
                }),
            };
        }
    }
    else if (data.type === 'content_block_delta' &&
        data.delta.type === 'input_json_delta') {
        return {
            chunk: new messages.AIMessageChunk({
                content: fields.coerceContentToString
                    ? ''
                    : [
                        {
                            index: data.index,
                            input: data.delta.partial_json,
                            type: data.delta.type,
                        },
                    ],
                additional_kwargs: {},
                tool_call_chunks: [
                    {
                        index: data.index,
                        args: data.delta.partial_json,
                    },
                ],
            }),
        };
    }
    else if (data.type === 'content_block_start' &&
        data.content_block.type === 'text') {
        const content = data.content_block.text;
        if (content !== undefined) {
            return {
                chunk: new messages.AIMessageChunk({
                    content: fields.coerceContentToString
                        ? content
                        : [
                            {
                                index: data.index,
                                ...data.content_block,
                            },
                        ],
                    additional_kwargs: {},
                }),
            };
        }
    }
    return null;
}

exports._makeMessageChunkFromAnthropicEvent = _makeMessageChunkFromAnthropicEvent;
//# sourceMappingURL=message_outputs.cjs.map
