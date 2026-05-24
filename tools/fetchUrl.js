import { createToolHandler } from "./template.js";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const fetch_url_schema = {
    type: "function",
    function: {
        name: "fetch_url",
        description:
            "Fetches one or more URLs and extracts clean, readable Markdown from the HTML. " +
            "Uses Cheerio to strip scripts, styles, and non-content elements, returning " +
            "structured JSON with the meaningful text content converted via Turndown. " +
            "Use this to read up-to-date documentation, articles, or web pages without " +
            "burning tokens on raw HTML. **Always use the urls[] array form for multiple " +
            "pages** - never call this tool once per URL. When you have search_web results, " +
            "extract the URLs and pass them all at once via urls[]. Supports per-URL metadata " +
            "(title, content length, truncation info, fetch timestamp) for source attribution.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description:
                        "Single URL to fetch and convert to Markdown. " +
                        "Ignored if 'urls' is provided.",
                },
                urls: {
                    type: "array",
                    items: { type: "string" },
                    description:
                        "Array of URLs to fetch concurrently. " +
                        "When set, activates batch-fetch mode. " +
                        "Mutually exclusive with 'url'; if both are provided, " +
                        "'url' is appended to the batch.",
                },
                timeout_seconds: {
                    type: "integer",
                    description: "Request timeout in seconds per URL. Defaults to 15.",
                },
                max_chars: {
                    type: "integer",
                    description:
                        "Maximum characters per URL output before truncation. " +
                        "Defaults to 8000. Set to 0 for no limit.",
                },
            },
            oneOf: [{ required: ["url"] }, { required: ["urls"] }],
        },
    },
};

// ---------------------------------------------------------------------------
// Pure handler - single URL fetch
// ---------------------------------------------------------------------------
async function fetchSingleUrl(url, timeout_seconds, max_chars, cheerio, TurndownService) {
    const fetched_at = new Date().toISOString();

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
            const msg = `HTTP error: ${response.status} ${response.statusText}`;
            console.log(`\x1b[91m[Fetch Error] ${url.substring(0, 100)}: ${msg}\x1b[0m`);
            return {
                url,
                error: true,
                message: msg,
                fetched_at,
            };
        }

        const html = await response.text();
        const $ = cheerio(html);

        // Extract page title
        const title = $("title").first().text().trim() || url;

        // Remove unwanted elements
        $("script, style, nav, footer, header, aside, noscript").remove();

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

        const main_html = main_content.html() || main_content.text() || "";

        // Convert HTML to Markdown
        let markdown_text;
        try {
            const turndownService = new TurndownService({ headingStyle: "atx" });
            markdown_text = turndownService.turndown(main_html);
        } catch {
            // Fallback: strip tags and get text
            markdown_text = (main_content.text() || "").replace(/\n{3,}/g, "\n\n").trim();
        }

        // Clean up excessive blank lines
        markdown_text = markdown_text.replace(/\n{3,}/g, "\n\n").trim();

        const content_length_chars = markdown_text.length;

        // Apply dynamic truncation
        let truncated = false;
        let truncation_ratio = "0%";

        if (max_chars > 0 && markdown_text.length > max_chars) {
            const pct_trimmed = (
                ((markdown_text.length - max_chars) / markdown_text.length) *
                100
            ).toFixed(0);
            markdown_text =
                markdown_text.substring(0, max_chars) +
                `\n\n[... truncated at ${max_chars} characters - ` +
                `${pct_trimmed}% of original page trimmed. ` +
                `Full page is ${content_length_chars} characters.]`;
            truncated = true;
            truncation_ratio = `${pct_trimmed}% trimmed`;
        }

        console.log(
            `\x1b[92m[Fetched OK] ${url.substring(0, 100)}` +
            ` - ${content_length_chars} chars` +
            (truncated ? ` (truncated at ${max_chars})` : "") +
            `\x1b[0m`
        );

        return {
            url,
            title,
            fetched_at,
            content_length_chars,
            truncated,
            truncation_ratio,
            content: markdown_text,
        };
    } catch (e) {
        if (e.name === "AbortError") {
            const msg = `Request timed out after ${timeout_seconds} seconds.`;
            console.log(`\x1b[91m[Fetch Timeout] ${url.substring(0, 100)}: ${msg}\x1b[0m`);
            return { url, error: true, message: msg, fetched_at };
        }
        const msg = e.message || String(e);
        console.log(`\x1b[91m[Fetch Error] ${url.substring(0, 100)}: ${msg}\x1b[0m`);
        return { url, error: true, message: msg, fetched_at };
    }
}

// ---------------------------------------------------------------------------
// Pure handler - dispatcher (single vs batch)
// ---------------------------------------------------------------------------
async function fetchUrlCore({ url, urls, timeout_seconds = 15, max_chars = 8000 }) {
    // Soft-import dependencies
    let cheerio, TurndownService;
    try {
        const cheerio_mod = await import("cheerio");
        cheerio = cheerio_mod.default || cheerio_mod.load;
        const turndown_mod = await import("turndown");
        TurndownService = turndown_mod.default || turndown_mod;
    } catch (e) {
        const error_msg = JSON.stringify({
            error: true,
            message:
                `Required package not installed: ${e.message}. ` +
                "Install with: npm install cheerio turndown",
        });
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    // Determine URL list
    let urlList = [];
    if (urls && Array.isArray(urls) && urls.length > 0) {
        urlList = [...urls];
        if (url) urlList.push(url); // append single url if also provided
    } else if (url) {
        urlList = [url];
    } else {
        return JSON.stringify({
            error: true,
            message: "Either 'url' or 'urls' parameter must be provided.",
        });
    }

    // Deduplicate URLs (case-sensitive - URL normalization is out of scope)
    urlList = [...new Set(urlList)];

    const isBatch = urlList.length > 1;

    // Fetch all URLs concurrently with isolated error handling
    const results = await Promise.all(
        urlList.map((u) =>
            fetchSingleUrl(u, timeout_seconds, max_chars, cheerio, TurndownService)
        )
    );

    // Build output
    let output;
    if (isBatch) {
        output = {
            results,
            total_urls: urlList.length,
            errors: results.filter((r) => r.error).length,
        };
    } else {
        output = results[0];
    }

    return JSON.stringify(output, null, 2);
}

// ---------------------------------------------------------------------------
// Wrapped handler (consent required)
// ---------------------------------------------------------------------------
export const fetch_url = createToolHandler("fetch_url", fetchUrlCore, true);
