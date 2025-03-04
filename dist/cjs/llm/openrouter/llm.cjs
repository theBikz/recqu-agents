'use strict';

var openai = require('@langchain/openai');

class ChatOpenRouter extends openai.ChatOpenAI {
    constructor(_fields) {
        const { include_reasoning, ...fields } = _fields;
        super({
            ...fields,
            modelKwargs: {
                include_reasoning,
            }
        });
    }
    _convertOpenAIDeltaToBaseMessageChunk(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delta, rawResponse, defaultRole) {
        const messageChunk = super._convertOpenAIDeltaToBaseMessageChunk(delta, rawResponse, defaultRole);
        messageChunk.additional_kwargs.reasoning = delta.reasoning;
        return messageChunk;
    }
}

exports.ChatOpenRouter = ChatOpenRouter;
//# sourceMappingURL=llm.cjs.map
