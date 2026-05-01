import OpenAI from "openai";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { startChat, estimateTokens, thinkingToggle, ask } from "./helper.js";
import {
    terminal_tool_schema,
    execute_terminal_command,
    patch_file_schema,
    patch_file,
    read_file_chunk_schema,
    read_file_chunk,
    get_project_tree_schema,
    get_project_tree,
    search_web_schema,
    search_web,
    fetch_url_schema,
    fetch_url,
} from "./modelTool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.chdir(__dirname);

dotenv.config({ path: path.join(__dirname, ".env") });

const client = new OpenAI({
  apiKey: process.env.MODEL_API_KEY,
  baseURL: process.env.MODEL_BASE_URL,
});

// ---------------------------------------------------------------------------
// Hyperparameters
// ---------------------------------------------------------------------------
const HYPERPARAMETERS = {
    token_limit: 65535,
    token_multiplier: 1.5,
    stream: true,
    reasoning_effort: "high",
    system_prompt:
        `
            ## Role
            Expert Senior Software Engineer.

            ## Technical Environment
            - OS: Windows 
            - Terminal: PowerShell (Ensure all scripts are .ps1 compatible)

            ## Source of Truth
            - Primary: Codebase Markdown files in \`/docs\`.
            - Secondary: Industry-standard maintainability patterns.

            ## Output Constraints
            - Provide code blocks first.
            - Keep explanations concise and technical.
            - Use 'DRY' and 'SOLID' principles as the default architecture.

            ## Clarifications
            - If user input is ambiguous, ask for clarification before responding.
        `
};

const TOOL_REGISTRY = {
    execute_terminal_command: [terminal_tool_schema, execute_terminal_command],
    patch_file: [patch_file_schema, patch_file],
    read_file_chunk: [read_file_chunk_schema, read_file_chunk],
    get_project_tree: [get_project_tree_schema, get_project_tree],
    search_web: [search_web_schema, search_web],
    fetch_url: [fetch_url_schema, fetch_url],
};

async function printStreamResponse(stream) {
    let reasoning_content = "";
    let content = "";
    const tool_calls = {}; // Used to aggregate streaming tool call chunks

    let firstThinking = false;
    let firstContent = false;

    for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // 1. Handle Reasoning Content
        if (
        HYPERPARAMETERS.extra_body?.thinking?.type === "enabled" &&
        delta.reasoning_content
        ) {
        if (!firstThinking) {
            console.log("\n[Reasoning Content]: ");
            firstThinking = true;
        }
        reasoning_content += delta.reasoning_content;
        process.stdout.write(delta.reasoning_content);
        }
        // 2. Handle Standard Content
        else if (delta.content && delta.content !== "") {
        if (!firstContent) {
            console.log("\n\n[Model Output]: ");
            firstContent = true;
        }
        content += delta.content;
        process.stdout.write(delta.content);
        }
        // 3. Handle Tool Calls
        else if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!tool_calls[idx]) {
            tool_calls[idx] = {
                id: tc.id,
                type: "function",
                function: { name: tc.function?.name || "", arguments: "" },
            };
            }
            if (tc.function?.arguments) {
            tool_calls[idx].function.arguments += tc.function.arguments;
            }
        }
        }
    }

    console.log("\n");

    const tool_calls_list =
        Object.keys(tool_calls).length > 0 ? Object.values(tool_calls) : null;
    return { reasoning_content, content, tool_calls: tool_calls_list };
}

async function callModel(
    model_name,
    token_limit,
    messages,
    stream,
    extra_body,
    reasoning_effort,
    tools = null
) {
    const kwargs = {
        model: model_name,
        messages: messages,
        max_tokens: token_limit,
        stream: stream,
    };

    if (tools) {
        kwargs.tools = tools;
    }

    if (extra_body?.thinking) {
        kwargs.thinking = extra_body.thinking;
    }
    if (extra_body?.thinking?.type !== "disabled") {
        kwargs.reasoning_effort = reasoning_effort;
    }

    return client.chat.completions.create(kwargs);
}

// ---------------------------------------------------------------------------
// Multi-turn conversation loop
// ---------------------------------------------------------------------------
async function multiTurnLoop(model_name) {
    let stop = false;
    let reasoning_history = "";
    const messages = [
        { role: "system", content: HYPERPARAMETERS.system_prompt },
    ];
    const available_tools = Object.values(TOOL_REGISTRY).map(
        ([schema]) => schema
    );

    while (!stop) {
        // Optimization: Sliding Context Window
        // If total tokens exceed 80% of limit, remove older messages safely
        let token_estimates = estimateTokens(
        messages,
        reasoning_history,
        HYPERPARAMETERS.token_multiplier
        );
        while (
        token_estimates.total_tokens >
            HYPERPARAMETERS.token_limit * 0.8 &&
        messages.length > 3
        ) {
        messages.splice(1, 1); // Remove the oldest message

        // Keep removing until the next message is a user message.
        // This prevents orphaned 'tool' messages or 'assistant' tool_calls.
        while (messages.length > 1 && messages[1]?.role !== "user") {
            messages.splice(1, 1);
        }

        token_estimates = estimateTokens(
            messages,
            reasoning_history,
            HYPERPARAMETERS.token_multiplier
        );
        }

        console.log(
        `System:\n-Input Tokens: ${token_estimates.input_tokens}.\n` +
            `-Output Tokens: ${token_estimates.output_tokens}\n` +
            `-Total Tokens: ${token_estimates.total_tokens}.`
        );

        const user_input = await ask(
        "Enter your message (type 'exit' to quit):\n"
        );
        if (user_input.toLowerCase() === "exit") {
        stop = true;
        continue;
        }

        messages.push({ role: "user", content: user_input });

        // Inner loop to handle potential back-and-forth tool executions
        while (true) {
        // Calculate available tokens safely
        const available_tokens =
            HYPERPARAMETERS.token_limit - token_estimates.total_tokens;

        if (available_tokens <= 0) {
            console.log(
            "\n\x1b[91m[Error] Context window exceeded. " +
                "Please restart the conversation to continue.\x1b[0m"
            );
            break; // Breaks the inner loop to prevent the crash
        }

        const stream = await callModel(
            model_name,
            HYPERPARAMETERS.token_limit - token_estimates.total_tokens,
            messages,
            HYPERPARAMETERS.stream,
            HYPERPARAMETERS.extra_body,
            HYPERPARAMETERS.reasoning_effort,
            available_tools
        );

        const { reasoning_content, content, tool_calls } =
            await printStreamResponse(stream);

        // Optimization: Standardised Message History
        const assistant_message = { role: "assistant" };
        if (content) assistant_message.content = content;
        if (reasoning_content)
            assistant_message.reasoning_content = reasoning_content;
        if (tool_calls) assistant_message.tool_calls = tool_calls;
        messages.push(assistant_message);

        // Execute Tools if requested
        if (tool_calls) {
            for (const tc of tool_calls) {
            const func_name = tc.function.name;
            let func_args;
            try {
                func_args = JSON.parse(tc.function.arguments);
            } catch {
                func_args = {};
            }

            let result;
            if (func_name in TOOL_REGISTRY) {
                const [, handler] = TOOL_REGISTRY[func_name];
                result = await handler(func_args);
            } else {
                result = `Error: Tool '${func_name}' not found.`;
            }

            messages.push({
                role: "tool",
                tool_call_id: tc.id,
                name: func_name,
                content: result,
            });
            }
            // Loop back up to let the model respond to the tool execution results
            continue;
        } else {
            // No tool calls made; break inner loop to wait for next user input
            break;
        }
        }
    }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
const is_main =
    process.argv[1] &&
    (process.argv[1].endsWith("main.js") || process.argv[1] === __filename);

if (is_main) {
    const model_name = await startChat();
    const extra_body = await thinkingToggle();
    HYPERPARAMETERS.extra_body = extra_body;
    await multiTurnLoop(model_name);
}
