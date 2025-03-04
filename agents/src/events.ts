/* eslint-disable no-console */
// src/events.ts
import type { UsageMetadata, BaseMessageFields } from '@langchain/core/messages';
import type { Graph } from '@/graphs';
import type * as t from '@/types';
import { handleToolCalls } from '@/stream';
import { Providers } from '@/common';

export class HandlerRegistry {
  private handlers: Map<string, t.EventHandler> = new Map();

  register(eventType: string, handler: t.EventHandler): void {
    this.handlers.set(eventType, handler);
  }

  getHandler(eventType: string): t.EventHandler | undefined {
    return this.handlers.get(eventType);
  }
}

export class ModelEndHandler implements t.EventHandler {
  collectedUsage?: UsageMetadata[];
  constructor(collectedUsage?: UsageMetadata[]) {
    if (collectedUsage && !Array.isArray(collectedUsage)) {
      throw new Error('collectedUsage must be an array');
    }
    this.collectedUsage = collectedUsage;
  }

  handle(event: string, data: t.ModelEndData, metadata?: Record<string, unknown>, graph?: Graph): void {
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

    if (metadata.provider !== Providers.GOOGLE) {
      return;
    }

    handleToolCalls(data?.output?.tool_calls, metadata, graph);
  }
}

export class ToolEndHandler implements t.EventHandler {
  private callback?: t.ToolEndCallback;
  constructor(callback?: t.ToolEndCallback) {
    this.callback = callback;
  }
  handle(event: string, data: t.StreamEventData | undefined, metadata?: Record<string, unknown>, graph?: Graph): void {
    if (!graph || !metadata) {
      console.warn(`Graph or metadata not found in ${event} event`);
      return;
    }

    const toolEndData = data as t.ToolEndData | undefined;
    if (!toolEndData?.output) {
      console.warn('No output found in tool_end event');
      return;
    }

    this.callback?.(toolEndData, metadata);

    graph.handleToolCallCompleted({ input: toolEndData.input, output: toolEndData.output }, metadata);
  }
}

export class TestLLMStreamHandler implements t.EventHandler {
  handle(event: string, data: t.StreamEventData | undefined): void {
    const chunk = data?.chunk;
    const  isMessageChunk = !!(chunk && 'message' in chunk);
    const msg = isMessageChunk ? chunk.message : undefined;
    if (msg && msg.tool_call_chunks && msg.tool_call_chunks.length > 0) {
      console.log(msg.tool_call_chunks);
    } else if (msg && msg.content) {
      if (typeof msg.content === 'string') {
        process.stdout.write(msg.content);
      }
    }
  }
}

export class TestChatStreamHandler implements t.EventHandler {
  handle(event: string, data: t.StreamEventData | undefined): void {
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
    } else {
      console.dir(content, { depth: null });
    }
  }
}

export class LLMStreamHandler implements t.EventHandler {
  handle(event: string, data: t.StreamEventData | undefined, metadata?: Record<string, unknown>): void {
    const chunk = data?.chunk;
    const  isMessageChunk = !!(chunk && 'message' in chunk);
    const msg = isMessageChunk && chunk.message;
    if (metadata) { console.log(metadata); }
    if (msg && msg.tool_call_chunks && msg.tool_call_chunks.length > 0) {
      console.log(msg.tool_call_chunks);
    } else if (msg && msg.content) {
      if (typeof msg.content === 'string') {
        // const text_delta = msg.content;
        // dispatchCustomEvent(GraphEvents.CHAT_MODEL_STREAM, { chunk }, config);
        process.stdout.write(msg.content);
      }
    }
  }
}

export const createMetadataAggregator = (_collected?: Record<string, NonNullable<BaseMessageFields['response_metadata']>>[]): t.MetadataAggregatorResult => {
  const collected = _collected || [];

  const handleLLMEnd: t.HandleLLMEnd = (output) => {
    const { generations } = output;
    const lastMessageOutput = (generations[generations.length - 1] as (t.StreamGeneration | undefined)[] | undefined)?.[0];
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