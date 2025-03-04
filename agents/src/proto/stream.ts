import type { ChatGenerationChunk } from '@langchain/core/outputs';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { AIMessageChunk } from '@langchain/core/messages';
import type * as t from '@/types/graph';

export interface EventHandler {
  handle(event: string, data: t.StreamEventData): void;
}

export class HandlerRegistry {
    private handlers: Map<string, EventHandler> = new Map();

    register(eventType: string, handler: EventHandler) {
        this.handlers.set(eventType, handler);
    }

    getHandler(eventType: string): EventHandler | undefined {
        return this.handlers.get(eventType);
    }
}

export class LLMStreamHandler implements EventHandler {
    handle(event: string, data: t.StreamEventData) {
        const chunk: ChatGenerationChunk = data?.chunk;
        const msg = chunk.message as AIMessageChunk;
        if (msg.tool_call_chunks && msg.tool_call_chunks.length > 0) {
            console.log(msg.tool_call_chunks);
        } else {
            const content = msg.content || '';
            if (typeof content === 'string') {
                process.stdout.write(content);
            }
        }
    }
}

export class GraphStreamProcessor {
    private handlerRegistry: HandlerRegistry;

    constructor(handlerRegistry: HandlerRegistry) {
        this.handlerRegistry = handlerRegistry;
    }

    async processStream<RunInput>(
        graph: t.Graph,
        inputs: RunInput,
        config: Partial<RunnableConfig> & { version: 'v1' | 'v2' },
    ) {
        for await (const event of graph.streamEvents(inputs, config)) {
            const handler = this.handlerRegistry.getHandler(event.event);
            if (handler) {
                handler.handle(event.event, event.data);
            }
        }
    }
}
