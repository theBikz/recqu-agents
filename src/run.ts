// src/run.ts
import { PromptTemplate } from '@langchain/core/prompts';
import { AzureChatOpenAI, ChatOpenAI } from '@langchain/openai';
import type { BaseMessage, MessageContentComplex } from '@langchain/core/messages';
import type { ClientCallbacks, SystemCallbacks } from '@/graphs/Graph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type * as t from '@/types';
import { GraphEvents, Providers, Callback } from '@/common';
import { manualToolStreamProviders } from '@/llm/providers';
import { createTitleRunnable } from '@/utils/title';
import { StandardGraph } from '@/graphs/Graph';
import { HandlerRegistry } from '@/events';
import { isOpenAILike } from '@/utils/llm';

export class Run<T extends t.BaseGraphState> {
  graphRunnable?: t.CompiledWorkflow<T, Partial<T>, string>;
  // private collab!: CollabGraph;
  // private taskManager!: TaskManager;
  private handlerRegistry: HandlerRegistry;
  id: string;
  Graph: StandardGraph | undefined;
  provider: Providers | undefined;
  returnContent: boolean = false;

  private constructor(config: Partial<t.RunConfig>) {
    const runId = config.runId ?? '';
    if (!runId) {
      throw new Error('Run ID not provided');
    }

    this.id = runId;

    const handlerRegistry = new HandlerRegistry();

    if (config.customHandlers) {
      for (const [eventType, handler] of Object.entries(config.customHandlers)) {
        handlerRegistry.register(eventType, handler);
      }
    }

    this.handlerRegistry = handlerRegistry;

    if (!config.graphConfig) {
      throw new Error('Graph config not provided');
    }

    if (config.graphConfig.type === 'standard' || !config.graphConfig.type) {
      this.provider = config.graphConfig.llmConfig.provider;
      this.graphRunnable = this.createStandardGraph(config.graphConfig) as unknown as t.CompiledWorkflow<T, Partial<T>, string>;
      if (this.Graph) {
        this.Graph.handlerRegistry = handlerRegistry;
      }
    }

    this.returnContent = config.returnContent ?? false;
  }

  private createStandardGraph(config: t.StandardGraphConfig): t.CompiledWorkflow<t.IState, Partial<t.IState>, string> {
    const { llmConfig, tools = [], ...graphInput } = config;
    const { provider, ...clientOptions } = llmConfig;

    const standardGraph = new StandardGraph({
      tools,
      provider,
      clientOptions,
      ...graphInput,
      runId: this.id,
    });
    this.Graph = standardGraph;
    return standardGraph.createWorkflow();
  }

  static async create<T extends t.BaseGraphState>(config: t.RunConfig): Promise<Run<T>> {
    return new Run<T>(config);
  }

  getRunMessages(): BaseMessage[] | undefined {
    if (!this.Graph) {
      throw new Error('Graph not initialized. Make sure to use Run.create() to instantiate the Run.');
    }
    return this.Graph.getRunMessages();
  }

  async processStream(
    inputs: t.IState,
    config: Partial<RunnableConfig> & { version: 'v1' | 'v2'; run_id?: string },
    streamOptions?: t.EventStreamOptions,
  ): Promise<MessageContentComplex[] | undefined> {
    if (!this.graphRunnable) {
      throw new Error('Run not initialized. Make sure to use Run.create() to instantiate the Run.');
    }
    if (!this.Graph) {
      throw new Error('Graph not initialized. Make sure to use Run.create() to instantiate the Run.');
    }

    this.Graph.resetValues(streamOptions?.keepContent);
    const provider = this.Graph.provider;
    const hasTools = this.Graph.tools ? this.Graph.tools.length > 0 : false;
    if (streamOptions?.callbacks) {
      /* TODO: conflicts with callback manager */
      const callbacks = config.callbacks as t.ProvidedCallbacks ?? [];
      config.callbacks = callbacks.concat(this.getCallbacks(streamOptions.callbacks));
    }

    if (!this.id) {
      throw new Error('Run ID not provided');
    }

    config.run_id = this.id;
    config.configurable = Object.assign(config.configurable ?? {}, { run_id: this.id, provider: this.provider });

    const stream = this.graphRunnable.streamEvents(inputs, config);

    for await (const event of stream) {
      const { data, name, metadata, ...info } = event;

      let eventName: t.EventName = info.event;
      if (hasTools && manualToolStreamProviders.has(provider) && eventName === GraphEvents.CHAT_MODEL_STREAM) {
        /* Skipping CHAT_MODEL_STREAM event due to double-call edge case */
        continue;
      }

      if (eventName && eventName === GraphEvents.ON_CUSTOM_EVENT) {
        eventName = name;
      }

      const handler = this.handlerRegistry.getHandler(eventName);
      if (handler) {
        handler.handle(eventName, data, metadata, this.Graph);
      }
    }

    if (this.returnContent) {
      return this.Graph.getContentParts();
    }
  }

  private createSystemCallback<K extends keyof ClientCallbacks>(
    clientCallbacks: ClientCallbacks,
    key: K
  ): SystemCallbacks[K] {
    return ((...args: unknown[]) => {
      const clientCallback = clientCallbacks[key];
      if (clientCallback && this.Graph) {
        (clientCallback as (...args: unknown[]) => void)(this.Graph, ...args);
      }
    }) as SystemCallbacks[K];
  }

  getCallbacks(clientCallbacks: ClientCallbacks): SystemCallbacks {
    return {
      [Callback.TOOL_ERROR]: this.createSystemCallback(clientCallbacks, Callback.TOOL_ERROR),
      [Callback.TOOL_START]: this.createSystemCallback(clientCallbacks, Callback.TOOL_START),
      [Callback.TOOL_END]: this.createSystemCallback(clientCallbacks, Callback.TOOL_END),
    };
  }

  async generateTitle({
    inputText,
    contentParts,
    titlePrompt,
    clientOptions,
    chainOptions,
    skipLanguage,
  } : {
    inputText: string;
    contentParts: (t.MessageContentComplex | undefined)[];
    titlePrompt?: string;
    skipLanguage?: boolean;
    clientOptions?: t.ClientOptions;
    chainOptions?: Partial<RunnableConfig> | undefined;
  }): Promise<{ language: string; title: string }> {
    const convoTemplate = PromptTemplate.fromTemplate('User: {input}\nAI: {output}');
    const response = contentParts.map((part) => {
      if (part?.type === 'text') return part.text;
      return '';
    }).join('\n');
    const convo = (await convoTemplate.invoke({ input: inputText, output: response })).value;
    const model = this.Graph?.getNewModel({
      clientOptions,
      omitOriginalOptions: ['streaming'],
    });
    if (!model) {
      return { language: '', title: '' };
    }
    if (isOpenAILike(this.provider) && (model instanceof ChatOpenAI || model instanceof AzureChatOpenAI)) {
      model.temperature = (clientOptions as t.OpenAIClientOptions | undefined)?.temperature as number;
      model.topP = (clientOptions as t.OpenAIClientOptions | undefined)?.topP as number;
      model.frequencyPenalty = (clientOptions as t.OpenAIClientOptions | undefined)?.frequencyPenalty as number;
      model.presencePenalty = (clientOptions as t.OpenAIClientOptions | undefined)?.presencePenalty as number;
      model.n = (clientOptions as t.OpenAIClientOptions | undefined)?.n as number;
    }
    const chain = await createTitleRunnable(model, titlePrompt);
    return await chain.invoke({ convo, inputText, skipLanguage }, chainOptions) as { language: string; title: string };
  }
}
