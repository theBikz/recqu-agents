import { BaseMessage, HumanMessage, AIMessageChunk, AIMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { RunnableConfig } from "@langchain/core/runnables";
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
  END,
  START,
  StateGraph,
  StateGraphArgs,
} from "@langchain/langgraph";

interface IState {
  messages: BaseMessage[];
}

async function main() {
  const graphState: StateGraphArgs<IState>["channels"] = {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
  };

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant."],
    ["placeholder", "{messages}"],
  ]);

  const initializeModel = (bindTools = false) => {
    const model = new ChatAnthropic({
      model: 'claude-3-5-sonnet-20240620'
    })
    if (bindTools) {
      return model.bindTools([new TavilySearchResults()]);
    }
    return model;
  }
  
  const callModel = async (
    state: { messages: BaseMessage[] },
    config?: RunnableConfig,
  ) => {
    const { messages } = state;
    
    const model = initializeModel(true);
    const chain = promptTemplate.pipe(model);
    const response = await chain.invoke(
      {
        messages,
      },
      config,
    );
    return { messages: [response] };
  };

  const tools = [new TavilySearchResults()];
  const toolNode = new ToolNode<IState>(tools);

  const routeMessage = (state: IState): string => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (!lastMessage?.tool_calls?.length) {
      return END;
    }
    return "tools";
  };

  const workflow = new StateGraph({
    channels: graphState,
  })
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeMessage)
    .addEdge("tools", "agent");

  const graph = workflow.compile();

  const inputs = {
    messages: [new HumanMessage("Could you search the internet for information about LangChain?")],
  };

  const stream = graph.streamEvents(inputs, {
    version: "v2",
    streamMode: "values",
  });

  for await (const { event, data } of stream) {
    console.log(event)
    if (event === "on_chat_model_stream") {
      console.log(data);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
