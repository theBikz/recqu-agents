'use strict';

var stream = require('./stream.cjs');
var _enum = require('./common/enum.cjs');

class HandlerRegistry {
    handlers = new Map();
    register(eventType, handler) {
        this.handlers.set(eventType, handler);
    }
    getHandler(eventType) {
        return this.handlers.get(eventType);
    }
}
class ModelEndHandler {
    collectedUsage;
    constructor(collectedUsage) {
        if (collectedUsage && !Array.isArray(collectedUsage)) {
            throw new Error('collectedUsage must be an array');
        }
        this.collectedUsage = collectedUsage;
    }
    handle(event, data, metadata, graph) {
        if (!graph || !metadata) {
            console.warn(`Graph or metadata not found in ${event} event`);
            return;
        }
        const usage = data?.output?.usage_metadata;
        if (usage != null && this.collectedUsage != null) {
            this.collectedUsage.push(usage);
        }
        console.log(`====== ${event.toUpperCase()} ======`);
        console.dir({
            usage,
        }, { depth: null });
        if (metadata.provider !== _enum.Providers.GOOGLE) {
            return;
        }
        stream.handleToolCalls(data?.output?.tool_calls, metadata, graph);
    }
}
class ToolEndHandler {
    callback;
    constructor(callback) {
        this.callback = callback;
    }
    handle(event, data, metadata, graph) {
        if (!graph || !metadata) {
            console.warn(`Graph or metadata not found in ${event} event`);
            return;
        }
        const toolEndData = data;
        if (!toolEndData?.output) {
            console.warn('No output found in tool_end event');
            return;
        }
        this.callback?.(toolEndData, metadata);
        graph.handleToolCallCompleted({ input: toolEndData.input, output: toolEndData.output }, metadata);
    }
}
class TestLLMStreamHandler {
    handle(event, data) {
        const chunk = data?.chunk;
        const isMessageChunk = !!(chunk && 'message' in chunk);
        const msg = isMessageChunk ? chunk.message : undefined;
        if (msg && msg.tool_call_chunks && msg.tool_call_chunks.length > 0) {
            console.log(msg.tool_call_chunks);
        }
        else if (msg && msg.content) {
            if (typeof msg.content === 'string') {
                process.stdout.write(msg.content);
            }
        }
    }
}
class TestChatStreamHandler {
    handle(event, data) {
        const chunk = data?.chunk;
        const isContentChunk = !!(chunk && 'content' in chunk);
        const content = isContentChunk && chunk.content;
        if (!content || !isContentChunk) {
            return;
        }
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
            console.dir(chunk.tool_call_chunks, { depth: null });
        }
        if (typeof content === 'string') {
            process.stdout.write(content);
        }
        else {
            console.dir(content, { depth: null });
        }
    }
}
class LLMStreamHandler {
    handle(event, data, metadata) {
        const chunk = data?.chunk;
        const isMessageChunk = !!(chunk && 'message' in chunk);
        const msg = isMessageChunk && chunk.message;
        if (metadata) {
            console.log(metadata);
        }
        if (msg && msg.tool_call_chunks && msg.tool_call_chunks.length > 0) {
            console.log(msg.tool_call_chunks);
        }
        else if (msg && msg.content) {
            if (typeof msg.content === 'string') {
                // const text_delta = msg.content;
                // dispatchCustomEvent(GraphEvents.CHAT_MODEL_STREAM, { chunk }, config);
                process.stdout.write(msg.content);
            }
        }
    }
}
const createMetadataAggregator = (_collected) => {
    const collected = _collected || [];
    const handleLLMEnd = (output) => {
        const { generations } = output;
        const lastMessageOutput = generations[generations.length - 1]?.[0];
        if (!lastMessageOutput) {
            return;
        }
        const { message } = lastMessageOutput;
        if (message?.response_metadata) {
            collected.push(message.response_metadata);
        }
    };
    return { handleLLMEnd, collected };
};

exports.HandlerRegistry = HandlerRegistry;
exports.LLMStreamHandler = LLMStreamHandler;
exports.ModelEndHandler = ModelEndHandler;
exports.TestChatStreamHandler = TestChatStreamHandler;
exports.TestLLMStreamHandler = TestLLMStreamHandler;
exports.ToolEndHandler = ToolEndHandler;
exports.createMetadataAggregator = createMetadataAggregator;
//# sourceMappingURL=events.cjs.map
