// src/stream.ts
import { nanoid } from 'nanoid';
import type { AIMessageChunk } from '@langchain/core/messages';
import type { ToolCall, ToolCallChunk } from '@langchain/core/messages/tool';
import type { Graph } from '@/graphs';
import type * as t from '@/types';
import { StepTypes, ContentTypes, GraphEvents, ToolCallTypes } from '@/common';

function getNonEmptyValue(possibleValues: string[]): string | undefined {
  for (const value of possibleValues) {
    if (value && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

export const getMessageId = (stepKey: string, graph: Graph<t.BaseGraphState>, returnExistingId = false): string | undefined => {
  const messageId = graph.messageIdsByStepKey.get(stepKey);
  if (messageId != null && messageId) {
    return returnExistingId ? messageId : undefined;
  }

  const prelimMessageId = graph.prelimMessageIdsByStepKey.get(stepKey);
  if (prelimMessageId != null && prelimMessageId) {
    graph.prelimMessageIdsByStepKey.delete(stepKey);
    graph.messageIdsByStepKey.set(stepKey, prelimMessageId);
    return prelimMessageId;
  }

  const message_id = `msg_${nanoid()}`;
  graph.messageIdsByStepKey.set(stepKey, message_id);
  return message_id;
};

export const handleToolCalls = (toolCalls?: ToolCall[], metadata?: Record<string, unknown>, graph?: Graph): void => {
  if (!graph || !metadata) {
    console.warn(`Graph or metadata not found in ${event} event`);
    return;
  }

  if (!toolCalls) {
    return;
  }

  if (toolCalls.length === 0) {
    return;
  }

  const tool_calls: ToolCall[] = [];
  const tool_call_ids: string[] = [];
  for (const tool_call of toolCalls) {
    const toolCallId = tool_call.id ?? `toolu_${nanoid()}`;
    tool_call.id = toolCallId;
    if (!toolCallId || graph.toolCallStepIds.has(toolCallId)) {
      continue;
    }

    tool_calls.push(tool_call);
    tool_call_ids.push(toolCallId);
  }

  const stepKey = graph.getStepKey(metadata);

  let prevStepId = '';
  let prevRunStep: t.RunStep | undefined;
  try {
    prevStepId = graph.getStepIdByKey(stepKey, graph.contentData.length - 1);
    prevRunStep = graph.getRunStep(prevStepId);
  } catch (e) {
    // no previous step
  }

  const dispatchToolCallIds = (lastMessageStepId: string): void => {
    graph.dispatchMessageDelta(lastMessageStepId, {
      content: [{
        type: 'text',
        text: '',
        tool_call_ids,
      }],
    });
  };
    /* If the previous step exists and is a message creation */
  if (prevStepId && prevRunStep && prevRunStep.type === StepTypes.MESSAGE_CREATION) {
    dispatchToolCallIds(prevStepId);
    graph.messageStepHasToolCalls.set(prevStepId, true);
    /* If the previous step doesn't exist or is not a message creation */
  } else if (!prevRunStep || prevRunStep.type !== StepTypes.MESSAGE_CREATION) {
    const messageId = getMessageId(stepKey, graph, true) ?? '';
    const stepId = graph.dispatchRunStep(stepKey, {
      type: StepTypes.MESSAGE_CREATION,
      message_creation: {
        message_id: messageId,
      },
    });
    dispatchToolCallIds(stepId);
    graph.messageStepHasToolCalls.set(prevStepId, true);
  }
  graph.dispatchRunStep(stepKey, {
    type: StepTypes.TOOL_CALLS,
    tool_calls,
  });
};

export class ChatModelStreamHandler implements t.EventHandler {
  handle(event: string, data: t.StreamEventData, metadata?: Record<string, unknown>, graph?: Graph): void {
    if (!graph) {
      throw new Error('Graph not found');
    }
    if (!graph.config) {
      throw new Error('Config not found in graph');
    }
    if (!data.chunk) {
      console.warn(`No chunk found in ${event} event`);
      return;
    }

    const chunk = data.chunk as Partial<AIMessageChunk>;
    const content = (chunk.additional_kwargs?.[graph.reasoningKey] as string | undefined) ?? chunk.content;
    this.handleReasoning(chunk, graph);

    let hasToolCalls = false;
    if (chunk.tool_calls && chunk.tool_calls.length > 0 && chunk.tool_calls.every((tc) => tc.id)) {
      hasToolCalls = true;
      handleToolCalls(chunk.tool_calls, metadata, graph);
    }

    const hasToolCallChunks = (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) ?? false;
    const isEmptyContent = typeof content === 'undefined' || !content.length || typeof content === 'string' && !content;
    const isEmptyChunk = isEmptyContent && !hasToolCallChunks;
    const chunkId = chunk.id ?? '';
    if (isEmptyChunk && chunkId && chunkId.startsWith('msg')) {
      if (graph.messageIdsByStepKey.has(chunkId)) {
        return;
      } else if (graph.prelimMessageIdsByStepKey.has(chunkId)) {
        return;
      }

      const stepKey = graph.getStepKey(metadata);
      graph.prelimMessageIdsByStepKey.set(stepKey, chunkId);
      return;
    } else if (isEmptyChunk) {
      return;
    }

    const stepKey = graph.getStepKey(metadata);

    if (hasToolCallChunks
      && chunk.tool_call_chunks
      && chunk.tool_call_chunks.length
      && typeof chunk.tool_call_chunks[0]?.index === 'number') {
      this.handleToolCallChunks({ graph, stepKey, toolCallChunks: chunk.tool_call_chunks });
    }

    if (isEmptyContent) {
      return;
    }

    const message_id = getMessageId(stepKey, graph) ?? '';
    if (message_id) {
      graph.dispatchRunStep(stepKey, {
        type: StepTypes.MESSAGE_CREATION,
        message_creation: {
          message_id,
        },
      });
    }

    const stepId = graph.getStepIdByKey(stepKey);
    const runStep = graph.getRunStep(stepId);
    if (!runStep) {
      // eslint-disable-next-line no-console
      console.warn(`\n
==============================================================


Run step for ${stepId} does not exist, cannot dispatch delta event.

event: ${event}
stepId: ${stepId}
stepKey: ${stepKey}
message_id: ${message_id}
hasToolCalls: ${hasToolCalls}
hasToolCallChunks: ${hasToolCallChunks}

==============================================================
\n`);
      return;
    }

    /* Note: tool call chunks may have non-empty content that matches the current tool chunk generation */
    if (typeof content === 'string' && runStep.type === StepTypes.TOOL_CALLS) {
      return;
    } else if (hasToolCallChunks && (chunk.tool_call_chunks?.some((tc) => tc.args === content) ?? false)) {
      return;
    } else if (typeof content === 'string') {
      if (graph.currentTokenType === ContentTypes.TEXT) {
        graph.dispatchMessageDelta(stepId, {
          content: [{
            type: ContentTypes.TEXT,
            text: content,
          }],
        });
      } else {
        graph.dispatchReasoningDelta(stepId, {
          content: [{
            type: ContentTypes.THINK,
            think: content,
          }],
        });
      }
    } else if (content.every((c) => c.type?.startsWith(ContentTypes.TEXT))) {
      graph.dispatchMessageDelta(stepId, {
        content,
      });
    }
  }
  handleToolCallChunks = ({
    graph,
    stepKey,
    toolCallChunks,
  }: {
    graph: Graph;
    stepKey: string;
    toolCallChunks: ToolCallChunk[],
  }): void => {
    const prevStepId = graph.getStepIdByKey(stepKey, graph.contentData.length - 1);
    const prevRunStep = graph.getRunStep(prevStepId);
    const _stepId = graph.getStepIdByKey(stepKey, prevRunStep?.index);
    /** Edge Case: Tool Call Run Step or `tool_call_ids` never dispatched */
    const tool_calls: ToolCall[] | undefined =
    prevStepId && prevRunStep && prevRunStep.type === StepTypes.MESSAGE_CREATION
      ? []
      : undefined;
    /** Edge Case: `id` and `name` fields cannot be empty strings */
    for (const toolCallChunk of toolCallChunks) {
      if (toolCallChunk.name === '') {
        toolCallChunk.name = undefined;
      }
      if (toolCallChunk.id === '') {
        toolCallChunk.id = undefined;
      } else if (tool_calls != null && toolCallChunk.id != null && toolCallChunk.name != null) {
        tool_calls.push({
          args: {},
          id: toolCallChunk.id,
          name: toolCallChunk.name,
          type: ToolCallTypes.TOOL_CALL,
        });
      }
    }

    let stepId: string = _stepId;
    const alreadyDispatched = prevRunStep?.type === StepTypes.MESSAGE_CREATION && graph.messageStepHasToolCalls.has(prevStepId);
    if (!alreadyDispatched && tool_calls?.length === toolCallChunks.length) {
      graph.dispatchMessageDelta(prevStepId, {
        content: [{
          type: ContentTypes.TEXT,
          text: '',
          tool_call_ids: tool_calls.map((tc) => tc.id ?? ''),
        }],
      });
      graph.messageStepHasToolCalls.set(prevStepId, true);
      stepId = graph.dispatchRunStep(stepKey, {
        type: StepTypes.TOOL_CALLS,
        tool_calls,
      });
    }
    graph.dispatchRunStepDelta(stepId, {
      type: StepTypes.TOOL_CALLS,
      tool_calls: toolCallChunks,
    });
  };
  handleReasoning(chunk: Partial<AIMessageChunk>, graph: Graph): void {
    const reasoning_content = chunk.additional_kwargs?.[graph.reasoningKey] as string | undefined;
    if (reasoning_content != null && reasoning_content && (chunk.content == null || chunk.content === '')) {
      graph.currentTokenType = ContentTypes.THINK;
      graph.tokenTypeSwitch = 'reasoning';
      return;
    } else if (graph.tokenTypeSwitch === 'reasoning' && graph.currentTokenType !== ContentTypes.TEXT && chunk.content != null && chunk.content !== '') {
      graph.currentTokenType = ContentTypes.TEXT;
      graph.tokenTypeSwitch = 'content';
    } else if (chunk.content != null && typeof chunk.content === 'string' && chunk.content.includes('<think>')) {
      graph.currentTokenType = ContentTypes.THINK;
      graph.tokenTypeSwitch = 'content';
    } else if (graph.lastToken != null && graph.lastToken.includes('</think>')) {
      graph.currentTokenType = ContentTypes.TEXT;
      graph.tokenTypeSwitch = 'content';
    }
    if (typeof chunk.content !== 'string') {
      return;
    }
    graph.lastToken = chunk.content;
  }
}

export function createContentAggregator(): t.ContentAggregatorResult {
  const contentParts: Array<t.MessageContentComplex | undefined> = [];
  const stepMap = new Map<string, t.RunStep>();
  const toolCallIdMap = new Map<string, string>();

  const updateContent = (
    index: number,
    contentPart: t.MessageContentComplex,
    finalUpdate = false,
  ): void => {
    const partType = contentPart.type ?? '';
    if (!partType) {
      console.warn('No content type found in content part');
      return;
    }

    if (!contentParts[index]) {
      contentParts[index] = { type: partType };
    }

    if (!partType.startsWith(contentParts[index]?.type ?? '')) {
      console.warn('Content type mismatch');
      return;
    }

    if (
      partType.startsWith(ContentTypes.TEXT) &&
      ContentTypes.TEXT in contentPart &&
      typeof contentPart.text === 'string'
    ) {
      // TODO: update this!!
      const currentContent = contentParts[index] as t.MessageDeltaUpdate;
      const update: t.MessageDeltaUpdate = {
        type: ContentTypes.TEXT,
        text: (currentContent.text || '') + contentPart.text,
      };

      if (contentPart.tool_call_ids) {
        update.tool_call_ids = contentPart.tool_call_ids;
      }
      contentParts[index] = update;
    } else if (
      partType.startsWith(ContentTypes.THINK) &&
      ContentTypes.THINK in contentPart &&
      typeof contentPart.think === 'string'
    ) {
      const currentContent = contentParts[index] as t.ReasoningDeltaUpdate;
      const update: t.ReasoningDeltaUpdate = {
        type: ContentTypes.THINK,
        think: (currentContent.think || '') + contentPart.think,
      };
      contentParts[index] = update;
    } else if (partType === ContentTypes.IMAGE_URL && 'image_url' in contentPart) {
      const currentContent = contentParts[index] as { type: 'image_url'; image_url: string };
      contentParts[index] = {
        ...currentContent,
      };
    } else if (partType === ContentTypes.TOOL_CALL && 'tool_call' in contentPart) {
      const existingContent = contentParts[index] as Omit<t.ToolCallContent, 'tool_call'> & { tool_call?: ToolCall } | undefined;

      const args = finalUpdate
        ? contentPart.tool_call.args
        : (existingContent?.tool_call?.args || '') + (contentPart.tool_call.args ?? '');

      const id = getNonEmptyValue([contentPart.tool_call.id, existingContent?.tool_call?.id]) ?? '';
      const name =
        getNonEmptyValue([contentPart.tool_call.name, existingContent?.tool_call?.name]) ?? '';

      const newToolCall: ToolCall & t.PartMetadata = {
        id,
        name,
        args,
        type: ToolCallTypes.TOOL_CALL,
      };

      if (finalUpdate) {
        newToolCall.progress = 1;
        newToolCall.output = contentPart.tool_call.output;
      }

      contentParts[index] = {
        type: ContentTypes.TOOL_CALL,
        tool_call: newToolCall,
      };
    }
  };

  const aggregateContent = ({ event, data }: {
    event: GraphEvents;
    data: t.RunStep | t.MessageDeltaEvent | t.RunStepDeltaEvent | { result: t.ToolEndEvent };
  }): void => {

    if (event === GraphEvents.ON_RUN_STEP) {
      const runStep = data as t.RunStep;
      stepMap.set(runStep.id, runStep);

      // Store tool call IDs if present
      if (runStep.stepDetails.type === StepTypes.TOOL_CALLS && runStep.stepDetails.tool_calls) {
        runStep.stepDetails.tool_calls.forEach((toolCall) => {
          const toolCallId = toolCall.id ?? '';
          if ('id' in toolCall && toolCallId) {
            toolCallIdMap.set(runStep.id, toolCallId);
          }
        });
      }
    } else if (event === GraphEvents.ON_MESSAGE_DELTA) {
      const messageDelta = data as t.MessageDeltaEvent;
      const runStep = stepMap.get(messageDelta.id);
      if (!runStep) {
        console.warn('No run step or runId found for message delta event');
        return;
      }

      if (messageDelta.delta.content) {
        const contentPart = Array.isArray(messageDelta.delta.content)
          ? messageDelta.delta.content[0]
          : messageDelta.delta.content;

        updateContent(runStep.index, contentPart);
      }
    } else if (event === GraphEvents.ON_REASONING_DELTA) {
      const reasoningDelta = data as t.ReasoningDeltaEvent;
      const runStep = stepMap.get(reasoningDelta.id);
      if (!runStep) {
        console.warn('No run step or runId found for reasoning delta event');
        return;
      }

      if (reasoningDelta.delta.content) {
        const contentPart = Array.isArray(reasoningDelta.delta.content)
          ? reasoningDelta.delta.content[0]
          : reasoningDelta.delta.content;

        updateContent(runStep.index, contentPart);
      }
    } else if (event === GraphEvents.ON_RUN_STEP_DELTA) {
      const runStepDelta = data as t.RunStepDeltaEvent;
      const runStep = stepMap.get(runStepDelta.id);
      if (!runStep) {
        console.warn('No run step or runId found for run step delta event');
        return;
      }

      if (
        runStepDelta.delta.type === StepTypes.TOOL_CALLS &&
        runStepDelta.delta.tool_calls
      ) {

        runStepDelta.delta.tool_calls.forEach((toolCallDelta) => {
          const toolCallId = toolCallIdMap.get(runStepDelta.id);

          const contentPart: t.MessageContentComplex = {
            type: ContentTypes.TOOL_CALL,
            tool_call: {
              args: toolCallDelta.args ?? '',
              name: toolCallDelta.name,
              id: toolCallId,
            },
          };

          updateContent(runStep.index, contentPart);
        });
      }
    } else if (event === GraphEvents.ON_RUN_STEP_COMPLETED) {
      const { result } = data as unknown as { result: t.ToolEndEvent };

      const { id: stepId } = result;

      const runStep = stepMap.get(stepId);
      if (!runStep) {
        console.warn('No run step or runId found for completed tool call event');
        return;
      }

      const contentPart: t.MessageContentComplex = {
        type: ContentTypes.TOOL_CALL,
        tool_call: result.tool_call,
      };

      updateContent(runStep.index, contentPart, true);
    }

  };

  return { contentParts, aggregateContent, stepMap };
}
