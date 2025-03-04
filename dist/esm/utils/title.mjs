import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';

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
const createTitleRunnable = async (model, _titlePrompt) => {
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
        func: async (input) => {
            if (input.skipLanguage) {
                return await titlePrompt.pipe(titleLLM).invoke({
                    convo: input.convo
                });
            }
            const languageResult = await languageChain.invoke({ text: input.inputText });
            const language = languageResult?.language ?? 'English';
            const titleResult = await titlePrompt.pipe(titleLLM).invoke({
                language,
                convo: input.convo
            });
            return { language, title: titleResult?.title ?? '' };
        },
    });
};

export { createTitleRunnable };
//# sourceMappingURL=title.mjs.map
