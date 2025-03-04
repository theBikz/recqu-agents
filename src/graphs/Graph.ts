// src/graphs/Graph.ts
import { nanoid } from 'nanoid';
import { concat } from '@langchain/core/utils/stream';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { START, END, StateGraph  } from '@langchain/langgraph';
import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch';
import { AIMessageChunk, ToolMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import { Providers, GraphEvents, GraphNodeKeys, StepTypes, Callback, ContentTypes } from '@/common';
import { getChatModelClass, manualToolStreamProviders } from '@/llm/providers';
import { ToolNode as CustomToolNode, toolsCondition } from '@/tools/ToolNode';
import {
  modifyDeltaProperties,
  formatArtifactPayload,
  convertMessagesToContent,
  formatAnthropicArtifactContent,
} from '@/messages';
import { resetIfNotEmpty, isOpenAILike, isGoogleLike, joinKeys, sleep } from '@/utils';
import { createFakeStreamingLLM } from '@/llm/fake';
import { HandlerRegistry } from '@/events';

const { AGENT, TOOLS } = GraphNodeKeys;
export type GraphNode = GraphNodeKeys | typeof START;
export type ClientCallback<T extends unknown[]> = (graph: StandardGraph, ...args: T) => void;
export type ClientCallbacks = {
  [Callback.TOOL_ERROR]?: ClientCallback<[Error, string]>;
  [Callback.TOOL_START]?: ClientCallback<unknown[]>;
  [Callback.TOOL_END]?: ClientCallback<unknown[]>;
}
export type SystemCallbacks = {
  [K in keyof ClientCallbacks]: ClientCallbacks[K] extends ClientCallback<infer Args>
    ? (...args: Args) => void
    : never;
};

export abstract class Graph<
  T extends t.BaseGraphState = t.BaseGraphState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TNodeName extends string = string,
> {
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
  abstract getStepIdByKey(stepKey: string, index?: number): string
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
  reasoningKey: 'reasoning_content' | 'reasoning' = 'reasoning_content';
  currentTokenType: ContentTypes.TEXT | ContentTypes.THINK = ContentTypes.TEXT;
  messageStepHasToolCalls: Map<string, boolean> = new Map();
  messageIdsByStepKey: Map<string, string> = new Map();
  prelimMessageIdsByStepKey: Map<string, string> = new Map();
  config: RunnableConfig | undefined;
  contentData: t.RunStep[] = [];
  stepKeyIds: Map<string, string[]> = new Map<string, string[]>();
  contentIndexMap: Map<string, number> = new Map();
  toolCallStepIds: Map<string, string> = new Map();
  /** The amount of time that should pass before another consecutive API call */
  streamBuffer: number | undefined;
  signal?: AbortSignal;
}

export class StandardGraph extends Graph<
  t.BaseGraphState,
  GraphNode
> {
  private graphState: t.GraphStateChannels<t.BaseGraphState>;
  clientOptions: t.ClientOptions;
  boundModel: Runnable;
  /** The last recorded timestamp that a stream API call was invoked */
  lastStreamCall: number | undefined;
  handlerRegistry: HandlerRegistry | undefined;
  systemMessage: SystemMessage | undefined;
  messages: BaseMessage[] = [];
  runId: string | undefined;
  tools?: t.GenericTool[];
  toolMap?: t.ToolMap;
  startIndex: number = 0;
  provider: Providers;
  toolEnd: boolean;
  signal: AbortSignal | undefined;

  constructor({
    runId,
    tools,
    signal,
    toolMap,
    provider,
    streamBuffer,
    instructions,
    reasoningKey,
    clientOptions,
    toolEnd = false,
    additional_instructions = '',
  } : t.StandardGraphInput) {
    super();
    this.runId = runId;
    this.tools = tools;
    this.signal = signal;
    this.toolEnd = toolEnd;
    this.toolMap = toolMap;
    this.provider = provider;
    this.streamBuffer = streamBuffer;
    this.clientOptions = clientOptions;
    this.graphState = this.createGraphState();
    this.boundModel = this.initializeModel();
    if (reasoningKey) {
      this.reasoningKey = reasoningKey;
    }

    let finalInstructions = instructions ?? '';
    if (additional_instructions) {
      finalInstructions = finalInstructions ? `${finalInstructions}\n\n${additional_instructions}` : additional_instructions;
    }

    if (finalInstructions) {
      this.systemMessage = new SystemMessage(finalInstructions);
    }
  }

  /* Init */

  resetValues(keepContent?: boolean): void {
    this.messages = [];
    this.config = resetIfNotEmpty(this.config, undefined);
    if (keepContent !== true) {
      this.contentData = resetIfNotEmpty(this.contentData, []);
      this.contentIndexMap = resetIfNotEmpty(this.contentIndexMap, new Map());
    }
    this.stepKeyIds = resetIfNotEmpty(this.stepKeyIds, new Map());
    this.toolCallStepIds = resetIfNotEmpty(this.toolCallStepIds, new Map());
    this.messageIdsByStepKey = resetIfNotEmpty(this.messageIdsByStepKey, new Map());
    this.messageStepHasToolCalls = resetIfNotEmpty(this.prelimMessageIdsByStepKey, new Map());
    this.prelimMessageIdsByStepKey = resetIfNotEmpty(this.prelimMessageIdsByStepKey, new Map());
    this.currentTokenType = resetIfNotEmpty(this.currentTokenType, ContentTypes.TEXT);
    this.lastToken = resetIfNotEmpty(this.lastToken, undefined);
    this.tokenTypeSwitch = resetIfNotEmpty(this.tokenTypeSwitch, undefined);
  }

  /* Run Step Processing */

  getRunStep(stepId: string): t.RunStep | undefined {
    const index = this.contentIndexMap.get(stepId);
    if (index !== undefined) {
      return this.contentData[index];
    }
    return undefined;
  }

  getStepKey(metadata: Record<string, unknown> | undefined): string {
    if (!metadata) return '';

    const keyList = this.getKeyList(metadata);
    if (this.checkKeyList(keyList)) {
      throw new Error('Missing metadata');
    }

    return joinKeys(keyList);
  }

  getStepIdByKey(stepKey: string, index?: number): string {
    const stepIds = this.stepKeyIds.get(stepKey);
    if (!stepIds) {
      throw new Error(`No step IDs found for stepKey ${stepKey}`);
    }

    if (index === undefined) {
      return stepIds[stepIds.length - 1];
    }

    return stepIds[index];
  }

  generateStepId(stepKey: string): [string, number] {
    const stepIds = this.stepKeyIds.get(stepKey);
    let newStepId: string | undefined;
    let stepIndex = 0;
    if (stepIds) {
      stepIndex = stepIds.length;
      newStepId = `step_${nanoid()}`;
      stepIds.push(newStepId);
      this.stepKeyIds.set(stepKey, stepIds);
    } else {
      newStepId = `step_${nanoid()}`;
      this.stepKeyIds.set(stepKey, [newStepId]);
    }

    return [newStepId, stepIndex];
  }

  getKeyList(metadata: Record<string, unknown> | undefined): (string | number | undefined)[] {
    if (!metadata) return [];

    const keyList = [
      metadata.run_id as string,
      metadata.thread_id as string,
      metadata.langgraph_node as string,
      metadata.langgraph_step as number,
      metadata.checkpoint_ns as string,
    ];
    if (this.currentTokenType === ContentTypes.THINK) {
      keyList.push('reasoning');
    }

    return keyList;
  }

  checkKeyList(keyList: (string | number | undefined)[]): boolean {
    return keyList.some((key) => key === undefined);
  }

  /* Misc.*/

  getRunMessages(): BaseMessage[] | undefined {
    return this.messages.slice(this.startIndex);
  }

  getContentParts(): t.MessageContentComplex[] | undefined {
    return convertMessagesToContent(this.messages.slice(this.startIndex));
  }

  /* Graph */

  createGraphState(): t.GraphStateChannels<t.BaseGraphState> {
    return {
      messages: {
        value: (x: BaseMessage[], y: BaseMessage[]): BaseMessage[] => {
          if (!x.length) {
            if (this.systemMessage) {
              x.push(this.systemMessage);
            }

            this.startIndex = x.length + y.length;
          }
          const current = x.concat(y);
          this.messages = current;
          return current;
        },
        default: () => [],
      },
    };
  }

  initializeTools(): CustomToolNode<t.BaseGraphState> | ToolNode<t.BaseGraphState> {
    // return new ToolNode<t.BaseGraphState>(this.tools);
    return new CustomToolNode<t.BaseGraphState>({
      tools: this.tools || [],
      toolMap: this.toolMap,
      toolCallStepIds: this.toolCallStepIds,
    });
  }

  initializeModel(): Runnable {
    const ChatModelClass = getChatModelClass(this.provider);
    const model = new ChatModelClass(this.clientOptions);

    if (isOpenAILike(this.provider) && (model instanceof ChatOpenAI || model instanceof AzureChatOpenAI)) {
      model.temperature = (this.clientOptions as t.OpenAIClientOptions).temperature as number;
      model.topP = (this.clientOptions as t.OpenAIClientOptions).topP as number;
      model.frequencyPenalty = (this.clientOptions as t.OpenAIClientOptions).frequencyPenalty as number;
      model.presencePenalty = (this.clientOptions as t.OpenAIClientOptions).presencePenalty as number;
      model.n = (this.clientOptions as t.OpenAIClientOptions).n as number;
    } else if (this.provider === Providers.VERTEXAI && model instanceof ChatVertexAI) {
      model.temperature = (this.clientOptions as t.VertexAIClientOptions).temperature as number;
      model.topP = (this.clientOptions as t.VertexAIClientOptions).topP as number;
      model.topK = (this.clientOptions as t.VertexAIClientOptions).topK as number;
      model.topLogprobs = (this.clientOptions as t.VertexAIClientOptions).topLogprobs as number;
      model.frequencyPenalty = (this.clientOptions as t.VertexAIClientOptions).frequencyPenalty as number;
      model.presencePenalty = (this.clientOptions as t.VertexAIClientOptions).presencePenalty as number;
      model.maxOutputTokens = (this.clientOptions as t.VertexAIClientOptions).maxOutputTokens as number;
    }

    if (!this.tools || this.tools.length === 0) {
      return model as unknown as Runnable;
    }

    return (model as t.ModelWithTools).bindTools(this.tools);
  }
  overrideTestModel(responses: string[], sleep?: number): void {
    this.boundModel = createFakeStreamingLLM(responses, sleep);
  }

  getNewModel({
    clientOptions = {},
    omitOriginalOptions,
  } : {
    clientOptions?: t.ClientOptions;
    omitOriginalOptions?: string[]
  }): t.ChatModelInstance {
    const ChatModelClass = getChatModelClass(this.provider);
    const _options = omitOriginalOptions ? Object.fromEntries(
      Object.entries(this.clientOptions).filter(([key]) => !omitOriginalOptions.includes(key)),
    ) : this.clientOptions;
    const options = Object.assign(_options, clientOptions);
    return new ChatModelClass(options);
  }

  createCallModel() {
    return async (state: t.BaseGraphState, config?: RunnableConfig): Promise<Partial<t.BaseGraphState>> => {
      const { provider = '' } = (config?.configurable as t.GraphConfig | undefined) ?? {} ;
      if (!config || !provider) {
        throw new Error(`No ${config ? 'provider' : 'config'} provided`);
      }
      if (!config.signal) {
        config.signal = this.signal;
      }
      this.config = config;
      const { messages } = state;

      const finalMessages = messages;
      const lastMessageX = finalMessages[finalMessages.length - 2];
      const lastMessageY = finalMessages[finalMessages.length - 1];

      if (
        provider === Providers.BEDROCK
        && lastMessageX instanceof AIMessageChunk
        && lastMessageY instanceof ToolMessage
        && typeof lastMessageX.content === 'string'
      ) {
        finalMessages[finalMessages.length - 2].content = '';
      }

      const isLatestToolMessage = lastMessageY instanceof ToolMessage;

      if (isLatestToolMessage && provider === Providers.ANTHROPIC) {
        formatAnthropicArtifactContent(finalMessages);
      } else if (
        isLatestToolMessage &&
        (isOpenAILike(provider) || isGoogleLike(provider))
      ) {
        formatArtifactPayload(finalMessages);
      }

      if (this.lastStreamCall != null && this.streamBuffer != null) {
        const timeSinceLastCall = Date.now() - this.lastStreamCall;
        if (timeSinceLastCall < this.streamBuffer) {
          const timeToWait = Math.ceil((this.streamBuffer - timeSinceLastCall) / 1000) * 1000;
          await sleep(timeToWait);
        }
      }

      this.lastStreamCall = Date.now();

      if ((this.tools?.length ?? 0) > 0 && manualToolStreamProviders.has(provider)) {
        const stream = await this.boundModel.stream(finalMessages, config);
        let finalChunk: AIMessageChunk | undefined;
        for await (const chunk of stream) {
          dispatchCustomEvent(GraphEvents.CHAT_MODEL_STREAM, { chunk }, config);
          if (!finalChunk) {
            finalChunk = chunk;
          } else {
            finalChunk = concat(finalChunk, chunk);
          }
        }

        finalChunk = modifyDeltaProperties(finalChunk);
        return { messages: [finalChunk as AIMessageChunk] };
      }

      const finalMessage = (await this.boundModel.invoke(finalMessages, config)) as AIMessageChunk;
      if ((finalMessage.tool_calls?.length ?? 0) > 0) {
        finalMessage.tool_calls = finalMessage.tool_calls?.filter((tool_call) => {
          if (!tool_call.name) {
            return false;
          }
          return true;
        });
      }
      return { messages: [finalMessage] };
    };
  }

  createWorkflow(): t.CompiledWorkflow<t.BaseGraphState> {
    const routeMessage = (state: t.BaseGraphState, config?: RunnableConfig): string => {
      this.config = config;
      // const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      // if (!lastMessage?.tool_calls?.length) {
      //   return END;
      // }
      // return TOOLS;
      return toolsCondition(state);
    };

    const workflow = new StateGraph<t.BaseGraphState>({
      channels: this.graphState,
    })
      .addNode(AGENT, this.createCallModel())
      .addNode(TOOLS, this.initializeTools())
      .addEdge(START, AGENT)
      .addConditionalEdges(AGENT, routeMessage)
      .addEdge(TOOLS, this.toolEnd ? END : AGENT);

    return workflow.compile();
  }

  /* Dispatchers */

  /**
   * Dispatches a run step to the client, returns the step ID
   */
  dispatchRunStep(stepKey: string, stepDetails: t.StepDetails): string {
    if (!this.config) {
      throw new Error('No config provided');
    }

    const [stepId, stepIndex] = this.generateStepId(stepKey);
    if (stepDetails.type === StepTypes.TOOL_CALLS && stepDetails.tool_calls) {
      for (const tool_call of stepDetails.tool_calls) {
        const toolCallId = tool_call.id ?? '';
        if (!toolCallId || this.toolCallStepIds.has(toolCallId)) {
          continue;
        }
        this.toolCallStepIds.set(toolCallId, stepId);
      }
    }

    const runStep: t.RunStep = {
      stepIndex,
      id: stepId,
      type: stepDetails.type,
      index: this.contentData.length,
      stepDetails,
      usage: null,
    };

    const runId = this.runId ?? '';
    if (runId) {
      runStep.runId = runId;
    }

    this.contentData.push(runStep);
    this.contentIndexMap.set(stepId, runStep.index);
    dispatchCustomEvent(GraphEvents.ON_RUN_STEP, runStep, this.config);
    return stepId;
  }

  handleToolCallCompleted(data: t.ToolEndData, metadata?: Record<string, unknown>): void {
    if (!this.config) {
      throw new Error('No config provided');
    }

    if (!data.output) {
      return;
    }

    const { input, output } = data;
    const { tool_call_id } = output;
    const stepId = this.toolCallStepIds.get(tool_call_id) ?? '';
    if (!stepId) {
      throw new Error(`No stepId found for tool_call_id ${tool_call_id}`);
    }

    const runStep = this.getRunStep(stepId);
    if (!runStep) {
      throw new Error(`No run step found for stepId ${stepId}`);
    }

    const args = typeof input === 'string' ? input : input.input;
    const tool_call = {
      args: typeof args === 'string' ? args : JSON.stringify(args),
      name: output.name ?? '',
      id: output.tool_call_id,
      output: typeof output.content === 'string'
        ? output.content
        : JSON.stringify(output.content),
      progress: 1,
    };

    this.handlerRegistry?.getHandler(GraphEvents.ON_RUN_STEP_COMPLETED)?.handle(
      GraphEvents.ON_RUN_STEP_COMPLETED,
      { result: {
        id: stepId,
        index: runStep.index,
        type: 'tool_call',
        tool_call
      } as t.ToolCompleteEvent,
      },
      metadata,
      this,
    );
  }

  dispatchRunStepDelta(id: string, delta: t.ToolCallDelta): void {
    if (!this.config) {
      throw new Error('No config provided');
    } else if (!id) {
      throw new Error('No step ID found');
    }
    const runStepDelta: t.RunStepDeltaEvent = {
      id,
      delta,
    };
    dispatchCustomEvent(GraphEvents.ON_RUN_STEP_DELTA, runStepDelta, this.config);
  }

  dispatchMessageDelta(id: string, delta: t.MessageDelta): void {
    if (!this.config) {
      throw new Error('No config provided');
    }
    const messageDelta: t.MessageDeltaEvent = {
      id,
      delta,
    };
    dispatchCustomEvent(GraphEvents.ON_MESSAGE_DELTA, messageDelta, this.config);
  }

  dispatchReasoningDelta = (stepId: string, delta: t.ReasoningDelta): void => {
    if (!this.config) {
      throw new Error('No config provided');
    }
    const reasoningDelta: t.ReasoningDeltaEvent = {
      id: stepId,
      delta,
    };
    dispatchCustomEvent(GraphEvents.ON_REASONING_DELTA, reasoningDelta, this.config);
  };
}
