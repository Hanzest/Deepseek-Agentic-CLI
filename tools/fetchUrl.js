import { createToolHandler } from "./template.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const fetch_url_schema = {
    type: "function",
    function: {
        name: "fetch_url",
        description:
            "Fetches a URL and extracts clean, readable Markdown from the HTML. " +
            "Uses BeautifulSoup to strip tags, scripts, and styles, returning only " +
            "the meaningful text content. Use this to read up-to-date documentation " +
            "or web pages without burning tokens on raw HTML.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "The URL to fetch and convert to Markdown.",
                },
                timeout_seconds: {
                    type: "integer",
                    description: "Request timeout in seconds. Defaults to 15.",
                },
            },
            required: ["url"],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler logic
// ---------------------------------------------------------------------------
async function fetchUrlCore({ url, timeout_seconds = 15 }) {
    let cheerio, TurndownService;
    try {
        const cheerio_mod = await import("cheerio");
        cheerio = cheerio_mod.default || cheerio_mod.load;
        const turndown_mod = await import("turndown");
        TurndownService = turndown_mod.default || turndown_mod;
    } catch (e) {
        const error_msg =
            `Error: Required package not installed: ${e.message}. ` +
            "Install with: npm install cheerio turndown";
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    try {
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), timeout_seconds * 1000);

        const response = await fetch(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/125.0.0.0 Safari/537.36",
            },
            signal: controller.signal,
        });

        clearTimeout(timeout_id);

        if (!response.ok) {
            const error_msg = `Error: HTTP error fetching '${url}': ${response.status} ${response.statusText}`;
            console.log(`\x1b[91m${error_msg}\x1b[0m`);
            return error_msg;
        }

        const html = await response.text();

        const $ = cheerio(html);

        // Remove unwanted elements
        $(
            "script, style, nav, footer, header, aside, noscript"
        ).remove();

        // Try to find the main content area
        let main_content =
            $("main").first() ||
            $("article").first() ||
            $("div.content").first() ||
            $("#content").first() ||
            $("body").first();

        if (!main_content || main_content.length === 0) {
            main_content = $("body").first();
        }
        if (!main_content || main_content.length === 0) {
            main_content = $.root();
        }

        const main_html =
            main_content.html() || main_content.text() || "";

        // Convert HTML to Markdown
        let markdown_text;
        try {
            const turndownService = new TurndownService({
                headingStyle: "atx",
            });
            markdown_text = turndownService.turndown(main_html);
        } catch {
            // Fallback: strip tags and get text
            markdown_text = (main_content.text() || "").replace(/\n{3,}/g, "\n\n").trim();
        }

        // Clean up excessive blank lines
        markdown_text = markdown_text.replace(/\n{3,}/g, "\n\n").trim();

        // Truncate if too long (max ~8000 chars to be token-friendly)
        const max_chars = 8000;
        if (markdown_text.length > max_chars) {
            const truncated = markdown_text.substring(0, max_chars);
            markdown_text =
                truncated +
                `\n\n[... truncated at ${max_chars} characters. ` +
                `Full page is ${markdown_text.length} characters. ` +
                `Use a more specific URL or search for narrower pages.]`;
        }

        const summary =
            `--- Content from ${url} ---\n` +
            `${markdown_text}\n` +
            `--- end of content ---`;

        console.log(
            `\x1b[92m[Fetched Content]:\x1b[0m\n${summary.substring(0, 500)}...`
        );
        return summary;
    } catch (e) {
        if (e.name === "AbortError") {
            const error_msg = `Error: Request to '${url}' timed out after ${timeout_seconds} seconds.`;
            console.log(`\x1b[91m${error_msg}\x1b[0m`);
            return error_msg;
        }
        const error_msg = `Error fetching URL '${url}': ${e.message || e}`;
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }
}

// ---------------------------------------------------------------------------
// Wrapped handler (consent required)
// ---------------------------------------------------------------------------
export const fetch_url = createToolHandler(
    "fetch_url",
    fetchUrlCore,
    true
);
