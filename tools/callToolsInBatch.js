// ---------------------------------------------------------------------------
// Batch tool execution
// Runs all tool calls concurrently via Promise.all, then pushes results
// into the messages array. This reduces total latency when the model
// issues multiple tool calls in a single response.
// ---------------------------------------------------------------------------

/**
 * Executes an array of tool calls concurrently and pushes results into messages.
 *
 * @param {Array} tool_calls - Array of tool call objects from the model response
 *        Each has shape: { id, type, function: { name, arguments } }
 * @param {Object} TOOL_REGISTRY - The central tool registry map
 *        Each value is [schema, handler]
 * @param {Array} messages - The conversation messages array (mutated in-place)
 * @returns {number} The number of tool calls executed
 */
export async function callToolsInBatch(tool_calls, TOOL_REGISTRY, messages) {
    if (!tool_calls || tool_calls.length === 0) return 0;

    // Map each tool call to a promise that resolves to a result entry
    const toolPromises = tool_calls.map(async (tc) => {
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
            result = "Error: Tool '" + func_name + "' not found.";
        }

        return {
            role: "tool",
            tool_call_id: tc.id,
            name: func_name,
            content: result,
        };
    });

    // Run all tool calls concurrently
    const results = await Promise.all(toolPromises);

    // Push all results into messages (preserving call order)
    for (const entry of results) {
        messages.push(entry);
    }

    return tool_calls.length;
}
