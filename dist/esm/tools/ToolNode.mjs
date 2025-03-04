import { isCommand, isGraphInterrupt, END } from '@langchain/langgraph';
import { isBaseMessage, ToolMessage } from '@langchain/core/messages';
import { GraphNodeKeys } from '../common/enum.mjs';
import { RunnableCallable } from '../utils/run.mjs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class ToolNode extends RunnableCallable {
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
                if ((isBaseMessage(output) && output._getType() === 'tool') ||
                    isCommand(output)) {
                    return output;
                }
                else {
                    return new ToolMessage({
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
                if (isGraphInterrupt(e)) {
                    throw e;
                }
                return new ToolMessage({
                    content: `Error: ${e.message}\n Please fix your mistakes.`,
                    name: call.name,
                    tool_call_id: call.id ?? '',
                });
            }
        }) ?? []);
        if (!outputs.some(isCommand)) {
            return (Array.isArray(input) ? outputs : { messages: outputs });
        }
        const combinedOutputs = outputs.map((output) => {
            if (isCommand(output)) {
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
        return GraphNodeKeys.TOOLS;
    }
    else {
        return END;
    }
}

export { ToolNode, toolsCondition };
//# sourceMappingURL=ToolNode.mjs.map
