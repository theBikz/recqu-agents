import { AgentExecutor , createToolCallingAgent } from 'langchain/agents';
import { StructuredTool } from '@langchain/core/tools';
import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChatVertexAI, ChatVertexAIInput } from '@langchain/google-vertexai';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

type VertexAIToolCallingAgentInput = {
  vertexAIConfig: ChatVertexAIInput;
  tools: StructuredTool[];
  chatHistory: BaseMessage[];
};

export function createVertexAgent({
  vertexAIConfig,
  tools,
  chatHistory,
}: VertexAIToolCallingAgentInput) {
  // Define the LLM
  const llm = new ChatVertexAI(vertexAIConfig);

  // Define the prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant'],
    ['human', '{input}'],
    ['human', 'Current conversation:\n{chat_history}'],
    ['human', 'Human: {input}'],
    ['assistant', '{agent_scratchpad}'],
  ]);

  // Create the agent
  const agent = createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  // Create the agent executor
  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });

  // Create the runnable
  const runnable = RunnableSequence.from([
    {
      input: new RunnablePassthrough(),
      chat_history: () => chatHistory,
    },
    agentExecutor,
  ]);

  return runnable;
}
