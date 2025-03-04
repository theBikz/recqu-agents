'use strict';

var testing = require('@langchain/core/utils/testing');

class FakeChatModel extends testing.FakeListChatModel {
    splitStrategy;
    constructor({ responses, sleep, emitCustomEvent, splitStrategy = { type: 'regex', value: /(?<=\s+)|(?=\s+)/ } }) {
        super({ responses, sleep, emitCustomEvent });
        this.splitStrategy = splitStrategy;
    }
    splitText(text) {
        if (this.splitStrategy.type === 'regex') {
            return text.split(this.splitStrategy.value);
        }
        else {
            const chunkSize = this.splitStrategy.value;
            const chunks = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.slice(i, i + chunkSize));
            }
            return chunks;
        }
    }
    async *_streamResponseChunks(_messages, options, runManager) {
        const response = this._currentResponse();
        this._incrementResponse();
        if (this.emitCustomEvent) {
            await runManager?.handleCustomEvent('some_test_event', {
                someval: true,
            });
        }
        const chunks = this.splitText(response);
        for await (const chunk of chunks) {
            await this._sleepIfRequested();
            if (options.thrownErrorString != null && options.thrownErrorString) {
                throw new Error(options.thrownErrorString);
            }
            const responseChunk = this._createResponseChunk(chunk);
            yield responseChunk;
            void runManager?.handleLLMNewToken(chunk);
        }
    }
}
function createFakeStreamingLLM(responses, sleep, splitStrategy) {
    return new FakeChatModel({
        sleep,
        responses,
        emitCustomEvent: true,
        splitStrategy,
    });
}

exports.FakeChatModel = FakeChatModel;
exports.createFakeStreamingLLM = createFakeStreamingLLM;
//# sourceMappingURL=fake.cjs.map
