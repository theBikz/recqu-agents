import { END, MessagesAnnotation } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';
import type * as t from '@/types';
import { RunnableCallable } from '@/utils';
export declare class ToolNode<T = any> extends RunnableCallable<T, T> {
    tools: t.GenericTool[];
    private toolMap;
    private loadRuntimeTools?;
    handleToolErrors: boolean;
    toolCallStepIds?: Map<string, string>;
    constructor({ tools, toolMap, name, tags, toolCallStepIds, handleToolErrors, loadRuntimeTools, }: t.ToolNodeConstructorParams);
    protected run(input: any, config: RunnableConfig): Promise<T>;
}
export declare function toolsCondition(state: BaseMessage[] | typeof MessagesAnnotation.State): 'tools' | typeof END;
