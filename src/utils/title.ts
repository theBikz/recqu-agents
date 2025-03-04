import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';
import type { Runnable } from '@langchain/core/runnables';
import * as t from '@/types';

const defaultTitlePrompt = `Write a concise title for this conversation in the detected language. Title in 5 Words or Less. No Punctuation or Quotation.
{convo}`;

const languageInstructions = 'Detect the language used in the following text. Note: words may be misspelled or cut off; use context clues to identify the language:\n{text}';

const languagePrompt = ChatPromptTemplate.fromTemplate(languageInstructions);

const languageSchema = z.object({
  language: z.string().describe('The detected language of the conversation')
});

const titleSchema = z.object({
  title: z.string().describe('A concise title for the conversation in 5 words or less, without punctuation or quotation'),
});

export const createTitleRunnable = async (model: t.ChatModelInstance, _titlePrompt?: string): Promise<Runnable> => {
  // Disabled since this works fine
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  /* @ts-ignore */
  const languageLLM = model.withStructuredOutput(languageSchema);
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  /* @ts-ignore */
  const titleLLM = model.withStructuredOutput(titleSchema);

  const languageChain = languagePrompt.pipe(languageLLM);

  const titlePrompt = ChatPromptTemplate.fromTemplate(_titlePrompt ?? defaultTitlePrompt);

  return new RunnableLambda({
    func: async (input: { convo: string, inputText: string, skipLanguage: boolean }): Promise<{ language: string; title: string } | { title: string }> => {
      if (input.skipLanguage) {
        return await titlePrompt.pipe(titleLLM).invoke({
          convo: input.convo
        }) as { title: string };
      }
      const languageResult = await languageChain.invoke({ text: input.inputText }) as { language: string } | undefined;
      const language = languageResult?.language ?? 'English';
      const titleResult = await titlePrompt.pipe(titleLLM).invoke({
        language,
        convo: input.convo
      }) as { title: string } | undefined;
      return { language, title: titleResult?.title ?? '' };
    },
  });
};