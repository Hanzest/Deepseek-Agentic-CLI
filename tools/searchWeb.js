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
            "may be outdated. Results include URLs - extract them and pass to " +
            "fetch_url({ urls: [...] }) in the next turn for full-content retrieval.",
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

// Global state for cache and serialization
const searchCache = new Map();
let searchQueue = Promise.resolve();
let lastRequestTime = 0;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay() {
    return 200 + Math.floor(Math.random() * 1000);
}

async function searchWebWithThrottlingAndRetry(launch, query, max_results) {
    const maxRetries = 2;
    let attempt = 0;
    let backoffMs = getRandomDelay();

    while (true) {
        const now = Date.now();
        const timeSinceLast = now - lastRequestTime;
        const interval = getRandomDelay();
        const sleepTime = interval - timeSinceLast;
        if (sleepTime > 0) {
            await sleep(sleepTime);
        }

        lastRequestTime = Date.now();

        let browser;
        try {
            browser = await launch({
                headless: true
            });
            const page = await browser.newPage();
            
            const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
            
            // Wait for search result container
            await page.waitForSelector(".result", { timeout: 5000 });
            
            // Extract the result nodes
            const rawResults = await page.$$eval(".result", (elements) => {
                return elements.map((el) => {
                    const titleEl = el.querySelector(".result__a");
                    const snippetEl = el.querySelector(".result__snippet");
                    
                    const title = titleEl ? titleEl.textContent.trim() : "";
                    const href = titleEl ? titleEl.getAttribute("href") : "";
                    const snippet = snippetEl ? snippetEl.textContent.trim() : "";
                    
                    return { title, href, snippet };
                });
            });

            const results = [];
            for (const r of rawResults) {
                if (!r.title || !r.href) continue;
                
                let decodedUrl = r.href;
                try {
                    const urlObj = new URL(decodedUrl, "https://html.duckduckgo.com");
                    const uddg = urlObj.searchParams.get("uddg");
                    if (uddg) {
                        decodedUrl = decodeURIComponent(uddg);
                    } else if (decodedUrl.startsWith("//")) {
                        decodedUrl = "https:" + decodedUrl;
                    } else if (decodedUrl.startsWith("/")) {
                        decodedUrl = "https://html.duckduckgo.com" + decodedUrl;
                    }
                } catch (e) {
                    // fallback to original href
                }
                
                results.push({
                    title: r.title,
                    url: decodedUrl,
                    description: r.snippet
                });
            }

            if (results && results.length > 0) {
                return results;
            }
            throw new Error("Empty search results returned from DuckDuckGo HTML search");
        } catch (e) {
            const errMsg = e.message || String(e);
            const isRateLimitOrTimeout =
                errMsg.includes("timeout") ||
                errMsg.includes("anomaly") ||
                errMsg.includes("too quickly") ||
                errMsg.includes("rate limit") ||
                errMsg.includes("429");

            if (isRateLimitOrTimeout && attempt < maxRetries) {
                attempt++;
                console.log(
                    `\x1b[93m[Search rate-limited/timeout] Attempt ${attempt} failed. Retrying in ${backoffMs}ms...\x1b[0m`
                );
                if (browser) {
                    try { await browser.close(); } catch (_) {}
                    browser = null;
                }
                await sleep(backoffMs);
                backoffMs = getRandomDelay() * Math.pow(2, attempt);
            } else {
                if (browser) {
                    try { await browser.close(); } catch (_) {}
                }
                throw e;
            }
        } finally {
            if (browser) {
                try { await browser.close(); } catch (_) {}
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pure handler logic (no consent - read-only tool)
// ---------------------------------------------------------------------------
async function searchWebCore({ query, max_results = 5 }) {
    let launch;
    try {
        const mod = await import("cloakbrowser");
        launch = mod.launch;
    } catch {
        const error_msg =
            "Error: cloakbrowser package is not installed. " +
            "Install it with: npm install cloakbrowser playwright-core";
        console.log(`\x1b[91m${error_msg}\x1b[0m`);
        return error_msg;
    }

    const trimmedQuery = (query || "").trim();
    if (!trimmedQuery) {
        return "No results found for empty query.";
    }

    const cacheKey = `${trimmedQuery.toLowerCase()}:${max_results}`;
    if (searchCache.has(cacheKey)) {
        const cachedVal = searchCache.get(cacheKey);
        console.log(`\x1b[92m[Search Cache Hit] Query: '${trimmedQuery}'\x1b[0m`);
        return cachedVal;
    }

    const executionPromise = new Promise((resolve) => {
        searchQueue = searchQueue.then(async () => {
            try {
                if (searchCache.has(cacheKey)) {
                    resolve(searchCache.get(cacheKey));
                    return;
                }

                const results = await searchWebWithThrottlingAndRetry(
                    launch,
                    trimmedQuery,
                    max_results
                );

                const slicedResults = results.slice(0, max_results);

                if (!slicedResults || slicedResults.length === 0) {
                    const no_results = `No results found for query: '${trimmedQuery}'.`;
                    console.log(`\x1b[92m${no_results}\x1b[0m`);
                    searchCache.set(cacheKey, no_results);
                    resolve(no_results);
                    return;
                }

                const output_lines = [`Search results for: '${trimmedQuery}'`, ""];
                for (let i = 0; i < slicedResults.length; i++) {
                    const r = slicedResults[i];
                    const title = r.title || "No title";
                    const href = r.url || "No URL";
                    const body = r.description || "No description";
                    output_lines.push(`${i + 1}. ${title}`);
                    output_lines.push(`   URL: ${href}`);
                    output_lines.push(`   ${body}`);
                    output_lines.push("");
                }

                const result = output_lines.join("\n");
                console.log(`\x1b[92m[Search Results]:\x1b[0m\n${result}`);
                searchCache.set(cacheKey, result);
                resolve(result);
            } catch (e) {
                const error_msg = `Error performing web search: ${e.message || e}`;
                console.log(`\x1b[91m${error_msg}\x1b[0m`);
                resolve(error_msg);
            }
        });
    });

    return executionPromise;
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent - read-only tool)
// ---------------------------------------------------------------------------
export const search_web = createToolHandler(
    "search_web",
    searchWebCore,
    false
);
