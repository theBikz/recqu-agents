'use strict';

var zod = require('zod');
var prompts = require('@langchain/core/prompts');
var runnables = require('@langchain/core/runnables');

const defaultTitlePrompt = `Write a concise title for this conversation in the detected language. Title in 5 Words or Less. No Punctuation or Quotation.
{convo}`;
const languageInstructions = 'Detect the language used in the following text. Note: words may be misspelled or cut off; use context clues to identify the language:\n{text}';
const languagePrompt = prompts.ChatPromptTemplate.fromTemplate(languageInstructions);
const languageSchema = zod.z.object({
    language: zod.z.string().describe('The detected language of the conversation')
});
const titleSchema = zod.z.object({
    title: zod.z.string().describe('A concise title for the conversation in 5 words or less, without punctuation or quotation'),
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
    const titlePrompt = prompts.ChatPromptTemplate.fromTemplate(_titlePrompt ?? defaultTitlePrompt);
    return new runnables.RunnableLambda({
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

exports.createTitleRunnable = createTitleRunnable;
//# sourceMappingURL=title.cjs.map
