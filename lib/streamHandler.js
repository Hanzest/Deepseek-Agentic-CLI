import { C, colorize } from "./colors.js";
import { MarkdownRenderer } from "./markdownFormatter.js";

let spinnerInterval = null;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerIndex = 0;

export function startSpinner(text = "Thinking...") {
    if (spinnerInterval) return;
    spinnerIndex = 0;
    process.stdout.write(`\r${colorize(spinnerFrames[spinnerIndex], C.system)} ${colorize(text, C.dim)}`);
    spinnerInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        process.stdout.write(`\r${colorize(spinnerFrames[spinnerIndex], C.system)} ${colorize(text, C.dim)}`);
    }, 80);
}

export function stopSpinner() {
    if (!spinnerInterval) return;
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write("\r\x1b[K"); // Clear the line
}

// Extracted from main.js - pure transformation: stream -> structured data.
export async function printStreamResponse(stream, extra_body, role = "Agent") {
    let reasoning_content = "";
    let content = "";
    const tool_calls = {};

    let firstThinking = false;
    let firstContent = false;

    let usage = null;

    // Instantiate the markdown renderer for this response
    const mdRenderer = new MarkdownRenderer();

    let spinnerStopped = false;
    try {
        for await (const chunk of stream) {
            if (!spinnerStopped) {
                if (role === "Orchestrator") {
                    stopSpinner();
                }
                spinnerStopped = true;
            }

            // Capture actual API usage from the final stream chunk.
            // DeepSeek (OpenAI-compatible) returns usage.prompt_tokens
            // (= prompt_cache_hit_tokens + prompt_cache_miss_tokens) here.
            if (chunk.usage) {
                usage = chunk.usage;
            }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            // 1. Handle Reasoning Content
            if (
                (extra_body?.thinking?.type === "enabled" ||
                    (extra_body?.reasoning_effort && extra_body.reasoning_effort !== "minimal")) &&
                delta.reasoning_content
            ) {
                if (!firstThinking) {
                    console.log(colorize(`\n[${role} Reasoning]:`, C.system));
                    firstThinking = true;
                }
                reasoning_content += delta.reasoning_content;
                process.stdout.write(colorize(delta.reasoning_content, C.tool));
            }
            // 2. Handle Standard Content
            else if (delta.content && delta.content !== "") {
                if (!firstContent) {
                    console.log(colorize(`\n${role}:`, C.heading));
                    firstContent = true;
                }
                content += delta.content;
                const formatted = mdRenderer.process(delta.content);
                if (formatted) process.stdout.write(formatted);
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
    } finally {
        if (role === "Orchestrator") {
            stopSpinner();
        }
    }

    // Flush any remaining buffered content (table blocks, trailing line)
    const flushed = mdRenderer.flush();
    if (flushed) process.stdout.write(flushed);

    console.log("\n");

    const tool_calls_list =
        Object.keys(tool_calls).length > 0 ? Object.values(tool_calls) : null;
    return { reasoning_content, content, tool_calls: tool_calls_list, usage };
}
