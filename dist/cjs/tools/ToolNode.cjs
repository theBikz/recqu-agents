'use strict';

var langgraph = require('@langchain/langgraph');
var messages = require('@langchain/core/messages');
var _enum = require('../common/enum.cjs');
var run = require('../utils/run.cjs');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class ToolNode extends run.RunnableCallable {
    tools;
    toolMap;
    loadRuntimeTools;
    handleToolErrors = true;
    toolCallStepIds;
    constructor({ tools, toolMap, name, tags, toolCallStepIds, handleToolErrors, loadRuntimeTools, }) {
        super({ name, tags, func: (input, config) => this.run(input, config) });
        this.tools = tools;
        this.toolMap = toolMap ?? new Map(tools.map(tool => [tool.name, tool]));
        this.toolCallStepIds = toolCallStepIds;
        this.handleToolErrors = handleToolErrors ?? this.handleToolErrors;
        this.loadRuntimeTools = loadRuntimeTools;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async run(input, config) {
        const message = Array.isArray(input)
            ? input[input.length - 1]
            : input.messages[input.messages.length - 1];
        if (message._getType() !== 'ai') {
            throw new Error('ToolNode only accepts AIMessages as input.');
        }
        if (this.loadRuntimeTools) {
            const { tools, toolMap } = this.loadRuntimeTools(message.tool_calls ?? []);
            this.tools = tools;
            this.toolMap = toolMap ?? new Map(tools.map(tool => [tool.name, tool]));
        }
        const outputs = await Promise.all(message.tool_calls?.map(async (call) => {
            const tool = this.toolMap.get(call.name);
            try {
                if (tool === undefined) {
                    throw new Error(`Tool "${call.name}" not found.`);
                }
                const args = call.args;
                const stepId = this.toolCallStepIds?.get(call.id);
                const output = await tool.invoke({ ...call, args, type: 'tool_call', stepId }, config);
                if ((messages.isBaseMessage(output) && output._getType() === 'tool') ||
                    langgraph.isCommand(output)) {
                    return output;
                }
                else {
                    return new messages.ToolMessage({
                        name: tool.name,
                        content: typeof output === 'string' ? output : JSON.stringify(output),
                        tool_call_id: call.id,
                    });
                }
            }
            catch (_e) {
                const e = _e;
                if (!this.handleToolErrors) {
                    throw e;
                }
                if (langgraph.isGraphInterrupt(e)) {
                    throw e;
                }
                return new messages.ToolMessage({
                    content: `Error: ${e.message}\n Please fix your mistakes.`,
                    name: call.name,
                    tool_call_id: call.id ?? '',
                });
            }
        }) ?? []);
        if (!outputs.some(langgraph.isCommand)) {
            return (Array.isArray(input) ? outputs : { messages: outputs });
        }
        const combinedOutputs = outputs.map((output) => {
            if (langgraph.isCommand(output)) {
                return output;
            }
            return Array.isArray(input) ? [output] : { messages: [output] };
        });
        return combinedOutputs;
    }
}
function toolsCondition(state) {
    const message = Array.isArray(state)
        ? state[state.length - 1]
        : state.messages[state.messages.length - 1];
    if ('tool_calls' in message &&
        (message.tool_calls?.length ?? 0) > 0) {
        return _enum.GraphNodeKeys.TOOLS;
    }
    else {
        return langgraph.END;
    }
}

exports.ToolNode = ToolNode;
exports.toolsCondition = toolsCondition;
//# sourceMappingURL=ToolNode.cjs.map
