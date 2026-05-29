# SKILL.md

## Metadata

- **Name:** Web Research & Information Retrieval
- **Description:** Systematic search, evaluation, and extraction of information from the web — covering query formulation, search engine selection, result assessment, content extraction strategies, handling of rate-limiting/bot-protection, and archived fallback retrieval.

---

## When to Use

- **USE WHEN:** Searching for external information to answer a question, verify a claim, find documentation, research a library or API, look up current events, or gather data from public websites to inform implementation decisions.
- **DO NOT USE FOR:** Retrieving information already present in the local codebase (use file-reading tools instead), querying private/internal systems not accessible via public web, or fetching data that requires authentication the agent does not possess.

---

## Constraints & Rules

- **Search Engine Accessibility and Blocks:** Programmatic direct fetches to major search engines (Google, Brave Search, Yandex, Qwant, MetaGer, Mojeek, Swisscows) often encounter captchas, authentication, region locks, or rate-limiting. Evaluate engine selection based on automated access friendliness.
- **Search Result Freshness:** Web search indexes are not real-time. For time-sensitive queries, evaluate the publication date of each result or archive snapshot against the recency requirement.
- **Source Authority Gradient:** Prioritize official documentation, maintainer changelogs, and package registries over personal blogs, forum posts, or AI-generated summaries. Cross-verify across independent sources if authority is unclear.
- **Content Truncation Tolerance:** Fetched pages are truncated at character limits; consider narrowing the search or fetching specific sub-sections when truncated.
- **Rate Limiting and Politeness:** Batch and minimize requests to avoid triggering IP blocks.
- **Fetch Failure Diagnosis:** A successful HTTP 200 response does not guarantee genuine content. Challenge pages (Cloudflare, reCAPTCHA) or empty JavaScript SPA shells represent failures. Evaluate response contents for anti-bot signals.
- **Source Accessibility Fallback:** When a primary source blocks automated fetches, check for Wayback Machine snapshots, package registries, or raw code mirrors. (Note: Google Cache is decommissioned and unavailable).

---

## Core Principles

- **Search Engine Selection Determines Yield:** Choose the search engine based on query intent:
  - **DuckDuckGo (Lite):** High semantic relevance, excellent for technical/niche queries, and programmatically accessible without blocks.
  - **Startpage:** Google search results anonymously with an anonymous proxy view for cache-transparent access.
  - **Bing:** Fast and accessible fallback for broad queries, but poor semantic understanding for niche/technical queries.
- **Query Specificity Determines Signal-to-Noise Ratio:** Precise queries using domain terminology, version numbers, and error codes yield higher precision than generic terms.
- **Verify Before Citing:** Cross-verify version numbers, API syntax, and configuration keys before writing code.
- **Prefer Primary Sources Over Summaries:** Use secondary sources to locate primary sources, not as substitutes.
- **Detect Blocks Early:** Abort parsing when challenge pages or empty SPA shells are encountered.

---

## Workflow

- **Discovery phase - factors to consider:**
  - What search engine is most appropriate for the query type? (e.g. DuckDuckGo Lite for technical precision, Startpage for broad Google indexing, Bing for general fallbacks).
  - What specific terminology, version numbers, or error messages identify the information?
  - What domain hosts the authoritative documentation?
  - What is the required recency window?
- **Extraction phase - factors to consider:**
  - Does the page contain the information directly or point elsewhere?
  - Are there structured snippets (code blocks, tables) to extract?
  - Is the page truncated, and can a more targeted sub-page be fetched?
- **Failure recovery phase - factors to consider:**
  - Is the fetch blocked by WAF or an SPA? If blocked, check if a Wayback Machine snapshot exists.
  - If Wayback content is retrieved, is it older than 5 years (which warrants caution)?
  - Is the target domain a local server with high bot-protection? If so, prioritize search engine snippets or general sources.
- **Verification phase - factors to consider:**
  - Are there conflicting claims requiring cross-verification?
  - Can the syntax or config keys be validated against known schemas?
  - Does the source indicate deprecation or experimental status?

---

## Anti-patterns

- **Attempting to Fetch Google Directly:** Programmatically fetching Google search pages leads to captcha redirection. The overlooked factor: Google blocks automated scrapers; use Startpage or DuckDuckGo Lite instead.
- **Blind Trust in Top Search Results:** Assuming the first result is accurate. The overlooked factor: SEO rankings are orthogonal to correctness.
- **Relying on Bing for Specific Technical Queries:** Expecting Bing to understand highly specific code intent. The overlooked factor: Bing relies heavily on keyword matching rather than semantic intent for niche topics.
- **Single-Source Dependency:** Incorporating undocumented or outdated API behavior without cross-verification.
- **Ignoring Empty 200 OK Responses or Challenge Pages:** Parsing a Cloudflare page or a JS SPA shell as data.
- **Refetching the Same Page Multiple Times:** Failing to cache or reference already retrieved data.
