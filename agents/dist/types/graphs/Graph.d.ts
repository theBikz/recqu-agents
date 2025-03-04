import { ToolNode } from '@langchain/langgraph/prebuilt';
import { START } from '@langchain/langgraph';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import { Providers, GraphNodeKeys, Callback, ContentTypes } from '@/common';
import { ToolNode as CustomToolNode } from '@/tools/ToolNode';
import { HandlerRegistry } from '@/events';
export type GraphNode = GraphNodeKeys | typeof START;
export type ClientCallback<T extends unknown[]> = (graph: StandardGraph, ...args: T) => void;
export type ClientCallbacks = {
    [Callback.TOOL_ERROR]?: ClientCallback<[Error, string]>;
    [Callback.TOOL_START]?: ClientCallback<unknown[]>;
    [Callback.TOOL_END]?: ClientCallback<unknown[]>;
};
export type SystemCallbacks = {
    [K in keyof ClientCallbacks]: ClientCallbacks[K] extends ClientCallback<infer Args> ? (...args: Args) => void : never;
};
export declare abstract class Graph<T extends t.BaseGraphState = t.BaseGraphState, TNodeName extends string = string> {
    abstract resetValues(): void;
    abstract createGraphState(): t.GraphStateChannels<T>;
    abstract initializeTools(): CustomToolNode<T> | ToolNode<T>;
    abstract initializeModel(): Runnable;
    abstract getRunMessages(): BaseMessage[] | undefined;
    abstract getContentParts(): t.MessageContentComplex[] | undefined;
    abstract generateStepId(stepKey: string): [string, number];
    abstract getKeyList(metadata: Record<string, unknown> | undefined): (string | number | undefined)[];
    abstract getStepKey(metadata: Record<string, unknown> | undefined): string;
    abstract checkKeyList(keyList: (string | number | undefined)[]): boolean;
    abstract getStepIdByKey(stepKey: string, index?: number): string;
    abstract getRunStep(stepId: string): t.RunStep | undefined;
    abstract dispatchRunStep(stepKey: string, stepDetails: t.StepDetails): string;
    abstract dispatchRunStepDelta(id: string, delta: t.ToolCallDelta): void;
    abstract dispatchMessageDelta(id: string, delta: t.MessageDelta): void;
    abstract dispatchReasoningDelta(stepId: string, delta: t.ReasoningDelta): void;
    abstract handleToolCallCompleted(data: t.ToolEndData, metadata?: Record<string, unknown>): void;
    abstract createCallModel(): (state: T, config?: RunnableConfig) => Promise<Partial<T>>;
    abstract createWorkflow(): t.CompiledWorkflow<T>;
    lastToken?: string;
    tokenTypeSwitch?: 'reasoning' | 'content';
    reasoningKey: 'reasoning_content' | 'reasoning';
    currentTokenType: ContentTypes.TEXT | ContentTypes.THINK;
    messageStepHasToolCalls: Map<string, boolean>;
    messageIdsByStepKey: Map<string, string>;
    prelimMessageIdsByStepKey: Map<string, string>;
    config: RunnableConfig | undefined;
    contentData: t.RunStep[];
    stepKeyIds: Map<string, string[]>;
    contentIndexMap: Map<string, number>;
    toolCallStepIds: Map<string, string>;
    /** The amount of time that should pass before another consecutive API call */
    streamBuffer: number | undefined;
    signal?: AbortSignal;
}
export declare class StandardGraph extends Graph<t.BaseGraphState, GraphNode> {
    private graphState;
    clientOptions: t.ClientOptions;
    boundModel: Runnable;
    /** The last recorded timestamp that a stream API call was invoked */
    lastStreamCall: number | undefined;
    handlerRegistry: HandlerRegistry | undefined;
    systemMessage: SystemMessage | undefined;
    messages: BaseMessage[];
    runId: string | undefined;
    tools?: t.GenericTool[];
    toolMap?: t.ToolMap;
    startIndex: number;
    provider: Providers;
    toolEnd: boolean;
    signal: AbortSignal | undefined;
    constructor({ runId, tools, signal, toolMap, provider, streamBuffer, instructions, reasoningKey, clientOptions, toolEnd, additional_instructions, }: t.StandardGraphInput);
    resetValues(keepContent?: boolean): void;
    getRunStep(stepId: string): t.RunStep | undefined;
    getStepKey(metadata: Record<string, unknown> | undefined): string;
    getStepIdByKey(stepKey: string, index?: number): string;
    generateStepId(stepKey: string): [string, number];
    getKeyList(metadata: Record<string, unknown> | undefined): (string | number | undefined)[];
    checkKeyList(keyList: (string | number | undefined)[]): boolean;
    getRunMessages(): BaseMessage[] | undefined;
    getContentParts(): t.MessageContentComplex[] | undefined;
    createGraphState(): t.GraphStateChannels<t.BaseGraphState>;
    initializeTools(): CustomToolNode<t.BaseGraphState> | ToolNode<t.BaseGraphState>;
    initializeModel(): Runnable;
    overrideTestModel(responses: string[], sleep?: number): void;
    getNewModel({ clientOptions, omitOriginalOptions, }: {
        clientOptions?: t.ClientOptions;
        omitOriginalOptions?: string[];
    }): t.ChatModelInstance;
    createCallModel(): (state: t.BaseGraphState, config?: RunnableConfig) => Promise<Partial<t.BaseGraphState>>;
    createWorkflow(): t.CompiledWorkflow<t.BaseGraphState>;
    /**
     * Dispatches a run step to the client, returns the step ID
     */
    dispatchRunStep(stepKey: string, stepDetails: t.StepDetails): string;
    handleToolCallCompleted(data: t.ToolEndData, metadata?: Record<string, unknown>): void;
    dispatchRunStepDelta(id: string, delta: t.ToolCallDelta): void;
    dispatchMessageDelta(id: string, delta: t.MessageDelta): void;
    dispatchReasoningDelta: (stepId: string, delta: t.ReasoningDelta) => void;
}
