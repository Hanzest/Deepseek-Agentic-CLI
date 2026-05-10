import { C, colorize } from "./colors.js";

// ---------------------------------------------------------------------------
// Stream response parser
// Extracted from main.js — pure transformation: stream -> structured data.
// ---------------------------------------------------------------------------
export async function printStreamResponse(stream, extra_body) {
    let reasoning_content = "";
    let content = "";
    const tool_calls = {};

    let firstThinking = false;
    let firstContent = false;

    for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // 1. Handle Reasoning Content
        if (
            extra_body?.thinking?.type === "enabled" &&
            delta.reasoning_content
        ) {
            if (!firstThinking) {
                console.log(colorize("\n[Reasoning Content]:", C.system));
                firstThinking = true;
            }
            reasoning_content += delta.reasoning_content;
            process.stdout.write(colorize(delta.reasoning_content, C.tool));
        }
        // 2. Handle Standard Content
        else if (delta.content && delta.content !== "") {
            if (!firstContent) {
                console.log(colorize("\nAgent:", C.heading));
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
