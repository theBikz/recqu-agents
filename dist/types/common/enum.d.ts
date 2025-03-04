/**
 * Enum representing the various event types emitted during the execution of runnables.
 * These events provide real-time information about the progress and state of different components.
 *
 * @enum {string}
 */
export declare enum GraphEvents {
    /** [Custom] Delta event for run steps (message creation and tool calls) */
    ON_RUN_STEP = "on_run_step",
    /** [Custom] Delta event for run steps (tool calls) */
    ON_RUN_STEP_DELTA = "on_run_step_delta",
    /** [Custom] Completed event for run steps (tool calls) */
    ON_RUN_STEP_COMPLETED = "on_run_step_completed",
    /** [Custom] Delta events for messages */
    ON_MESSAGE_DELTA = "on_message_delta",
    /** [Custom] Reasoning Delta events for messages */
    ON_REASONING_DELTA = "on_reasoning_delta",
    /** Custom event, emitted by system */
    ON_CUSTOM_EVENT = "on_custom_event",
    /** Emitted when a chat model starts processing. */
    CHAT_MODEL_START = "on_chat_model_start",
    /** Emitted when a chat model streams a chunk of its response. */
    CHAT_MODEL_STREAM = "on_chat_model_stream",
    /** Emitted when a chat model completes its processing. */
    CHAT_MODEL_END = "on_chat_model_end",
    /** Emitted when a language model starts processing. */
    LLM_START = "on_llm_start",
    /** Emitted when a language model streams a chunk of its response. */
    LLM_STREAM = "on_llm_stream",
    /** Emitted when a language model completes its processing. */
    LLM_END = "on_llm_end",
    /** Emitted when a chain starts processing. */
    CHAIN_START = "on_chain_start",
    /** Emitted when a chain streams a chunk of its output. */
    CHAIN_STREAM = "on_chain_stream",
    /** Emitted when a chain completes its processing. */
    CHAIN_END = "on_chain_end",
    /** Emitted when a tool starts its operation. */
    TOOL_START = "on_tool_start",
    /** Emitted when a tool completes its operation. */
    TOOL_END = "on_tool_end",
    /** Emitted when a retriever starts its operation. */
    RETRIEVER_START = "on_retriever_start",
    /** Emitted when a retriever completes its operation. */
    RETRIEVER_END = "on_retriever_end",
    /** Emitted when a prompt starts processing. */
    PROMPT_START = "on_prompt_start",
    /** Emitted when a prompt completes its processing. */
    PROMPT_END = "on_prompt_end"
}
export declare enum Providers {
    OPENAI = "openAI",
    BEDROCK_LEGACY = "bedrock_legacy",
    VERTEXAI = "vertexai",
    BEDROCK = "bedrock",
    ANTHROPIC = "anthropic",
    MISTRALAI = "mistralai",
    OLLAMA = "ollama",
    GOOGLE = "google",
    AZURE = "azureOpenAI",
    DEEPSEEK = "deepseek",
    OPENROUTER = "openrouter"
}
export declare enum GraphNodeKeys {
    TOOLS = "tools",
    AGENT = "agent",
    PRE_TOOLS = "pre_tools",
    POST_TOOLS = "post_tools"
}
export declare enum GraphNodeActions {
    TOOL_NODE = "tool_node",
    CALL_MODEL = "call_model",
    ROUTE_MESSAGE = "route_message"
}
export declare enum CommonEvents {
    LANGGRAPH = "LangGraph"
}
export declare enum StepTypes {
    TOOL_CALLS = "tool_calls",
    MESSAGE_CREATION = "message_creation"
}
export declare enum ContentTypes {
    TEXT = "text",
    THINK = "think",
    TOOL_CALL = "tool_call",
    IMAGE_FILE = "image_file",
    IMAGE_URL = "image_url",
    ERROR = "error"
}
export declare enum ToolCallTypes {
    FUNCTION = "function",
    RETRIEVAL = "retrieval",
    FILE_SEARCH = "file_search",
    CODE_INTERPRETER = "code_interpreter",
    TOOL_CALL = "tool_call"
}
export declare enum Callback {
    TOOL_ERROR = "handleToolError",
    TOOL_START = "handleToolStart",
    TOOL_END = "handleToolEnd"
}
export declare enum Constants {
    OFFICIAL_CODE_BASEURL = "http://localhost:8050",
    EXECUTE_CODE = "execute_code",
    CONTENT_AND_ARTIFACT = "content_and_artifact"
}
export declare enum EnvVar {
    CODE_API_KEY = "LIBRECHAT_CODE_API_KEY",
    CODE_BASEURL = "LIBRECHAT_CODE_BASEURL"
}
