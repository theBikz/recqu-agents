'use strict';

var nanoid = require('nanoid');
var stream = require('@langchain/core/utils/stream');
var googleVertexai = require('@langchain/google-vertexai');
var langgraph = require('@langchain/langgraph');
var openai = require('@langchain/openai');
var dispatch = require('@langchain/core/callbacks/dispatch');
var messages = require('@langchain/core/messages');
var _enum = require('../common/enum.cjs');
var providers = require('../llm/providers.cjs');
var ToolNode = require('../tools/ToolNode.cjs');
var messages$1 = require('../messages.cjs');
var graph = require('../utils/graph.cjs');
var llm = require('../utils/llm.cjs');
var run = require('../utils/run.cjs');
var fake = require('../llm/fake.cjs');

// src/graphs/Graph.ts
const { AGENT, TOOLS } = _enum.GraphNodeKeys;
class Graph {
    lastToken;
    tokenTypeSwitch;
    reasoningKey = 'reasoning_content';
    currentTokenType = _enum.ContentTypes.TEXT;
    messageStepHasToolCalls = new Map();
    messageIdsByStepKey = new Map();
    prelimMessageIdsByStepKey = new Map();
    config;
    contentData = [];
    stepKeyIds = new Map();
    contentIndexMap = new Map();
    toolCallStepIds = new Map();
    /** The amount of time that should pass before another consecutive API call */
    streamBuffer;
    signal;
}
class StandardGraph extends Graph {
    graphState;
    clientOptions;
    boundModel;
    /** The last recorded timestamp that a stream API call was invoked */
    lastStreamCall;
    handlerRegistry;
    systemMessage;
    messages = [];
    runId;
    tools;
    toolMap;
    startIndex = 0;
    provider;
    toolEnd;
    signal;
    constructor({ runId, tools, signal, toolMap, provider, streamBuffer, instructions, reasoningKey, clientOptions, toolEnd = false, additional_instructions = '', }) {
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
            this.systemMessage = new messages.SystemMessage(finalInstructions);
        }
    }
    /* Init */
    resetValues(keepContent) {
        this.messages = [];
        this.config = graph.resetIfNotEmpty(this.config, undefined);
        if (keepContent !== true) {
            this.contentData = graph.resetIfNotEmpty(this.contentData, []);
            this.contentIndexMap = graph.resetIfNotEmpty(this.contentIndexMap, new Map());
        }
        this.stepKeyIds = graph.resetIfNotEmpty(this.stepKeyIds, new Map());
        this.toolCallStepIds = graph.resetIfNotEmpty(this.toolCallStepIds, new Map());
        this.messageIdsByStepKey = graph.resetIfNotEmpty(this.messageIdsByStepKey, new Map());
        this.messageStepHasToolCalls = graph.resetIfNotEmpty(this.prelimMessageIdsByStepKey, new Map());
        this.prelimMessageIdsByStepKey = graph.resetIfNotEmpty(this.prelimMessageIdsByStepKey, new Map());
        this.currentTokenType = graph.resetIfNotEmpty(this.currentTokenType, _enum.ContentTypes.TEXT);
        this.lastToken = graph.resetIfNotEmpty(this.lastToken, undefined);
        this.tokenTypeSwitch = graph.resetIfNotEmpty(this.tokenTypeSwitch, undefined);
    }
    /* Run Step Processing */
    getRunStep(stepId) {
        const index = this.contentIndexMap.get(stepId);
        if (index !== undefined) {
            return this.contentData[index];
        }
        return undefined;
    }
    getStepKey(metadata) {
        if (!metadata)
            return '';
        const keyList = this.getKeyList(metadata);
        if (this.checkKeyList(keyList)) {
            throw new Error('Missing metadata');
        }
        return graph.joinKeys(keyList);
    }
    getStepIdByKey(stepKey, index) {
        const stepIds = this.stepKeyIds.get(stepKey);
        if (!stepIds) {
            throw new Error(`No step IDs found for stepKey ${stepKey}`);
        }
        if (index === undefined) {
            return stepIds[stepIds.length - 1];
        }
        return stepIds[index];
    }
    generateStepId(stepKey) {
        const stepIds = this.stepKeyIds.get(stepKey);
        let newStepId;
        let stepIndex = 0;
        if (stepIds) {
            stepIndex = stepIds.length;
            newStepId = `step_${nanoid.nanoid()}`;
            stepIds.push(newStepId);
            this.stepKeyIds.set(stepKey, stepIds);
        }
        else {
            newStepId = `step_${nanoid.nanoid()}`;
            this.stepKeyIds.set(stepKey, [newStepId]);
        }
        return [newStepId, stepIndex];
    }
    getKeyList(metadata) {
        if (!metadata)
            return [];
        const keyList = [
            metadata.run_id,
            metadata.thread_id,
            metadata.langgraph_node,
            metadata.langgraph_step,
            metadata.checkpoint_ns,
        ];
        if (this.currentTokenType === _enum.ContentTypes.THINK) {
            keyList.push('reasoning');
        }
        return keyList;
    }
    checkKeyList(keyList) {
        return keyList.some((key) => key === undefined);
    }
    /* Misc.*/
    getRunMessages() {
        return this.messages.slice(this.startIndex);
    }
    getContentParts() {
        return messages$1.convertMessagesToContent(this.messages.slice(this.startIndex));
    }
    /* Graph */
    createGraphState() {
        return {
            messages: {
                value: (x, y) => {
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
    initializeTools() {
        // return new ToolNode<t.BaseGraphState>(this.tools);
        return new ToolNode.ToolNode({
            tools: this.tools || [],
            toolMap: this.toolMap,
            toolCallStepIds: this.toolCallStepIds,
        });
    }
    initializeModel() {
        const ChatModelClass = providers.getChatModelClass(this.provider);
        const model = new ChatModelClass(this.clientOptions);
        if (llm.isOpenAILike(this.provider) && (model instanceof openai.ChatOpenAI || model instanceof openai.AzureChatOpenAI)) {
            model.temperature = this.clientOptions.temperature;
            model.topP = this.clientOptions.topP;
            model.frequencyPenalty = this.clientOptions.frequencyPenalty;
            model.presencePenalty = this.clientOptions.presencePenalty;
            model.n = this.clientOptions.n;
        }
        else if (this.provider === _enum.Providers.VERTEXAI && model instanceof googleVertexai.ChatVertexAI) {
            model.temperature = this.clientOptions.temperature;
            model.topP = this.clientOptions.topP;
            model.topK = this.clientOptions.topK;
            model.topLogprobs = this.clientOptions.topLogprobs;
            model.frequencyPenalty = this.clientOptions.frequencyPenalty;
            model.presencePenalty = this.clientOptions.presencePenalty;
            model.maxOutputTokens = this.clientOptions.maxOutputTokens;
        }
        if (!this.tools || this.tools.length === 0) {
            return model;
        }
        return model.bindTools(this.tools);
    }
    overrideTestModel(responses, sleep) {
        this.boundModel = fake.createFakeStreamingLLM(responses, sleep);
    }
    getNewModel({ clientOptions = {}, omitOriginalOptions, }) {
        const ChatModelClass = providers.getChatModelClass(this.provider);
        const _options = omitOriginalOptions ? Object.fromEntries(Object.entries(this.clientOptions).filter(([key]) => !omitOriginalOptions.includes(key))) : this.clientOptions;
        const options = Object.assign(_options, clientOptions);
        return new ChatModelClass(options);
    }
    createCallModel() {
        return async (state, config) => {
            const { provider = '' } = config?.configurable ?? {};
            if (!config || !provider) {
                throw new Error(`No ${config ? 'provider' : 'config'} provided`);
            }
            if (!config.signal) {
                config.signal = this.signal;
            }
            this.config = config;
            const { messages: messages$2 } = state;
            const finalMessages = messages$2;
            const lastMessageX = finalMessages[finalMessages.length - 2];
            const lastMessageY = finalMessages[finalMessages.length - 1];
            if (provider === _enum.Providers.BEDROCK
                && lastMessageX instanceof messages.AIMessageChunk
                && lastMessageY instanceof messages.ToolMessage
                && typeof lastMessageX.content === 'string') {
                finalMessages[finalMessages.length - 2].content = '';
            }
            const isLatestToolMessage = lastMessageY instanceof messages.ToolMessage;
            if (isLatestToolMessage && provider === _enum.Providers.ANTHROPIC) {
                messages$1.formatAnthropicArtifactContent(finalMessages);
            }
            else if (isLatestToolMessage &&
                (llm.isOpenAILike(provider) || llm.isGoogleLike(provider))) {
                messages$1.formatArtifactPayload(finalMessages);
            }
            if (this.lastStreamCall != null && this.streamBuffer != null) {
                const timeSinceLastCall = Date.now() - this.lastStreamCall;
                if (timeSinceLastCall < this.streamBuffer) {
                    const timeToWait = Math.ceil((this.streamBuffer - timeSinceLastCall) / 1000) * 1000;
                    await run.sleep(timeToWait);
                }
            }
            this.lastStreamCall = Date.now();
            if ((this.tools?.length ?? 0) > 0 && providers.manualToolStreamProviders.has(provider)) {
                const stream$1 = await this.boundModel.stream(finalMessages, config);
                let finalChunk;
                for await (const chunk of stream$1) {
                    dispatch.dispatchCustomEvent(_enum.GraphEvents.CHAT_MODEL_STREAM, { chunk }, config);
                    if (!finalChunk) {
                        finalChunk = chunk;
                    }
                    else {
                        finalChunk = stream.concat(finalChunk, chunk);
                    }
                }
                finalChunk = messages$1.modifyDeltaProperties(finalChunk);
                return { messages: [finalChunk] };
            }
            const finalMessage = (await this.boundModel.invoke(finalMessages, config));
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
    createWorkflow() {
        const routeMessage = (state, config) => {
            this.config = config;
            // const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
            // if (!lastMessage?.tool_calls?.length) {
            //   return END;
            // }
            // return TOOLS;
            return ToolNode.toolsCondition(state);
        };
        const workflow = new langgraph.StateGraph({
            channels: this.graphState,
        })
            .addNode(AGENT, this.createCallModel())
            .addNode(TOOLS, this.initializeTools())
            .addEdge(langgraph.START, AGENT)
            .addConditionalEdges(AGENT, routeMessage)
            .addEdge(TOOLS, this.toolEnd ? langgraph.END : AGENT);
        return workflow.compile();
    }
    /* Dispatchers */
    /**
     * Dispatches a run step to the client, returns the step ID
     */
    dispatchRunStep(stepKey, stepDetails) {
        if (!this.config) {
            throw new Error('No config provided');
        }
        const [stepId, stepIndex] = this.generateStepId(stepKey);
        if (stepDetails.type === _enum.StepTypes.TOOL_CALLS && stepDetails.tool_calls) {
            for (const tool_call of stepDetails.tool_calls) {
                const toolCallId = tool_call.id ?? '';
                if (!toolCallId || this.toolCallStepIds.has(toolCallId)) {
                    continue;
                }
                this.toolCallStepIds.set(toolCallId, stepId);
            }
        }
        const runStep = {
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
        dispatch.dispatchCustomEvent(_enum.GraphEvents.ON_RUN_STEP, runStep, this.config);
        return stepId;
    }
    handleToolCallCompleted(data, metadata) {
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
        this.handlerRegistry?.getHandler(_enum.GraphEvents.ON_RUN_STEP_COMPLETED)?.handle(_enum.GraphEvents.ON_RUN_STEP_COMPLETED, { result: {
                id: stepId,
                index: runStep.index,
                type: 'tool_call',
                tool_call
            },
        }, metadata, this);
    }
    dispatchRunStepDelta(id, delta) {
        if (!this.config) {
            throw new Error('No config provided');
        }
        else if (!id) {
            throw new Error('No step ID found');
        }
        const runStepDelta = {
            id,
            delta,
        };
        dispatch.dispatchCustomEvent(_enum.GraphEvents.ON_RUN_STEP_DELTA, runStepDelta, this.config);
    }
    dispatchMessageDelta(id, delta) {
        if (!this.config) {
            throw new Error('No config provided');
        }
        const messageDelta = {
            id,
            delta,
        };
        dispatch.dispatchCustomEvent(_enum.GraphEvents.ON_MESSAGE_DELTA, messageDelta, this.config);
    }
    dispatchReasoningDelta = (stepId, delta) => {
        if (!this.config) {
            throw new Error('No config provided');
        }
        const reasoningDelta = {
            id: stepId,
            delta,
        };
        dispatch.dispatchCustomEvent(_enum.GraphEvents.ON_REASONING_DELTA, reasoningDelta, this.config);
    };
}

exports.Graph = Graph;
exports.StandardGraph = StandardGraph;
//# sourceMappingURL=Graph.cjs.map
