import { createToolHandler } from "./template.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const search_web_schema = {
    type: "function",
    function: {
        name: "search_web",
        description:
            "Searches the web using DuckDuckGo and returns a list of results " +
            "(title, URL, and snippet). Use this to find up-to-date documentation, " +
            "GitHub issues, or StackOverflow answers when the model's training data " +
            "may be outdated.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query string.",
                },
                max_results: {
                    type: "integer",
                    description:
                        "Maximum number of results to return. Defaults to 5.",
                },
            },
            required: ["query"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic (no consent — read-only tool)
// ---------------------------------------------------------------------------
async function searchWebCore({ query, max_results = 5 }) {
    let DDGS;
    try {
        const mod = await import("duck-duck-scrape");
        DDGS = mod.search;
    } catch {
        const error_msg =
            "Error: duck-duck-scrape package is not installed. " +
            "Install it with: npm install duck-duck-scrape";
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    try {
        const search_results = await DDGS(query, {
            safeSearch: "OFF",
        });

        const results = (search_results.results || search_results || []).slice(
            0,
            max_results
        );

        if (!results || results.length === 0) {
            const no_results = `No results found for query: '${query}'.`;
            console.log(`\x1b[92m${no_results}\x1b[0m`);
            return no_results;
        }

        const output_lines = [`Search results for: '${query}'`, ""];
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const title = r.title || "No title";
            const href = r.url || r.href || "No URL";
            const body = r.description || r.body || r.snippet || "No description";
            output_lines.push(`${i + 1}. ${title}`);
            output_lines.push(`   URL: ${href}`);
            output_lines.push(`   ${body}`);
            output_lines.push("");
        }

        const result = output_lines.join("\n");
        console.log(`\x1b[92m[Search Results]:\x1b[0m\n${result}`);
        return result;
    } catch (e) {
        const error_msg = `Error performing web search: ${e.message || e}`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent — read-only tool)
// ---------------------------------------------------------------------------
export const search_web = createToolHandler(
    "search_web",
    searchWebCore,
    false
);
