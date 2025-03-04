import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { TavilySearchResults } from '@langchain/community/tools/tavily_search';
import { RunnableConfig } from "@langchain/core/runnables";
import {
  END,
  // MemorySaver,
  START,
  StateGraph,
  StateGraphArgs,
} from "@langchain/langgraph";

interface IState {
  messages: BaseMessage[];
  userInfo: string;
}

async function main() {

const graphState: StateGraphArgs<IState>["channels"] = {
  messages: {
    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [],
  },
  userInfo: {
    value: (x?: string, y?: string) => {
      return y ? y : x ? x : "N/A";
    },
    default: () => "N/A",
  },
};

const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant.\n\n## User Info:\n{userInfo}"],
  ["placeholder", "{messages}"],
]);

const initializeModel = (bindTools = false) => {
  const model = new ChatAnthropic({
    // model: "claude-3-haiku-20240307",
    model: 'claude-3-5-sonnet-20240620'
  })
  if (bindTools) {
    return model.bindTools([new TavilySearchResults()]);
  }
  return model;
}

const callModel = async (
  state: { messages: BaseMessage[]; userInfo: string },
  config?: RunnableConfig,
) => {
  const { messages, userInfo } = state;
  
  /*

  This correctly streams tokens when 
  we don't bind tools, but if we do, it fails.

  */
  const model = initializeModel(true);
  // const model = initializeModel();
  const chain = promptTemplate.pipe(model);
  const response = await chain.invoke(
    {
      messages,
      userInfo,
    },
    config,
  );
  return { messages: [response] };
};

const fetchUserInformation = async (
  _: { messages: BaseMessage[] },
  config?: RunnableConfig,
) => {
  const userDB = {
    user1: {
      name: "John Doe",
      email: "jod@langchain.ai",
      phone: "+1234567890",
    },
    user2: {
      name: "Jane Doe",
      email: "jad@langchain.ai",
      phone: "+0987654321",
    },
  };
  const userId = config?.configurable?.user;
  if (userId) {
    const user = userDB[userId as keyof typeof userDB];
    if (user) {
      return {
        userInfo:
          `Name: ${user.name}\nEmail: ${user.email}\nPhone: ${user.phone}`,
      };
    }
  }
  return { userInfo: "N/A" };
};

const workflow = new StateGraph({
  channels: graphState,
})
  .addNode("fetchUserInfo", fetchUserInformation)
  .addNode("agent", callModel)
  .addEdge(START, "fetchUserInfo")
  .addEdge("fetchUserInfo", "agent")
  .addEdge("agent", END);

// Here we only save in-memory
// let memory = new MemorySaver();
// const graph = workflow.compile({ checkpointer: memory });
const graph = workflow.compile();


const config = {
  configurable: {
    user: "user1",
  },
};
const inputs = {
  messages: [new HumanMessage("Could you remind me of my email?")],
};

  const stream = graph.streamEvents(inputs, {
    ...config,
    version: "v2",
    streamMode: "values",
  });
for await (const { event, data } of stream) {

  if (event === "on_chat_model_start") {
    console.log('=======CHAT_MODEL_START=======');
    console.dir(data, { depth: null });
  } else if (event === "on_chat_model_stream") {
    console.dir(data, { depth: null });
  } else if (event === "on_chat_model_end") {
    console.log('=======CHAT_MODEL_END=======');
    console.dir(data, { depth: null });
  } else {
    console.log(event);
  }
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});