import type { Runnable } from '@langchain/core/runnables';
import * as t from '@/types';
export declare const createTitleRunnable: (model: t.ChatModelInstance, _titlePrompt?: string) => Promise<Runnable>;
