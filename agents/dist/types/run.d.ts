import type { BaseMessage, MessageContentComplex } from '@langchain/core/messages';
import type { ClientCallbacks, SystemCallbacks } from '@/graphs/Graph';
import type { RunnableConfig } from '@langchain/core/runnables';
import type * as t from '@/types';
import { Providers } from '@/common';
import { StandardGraph } from '@/graphs/Graph';
export declare class Run<T extends t.BaseGraphState> {
    graphRunnable?: t.CompiledWorkflow<T, Partial<T>, string>;
    private handlerRegistry;
    id: string;
    Graph: StandardGraph | undefined;
    provider: Providers | undefined;
    returnContent: boolean;
    private constructor();
    private createStandardGraph;
    static create<T extends t.BaseGraphState>(config: t.RunConfig): Promise<Run<T>>;
    getRunMessages(): BaseMessage[] | undefined;
    processStream(inputs: t.IState, config: Partial<RunnableConfig> & {
        version: 'v1' | 'v2';
        run_id?: string;
    }, streamOptions?: t.EventStreamOptions): Promise<MessageContentComplex[] | undefined>;
    private createSystemCallback;
    getCallbacks(clientCallbacks: ClientCallbacks): SystemCallbacks;
    generateTitle({ inputText, contentParts, titlePrompt, clientOptions, chainOptions, skipLanguage, }: {
        inputText: string;
        contentParts: (t.MessageContentComplex | undefined)[];
        titlePrompt?: string;
        skipLanguage?: boolean;
        clientOptions?: t.ClientOptions;
        chainOptions?: Partial<RunnableConfig> | undefined;
    }): Promise<{
        language: string;
        title: string;
    }>;
}
