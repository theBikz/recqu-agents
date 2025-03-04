import type { AIMessageChunk } from '@langchain/core/messages';
import type { ToolCall, ToolCallChunk } from '@langchain/core/messages/tool';
import type { Graph } from '@/graphs';
import type * as t from '@/types';
export declare const getMessageId: (stepKey: string, graph: Graph<t.BaseGraphState>, returnExistingId?: boolean) => string | undefined;
export declare const handleToolCalls: (toolCalls?: ToolCall[], metadata?: Record<string, unknown>, graph?: Graph) => void;
export declare class ChatModelStreamHandler implements t.EventHandler {
    handle(event: string, data: t.StreamEventData, metadata?: Record<string, unknown>, graph?: Graph): void;
    handleToolCallChunks: ({ graph, stepKey, toolCallChunks, }: {
        graph: Graph;
        stepKey: string;
        toolCallChunks: ToolCallChunk[];
    }) => void;
    handleReasoning(chunk: Partial<AIMessageChunk>, graph: Graph): void;
}
export declare function createContentAggregator(): t.ContentAggregatorResult;
