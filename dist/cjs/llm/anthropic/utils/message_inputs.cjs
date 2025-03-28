'use strict';

var messages = require('@langchain/core/messages');

/* eslint-disable no-console */
/**
 * This util file contains functions for converting LangChain messages to Anthropic messages.
 */
function _formatImage(imageUrl) {
    const regex = /^data:(image\/.+);base64,(.+)$/;
    const match = imageUrl.match(regex);
    if (match === null) {
        throw new Error([
            'Anthropic only supports base64-encoded images currently.',
            'Example: data:image/png;base64,/9j/4AAQSk...',
        ].join('\n\n'));
    }
    return {
        type: 'base64',
        media_type: match[1] ?? '',
        data: match[2] ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    };
}
function _ensureMessageContents(messages$1) {
    // Merge runs of human/tool messages into single human messages with content blocks.
    const updatedMsgs = [];
    for (const message of messages$1) {
        if (message._getType() === 'tool') {
            if (typeof message.content === 'string') {
                const previousMessage = updatedMsgs[updatedMsgs.length - 1];
                if (previousMessage &&
                    previousMessage._getType() === 'human' &&
                    Array.isArray(previousMessage.content) &&
                    'type' in previousMessage.content[0] &&
                    previousMessage.content[0].type === 'tool_result') {
                    // If the previous message was a tool result, we merge this tool message into it.
                    previousMessage.content.push({
                        type: 'tool_result',
                        content: message.content,
                        tool_use_id: message.tool_call_id,
                    });
                }
                else {
                    // If not, we create a new human message with the tool result.
                    updatedMsgs.push(new messages.HumanMessage({
                        content: [
                            {
                                type: 'tool_result',
                                content: message.content,
                                tool_use_id: message.tool_call_id,
                            },
                        ],
                    }));
                }
            }
            else {
                updatedMsgs.push(new messages.HumanMessage({
                    content: [
                        {
                            type: 'tool_result',
                            content: _formatContent(message.content),
                            tool_use_id: message.tool_call_id,
                        },
                    ],
                }));
            }
        }
        else {
            updatedMsgs.push(message);
        }
    }
    return updatedMsgs;
}
function _convertLangChainToolCallToAnthropic(toolCall) {
    if (toolCall.id === undefined) {
        throw new Error('Anthropic requires all tool calls to have an "id".');
    }
    return {
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: toolCall.args,
    };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _formatContent(content) {
    const toolTypes = ['tool_use', 'tool_result', 'input_json_delta'];
    const textTypes = ['text', 'text_delta'];
    if (typeof content === 'string') {
        return content;
    }
    else {
        const contentBlocks = content.map((contentPart) => {
            const cacheControl = 'cache_control' in contentPart ? contentPart.cache_control : undefined;
            if (contentPart.type === 'image_url') {
                let source;
                if (typeof contentPart.image_url === 'string') {
                    source = _formatImage(contentPart.image_url);
                }
                else {
                    source = _formatImage(contentPart.image_url.url);
                }
                return {
                    type: 'image', // Explicitly setting the type as "image"
                    source,
                    ...(cacheControl ? { cache_control: cacheControl } : {}),
                };
            }
            else if (textTypes.find((t) => t === contentPart.type) != null &&
                'text' in contentPart) {
                // Assuming contentPart is of type MessageContentText here
                return {
                    type: 'text', // Explicitly setting the type as "text"
                    text: contentPart.text,
                    ...(cacheControl ? { cache_control: cacheControl } : {}),
                };
            }
            else if (toolTypes.find((t) => t === contentPart.type) != null) {
                const contentPartCopy = { ...contentPart };
                if ('index' in contentPartCopy) {
                    // Anthropic does not support passing the index field here, so we remove it.
                    delete contentPartCopy.index;
                }
                if (contentPartCopy.type === 'input_json_delta') {
                    // `input_json_delta` type only represents yielding partial tool inputs
                    // and is not a valid type for Anthropic messages.
                    contentPartCopy.type = 'tool_use';
                }
                if ('input' in contentPartCopy) {
                    // Anthropic tool use inputs should be valid objects, when applicable.
                    try {
                        contentPartCopy.input = JSON.parse(contentPartCopy.input);
                    }
                    catch {
                        // no-op
                    }
                }
                // TODO: Fix when SDK types are fixed
                return {
                    ...contentPartCopy,
                    ...(cacheControl ? { cache_control: cacheControl } : {}),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                };
            }
            else {
                throw new Error('Unsupported message content format');
            }
        });
        return contentBlocks;
    }
}
/**
 * Formats messages as a prompt for the model.
 * Used in LangSmith, export is important here.
 * @param messages The base messages to format as a prompt.
 * @returns The formatted prompt.
 */
function _convertMessagesToAnthropicPayload(messages$1) {
    const mergedMessages = _ensureMessageContents(messages$1);
    let system;
    if (mergedMessages.length > 0 && mergedMessages[0]._getType() === 'system') {
        system = messages$1[0].content;
    }
    const conversationMessages = system !== undefined ? mergedMessages.slice(1) : mergedMessages;
    const formattedMessages = conversationMessages.map((message) => {
        let role;
        if (message._getType() === 'human') {
            role = 'user';
        }
        else if (message._getType() === 'ai') {
            role = 'assistant';
        }
        else if (message._getType() === 'tool') {
            role = 'user';
        }
        else if (message._getType() === 'system') {
            throw new Error('System messages are only permitted as the first passed message.');
        }
        else {
            throw new Error(`Message type "${message._getType()}" is not supported.`);
        }
        if (messages.isAIMessage(message) && !!message.tool_calls?.length) {
            if (typeof message.content === 'string') {
                if (message.content === '') {
                    return {
                        role,
                        content: message.tool_calls.map(_convertLangChainToolCallToAnthropic),
                    };
                }
                else {
                    return {
                        role,
                        content: [
                            { type: 'text', text: message.content },
                            ...message.tool_calls.map(_convertLangChainToolCallToAnthropic),
                        ],
                    };
                }
            }
            else {
                const { content } = message;
                const hasMismatchedToolCalls = !message.tool_calls.every((toolCall) => content.find((contentPart) => (contentPart.type === 'tool_use' ||
                    contentPart.type === 'input_json_delta') &&
                    contentPart.id === toolCall.id));
                if (hasMismatchedToolCalls) {
                    console.warn('The "tool_calls" field on a message is only respected if content is a string.');
                }
                return {
                    role,
                    content: _formatContent(message.content),
                };
            }
        }
        else {
            return {
                role,
                content: _formatContent(message.content),
            };
        }
    });
    return {
        messages: mergeMessages(formattedMessages),
        system,
    };
}
function mergeMessages(messages) {
    if (!messages || messages.length <= 1) {
        return messages ?? [];
    }
    const result = [];
    let currentMessage = messages[0];
    const normalizeContent = (content) => {
        if (typeof content === 'string') {
            return [
                {
                    type: 'text',
                    text: content,
                },
            ];
        }
        return content;
    };
    const isToolResultMessage = (msg) => {
        if (msg.role !== 'user')
            return false;
        if (typeof msg.content === 'string') {
            return false;
        }
        return (Array.isArray(msg.content) &&
            msg.content.every((item) => item.type === 'tool_result'));
    };
    for (let i = 1; i < messages.length; i += 1) {
        const nextMessage = messages[i];
        if (isToolResultMessage(currentMessage) &&
            isToolResultMessage(nextMessage)) {
            // Merge the messages by combining their content arrays
            currentMessage = {
                ...currentMessage,
                content: [
                    ...normalizeContent(currentMessage.content),
                    ...normalizeContent(nextMessage.content),
                ],
            };
        }
        else {
            result.push(currentMessage);
            currentMessage = nextMessage;
        }
    }
    result.push(currentMessage);
    return result;
}

exports._convertLangChainToolCallToAnthropic = _convertLangChainToolCallToAnthropic;
exports._convertMessagesToAnthropicPayload = _convertMessagesToAnthropicPayload;
//# sourceMappingURL=message_inputs.cjs.map
