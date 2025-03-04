'use strict';

var prompts = require('@langchain/core/prompts');
var openai = require('@langchain/openai');
var _enum = require('./common/enum.cjs');
var providers = require('./llm/providers.cjs');
var title = require('./utils/title.cjs');
var Graph = require('./graphs/Graph.cjs');
var events = require('./events.cjs');
var llm = require('./utils/llm.cjs');

// src/run.ts
class Run {
    graphRunnable;
    // private collab!: CollabGraph;
    // private taskManager!: TaskManager;
    handlerRegistry;
    id;
    Graph;
    provider;
    returnContent = false;
    constructor(config) {
        const runId = config.runId ?? '';
        if (!runId) {
            throw new Error('Run ID not provided');
        }
        this.id = runId;
        const handlerRegistry = new events.HandlerRegistry();
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
            this.graphRunnable = this.createStandardGraph(config.graphConfig);
            if (this.Graph) {
                this.Graph.handlerRegistry = handlerRegistry;
            }
        }
        this.returnContent = config.returnContent ?? false;
    }
    createStandardGraph(config) {
        const { llmConfig, tools = [], ...graphInput } = config;
        const { provider, ...clientOptions } = llmConfig;
        const standardGraph = new Graph.StandardGraph({
            tools,
            provider,
            clientOptions,
            ...graphInput,
            runId: this.id,
        });
        this.Graph = standardGraph;
        return standardGraph.createWorkflow();
    }
    static async create(config) {
        return new Run(config);
    }
    getRunMessages() {
        if (!this.Graph) {
            throw new Error('Graph not initialized. Make sure to use Run.create() to instantiate the Run.');
        }
        return this.Graph.getRunMessages();
    }
    async processStream(inputs, config, streamOptions) {
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
            const callbacks = config.callbacks ?? [];
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
            let eventName = info.event;
            if (hasTools && providers.manualToolStreamProviders.has(provider) && eventName === _enum.GraphEvents.CHAT_MODEL_STREAM) {
                /* Skipping CHAT_MODEL_STREAM event due to double-call edge case */
                continue;
            }
            if (eventName && eventName === _enum.GraphEvents.ON_CUSTOM_EVENT) {
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
    createSystemCallback(clientCallbacks, key) {
        return ((...args) => {
            const clientCallback = clientCallbacks[key];
            if (clientCallback && this.Graph) {
                clientCallback(this.Graph, ...args);
            }
        });
    }
    getCallbacks(clientCallbacks) {
        return {
            [_enum.Callback.TOOL_ERROR]: this.createSystemCallback(clientCallbacks, _enum.Callback.TOOL_ERROR),
            [_enum.Callback.TOOL_START]: this.createSystemCallback(clientCallbacks, _enum.Callback.TOOL_START),
            [_enum.Callback.TOOL_END]: this.createSystemCallback(clientCallbacks, _enum.Callback.TOOL_END),
        };
    }
    async generateTitle({ inputText, contentParts, titlePrompt, clientOptions, chainOptions, skipLanguage, }) {
        const convoTemplate = prompts.PromptTemplate.fromTemplate('User: {input}\nAI: {output}');
        const response = contentParts.map((part) => {
            if (part?.type === 'text')
                return part.text;
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
        if (llm.isOpenAILike(this.provider) && (model instanceof openai.ChatOpenAI || model instanceof openai.AzureChatOpenAI)) {
            model.temperature = clientOptions?.temperature;
            model.topP = clientOptions?.topP;
            model.frequencyPenalty = clientOptions?.frequencyPenalty;
            model.presencePenalty = clientOptions?.presencePenalty;
            model.n = clientOptions?.n;
        }
        const chain = await title.createTitleRunnable(model, titlePrompt);
        return await chain.invoke({ convo, inputText, skipLanguage }, chainOptions);
    }
}

exports.Run = Run;
//# sourceMappingURL=run.cjs.map
