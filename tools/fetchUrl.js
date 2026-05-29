import { createToolHandler } from "./template.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
];

/**
 * Build browser-like headers with a random User-Agent.
 * @returns {object} Headers object for fetch()
 */
function buildHeaders() {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    return {
        "User-Agent": ua,
        Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Ch-Ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
        Priority: "u=0, i",
    };
}

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
                    description: "Request timeout in seconds per URL. Defaults to 3.",
                },
                max_chars: {
                    type: "integer",
                    description:
                        "Maximum characters per URL output before truncation. " +
                        "Defaults to 8000. Set to 0 for no limit.",
                },
                proxy_url: {
                    type: "string",
                    description:
                        "HTTP/HTTPS proxy URL for routing the fetch request. " +
                        "Supports authentication. " +
                        "E.g., 'http://user:pass@proxy.example.com:8080'. " +
                        "Uses Node.js undici ProxyAgent under the hood. Requires Node.js 18+.",
                },
                allow_archived_fallback: {
                    type: "boolean",
                    description:
                        "When true and primary fetch is blocked (403/timeout), " +
                        "automatically retry via Wayback Machine archive. Default: false.",
                },
            },
            oneOf: [{ required: ["url"] }, { required: ["urls"] }],
        },
    },
};

// ---------------------------------------------------------------------------
// Archive fallback helpers
// ---------------------------------------------------------------------------

function getUrlSource(url) {
    try {
        const parsed = new URL(url);
        const parts = parsed.hostname.split('.');
        if (parts.length >= 2) {
            return parts[parts.length - 2];
        }
        return parsed.hostname;
    } catch {
        return url;
    }
}

async function checkWaybackAvailability(url, timeout_seconds) {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    try {
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), timeout_seconds * 1000);
        const response = await fetch(apiUrl, {
            signal: controller.signal,
        });
        clearTimeout(timeout_id);
        if (!response.ok) return null;
        const data = await response.json();
        const closest = data?.archived_snapshots?.closest;
        if (closest && closest.available && closest.url) {
            return {
                url: closest.url,
                timestamp: closest.timestamp,
            };
        }
    } catch {
        // Fallback or ignore
    }
    return null;
}

/**
 * Fetch a URL via Wayback Machine.
 * Returns null if unavailable.
 */
async function fetchViaWayback(url, timeout_seconds, cheerio, TurndownService, buildHeadersFn) {
    const availability = await checkWaybackAvailability(url, timeout_seconds);
    if (!availability) return null;

    const waybackUrl = availability.url;
    try {
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), timeout_seconds * 1000);
        const response = await fetch(waybackUrl, {
            headers: buildHeadersFn(),
            redirect: "follow",
            signal: controller.signal,
        });
        clearTimeout(timeout_id);

        if (!response.ok) return null;

        const timestamp = availability.timestamp || null;
        let age_years = null;
        if (timestamp) {
            const year = parseInt(timestamp.substring(0, 4), 10);
            const currentYear = new Date().getFullYear();
            age_years = currentYear - year;
        }

        const html = await response.text();
        const $ = cheerio(html);

        // Remove unwanted elements
        $("script, style, nav, footer, header, aside, noscript").remove();

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
        let markdown_text;
        try {
            const turndownService = new TurndownService({ headingStyle: "atx" });
            markdown_text = turndownService.turndown(main_html);
        } catch {
            markdown_text = (main_content.text() || "").replace(/\n{3,}/g, "\n\n").trim();
        }

        markdown_text = markdown_text.replace(/\n{3,}/g, "\n\n").trim();

        // If the snapshot is >= 5 years old, prepend a caution banner
        if (age_years !== null && age_years >= 5) {
            const banner =
                `**⚠️ Caution: This content is from an archived snapshot ${age_years} year(s) old.**\n\n`;
            markdown_text = banner + markdown_text;
        }

        return { content: markdown_text, source: "wayback", archived_at: timestamp, age_years };
    } catch {
        return null;
    }
}

/**
 * Orchestrate fallback: try Wayback Machine.
 * Returns the best available result or null.
 */
async function fallbackOrchestrator(url, timeout_seconds, cheerio, TurndownService, buildHeadersFn) {
    const waybackResult = await fetchViaWayback(url, timeout_seconds, cheerio, TurndownService, buildHeadersFn);
    if (waybackResult) {
        return { ...waybackResult, _fallback_note: "Retrieved from Wayback Machine archive." };
    }

    return null;
}

// ---------------------------------------------------------------------------
// Pure handler - single URL fetch
// ---------------------------------------------------------------------------
async function fetchSingleUrl(
    url,
    timeout_seconds,
    max_chars,
    cheerio,
    TurndownService,
    proxy_url,
    allow_archived_fallback,
) {
    const fetched_at = new Date().toISOString();

    try {
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), timeout_seconds * 1000);

        const fetchOptions = {
            headers: buildHeaders(),
            signal: controller.signal,
        };

        // Apply proxy if provided
        if (proxy_url) {
            try {
                const { ProxyAgent } = await import("undici");
                fetchOptions.dispatcher = new ProxyAgent(proxy_url);
            } catch (e) {
                const sourceName = getUrlSource(url);
                return {
                    url,
                    error: true,
                    blocked: true,
                    block_signal: "proxy_error",
                    message: `ProxyAgent failed: ${e.message}. Requires Node.js 18+.`,
                    fetched_at,
                    data_unavailable_marker: `[DATA_UNAVAILABLE: source=${sourceName}, error=proxy_error]`,
                    content: `[DATA_UNAVAILABLE: source=${sourceName}, error=proxy_error]`
                };
            }
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timeout_id);

        if (!response.ok) {
            const status_code = response.status;
            const msg = `HTTP error: ${status_code} ${response.statusText}`;
            console.log(`\x1b[91m[Fetch Error] ${url.substring(0, 100)}: ${msg}\x1b[0m`);

            // Determine if this is a "blocked" scenario (403)
            const isBlocked = status_code === 403;
            const sourceName = getUrlSource(url);
            const result = {
                url,
                error: true,
                message: msg,
                fetched_at,
                blocked: isBlocked,
                status_code,
                data_unavailable_marker: `[DATA_UNAVAILABLE: source=${sourceName}, error=${status_code}]`,
                content: `[DATA_UNAVAILABLE: source=${sourceName}, error=${status_code}]`
            };
            if (isBlocked) {
                result.block_signal = "403";
            }

            // Archived fallback for blocked responses
            if (isBlocked && allow_archived_fallback) {
                const fallback = await fallbackOrchestrator(url, timeout_seconds, cheerio, TurndownService, buildHeaders);
                if (fallback) {
                    return {
                        url,
                        title: url,
                        fetched_at,
                        source: fallback.source,
                        content: fallback.content,
                        archived_at: fallback.archived_at || null,
                        age_years: fallback.age_years || null,
                        _fallback_note: fallback._fallback_note,
                        blocked: false,
                    };
                } else {
                    const fallback_failed_msg = `${msg} (Wayback Machine fallback failed: no archive snapshot found)`;
                    result.message = fallback_failed_msg;
                    result.data_unavailable_marker = `[DATA_UNAVAILABLE: source=${sourceName}, error=${status_code}_fallback_failed]`;
                    result.content = `[DATA_UNAVAILABLE: source=${sourceName}, error=${status_code}_fallback_failed]`;
                }
            }

            return result;
        }

        const status_code = response.status;
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
            `\x1b[0m`,
        );

        return {
            url,
            title,
            fetched_at,
            content_length_chars,
            truncated,
            truncation_ratio,
            content: markdown_text,
            blocked: false,
            source: "direct",
            status_code,
        };
    } catch (e) {
        const sourceName = getUrlSource(url);
        if (e.name === "AbortError") {
            const msg = `Request timed out after ${timeout_seconds} seconds.`;
            console.log(`\x1b[91m[Fetch Timeout] ${url.substring(0, 100)}: ${msg}\x1b[0m`);
            const result = {
                url,
                error: true,
                message: msg,
                fetched_at,
                blocked: true,
                block_signal: "timeout",
                status_code: 0,
                data_unavailable_marker: `[DATA_UNAVAILABLE: source=${sourceName}, error=timeout]`,
                content: `[DATA_UNAVAILABLE: source=${sourceName}, error=timeout]`
            };

            // Archived fallback for timeouts
            if (allow_archived_fallback) {
                const fallback = await fallbackOrchestrator(url, timeout_seconds, cheerio, TurndownService, buildHeaders);
                if (fallback) {
                    return {
                        url,
                        title: url,
                        fetched_at,
                        source: fallback.source,
                        content: fallback.content,
                        archived_at: fallback.archived_at || null,
                        age_years: fallback.age_years || null,
                        _fallback_note: fallback._fallback_note,
                        blocked: false,
                    };
                } else {
                    const fallback_failed_msg = `${msg} (Wayback Machine fallback failed: no archive snapshot found)`;
                    result.message = fallback_failed_msg;
                    result.data_unavailable_marker = `[DATA_UNAVAILABLE: source=${sourceName}, error=timeout_fallback_failed]`;
                    result.content = `[DATA_UNAVAILABLE: source=${sourceName}, error=timeout_fallback_failed]`;
                }
            }

            return result;
        }
        const msg = e.message || String(e);
        console.log(`\x1b[91m[Fetch Error] ${url.substring(0, 100)}: ${msg}\x1b[0m`);
        const result = {
            url,
            error: true,
            message: msg,
            fetched_at,
            blocked: true,
            block_signal: "fetch_failed",
            status_code: 0,
            data_unavailable_marker: `[DATA_UNAVAILABLE: source=${sourceName}, error=fetch_failed]`,
            content: `[DATA_UNAVAILABLE: source=${sourceName}, error=fetch_failed]`
        };

        // Archived fallback for generic fetch failures
        if (allow_archived_fallback) {
            const fallback = await fallbackOrchestrator(url, timeout_seconds, cheerio, TurndownService, buildHeaders);
            if (fallback) {
                return {
                    url,
                    title: url,
                    fetched_at,
                    source: fallback.source,
                    content: fallback.content,
                    archived_at: fallback.archived_at || null,
                    age_years: fallback.age_years || null,
                    _fallback_note: fallback._fallback_note,
                    blocked: false,
                };
            } else {
                const fallback_failed_msg = `${msg} (Wayback Machine fallback failed: no archive snapshot found)`;
                result.message = fallback_failed_msg;
                result.data_unavailable_marker = `[DATA_UNAVAILABLE: source=${sourceName}, error=fetch_failed_fallback_failed]`;
                result.content = `[DATA_UNAVAILABLE: source=${sourceName}, error=fetch_failed_fallback_failed]`;
            }
        }

        return result;
    }
}

// ---------------------------------------------------------------------------
// Pure handler - dispatcher (single vs batch)
// ---------------------------------------------------------------------------
async function fetchUrlCore({
    url,
    urls,
    timeout_seconds = 3,
    max_chars = 8000,
    proxy_url,
    allow_archived_fallback = false,
}) {
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
    let urlList;
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
            fetchSingleUrl(
                u,
                timeout_seconds,
                max_chars,
                cheerio,
                TurndownService,
                proxy_url,
                allow_archived_fallback,
            ),
        ),
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
export const fetch_url = createToolHandler("fetch_url", fetchUrlCore, false);
