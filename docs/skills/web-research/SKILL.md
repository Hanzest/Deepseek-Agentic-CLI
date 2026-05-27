# SKILL.md

## Metadata

- **Name:** Web Research & Information Retrieval
- **Description:** Systematic search, evaluation, and extraction of information from the web — covering query formulation, result assessment, content extraction strategies, source verification, and handling of incomplete or contradictory information, and graceful error handling when fetches are blocked by bot-protection systems.

---

## When to Use

- **USE WHEN:** Searching for external information to answer a question, verify a claim, find documentation, research a library or API, look up current events, or gather data from public websites to inform implementation decisions.
- **DO NOT USE FOR:** Retrieving information already present in the local codebase (use file-reading tools instead), querying private/internal systems not accessible via public web, or fetching data that requires authentication the agent does not possess.

---

## Constraints & Rules

- **Search result freshness:** Web search indexes are not real-time. For time-sensitive queries (recent releases, breaking changes, active incidents), evaluate the publication date of each result against the recency requirement of the question.
- **Source authority gradient:** Not all sources carry equal weight. Prefer official documentation, maintainer-authored guides, and well-established community references over personal blogs, unmaintained tutorials, or AI-generated content farms. When the source authority is unclear, cross-verify across at least two independent sources.
- **Content truncation tolerance:** Fetched web pages are truncated at a character limit. When a page is truncated mid-relevant-content, consider fetching specific sub-sections of the same site or narrowing the search to find a more focused page.
- **Rate limiting and politeness:** Web search and fetch operations should be batched and minimized. Excessive sequential requests to the same domain may trigger rate limiting or IP blocks.
- **Language and locale awareness:** Search results are influenced by the locale and language of the query. When searching for documentation in a specific language or regional standard, include the language/locale qualifier in the query terms.
- **Fetch failure diagnosis:** A successful HTTP 200 response does not guarantee genuine content. `fetch_url` may return challenge pages (Cloudflare, reCAPTCHA), login walls, CAPTCHA gates, or empty placeholder pages. Evaluate the fetched content for blocking signals — unusually short pages containing "verify", "human", "challenge", "access denied", or "enable JavaScript" — before treating the content as authoritative.
- **Source accessibility fallback:** When a primary source blocks automated fetches, evaluate alternative access paths: cached versions (Google Cache, archive.org), raw mirrors (GitHub raw content, package registries), or static documentation snapshots. A blocked fetch is not a dead end — it is a signal to change access strategy.

---

## Core Principles

- **Query specificity determines signal-to-noise ratio:** A well-formed query with domain-specific terminology, version numbers, and context keywords yields significantly higher precision than generic or underspecified queries. Invest tokens in query precision before parsing noisy result sets.
- **Verify before citing:** Information obtained from the web must be cross-verified before being incorporated into production code, documentation, or decision-making — especially version numbers, deprecation notices, security advisories, and configuration syntax.
- **Prefer primary sources over secondary summaries:** Official documentation, specification RFCs, and maintainer changelogs are more reliable than synthesized summaries or tutorial interpretations. Use secondary sources to discover primary sources, not as substitutes for them.
- **Extract structure, not just text:** When fetching documentation, prioritize pages with structured data (code blocks, tables, API signatures, changelogs) over prose-heavy content. Structured content is less ambiguous and more directly actionable.
- **Iterative refinement over single-shot search:** Information retrieval is rarely successful on the first attempt. Evaluate initial results to identify missing terms, overly broad categories, or wrong vocabulary, then refine the query accordingly.
- **Detect blocked content before consuming it:** Fetched content that resembles a challenge page, login prompt, or error wall is not a valid data source. Evaluate the response for anti-bot patterns before extracting information. If blocked, fall back to alternative URLs, cached versions, or search-result snippets rather than parsing the block page.

---

## Workflow

- **Discovery phase - factors to consider:**
  - What specific terms, version numbers, library names, or error messages uniquely identify the information sought? (generic terms produce generic results — specificity is a force multiplier)
  - What domain or site likely hosts authoritative information on this topic? (official docs, RFC repositories, package registries, language specification sites)
  - What is the acceptable recency window for the information? (API docs from 2019 may be dangerously outdated for a framework with quarterly releases)
  - What is the accessibility profile of the target site? (platforms like Read the Docs, GitBook, or corporate wikis may block automated fetches; raw content sources like GitHub, npm, or PyPI are more resilient)

- **Extraction phase - factors to consider:**
  - Does the fetched page contain the information directly, or is it a portal/index that points to other pages? (index pages require deeper crawling; direct pages yield immediate answers)
  - Are there code blocks, configuration snippets, or structured data that can be directly adapted? (prefer structured content over prose descriptions when the goal is implementation)
  - Is the content truncated? If so, can the relevant section be fetched separately or found on a more focused sub-page?

- **Failure recovery - factors to consider when fetches are blocked:**
  - Is the fetched content a bot-block page instead of genuine content? Detect by checking for: very short content length, presence of "verify you are human", "challenge", "access denied", "enable JavaScript", "captcha", or "Cloudflare". If detected, abort — do not parse the block page.
  - What fallback path exists for a blocked source? Evaluate in order: (1) GitHub raw links for open-source projects, (2) Google cached copy, (3) archive.org Wayback Machine, (4) search-result snippet from the original query, (5) a different authoritative domain on the same topic.
  - Is the search engine itself rate-limiting? If search returns empty, truncated, or challenge-like results, consider: reducing query frequency, rephrasing the query, or waiting before retrying.

- **Verification phase - factors to consider:**
  - Does the information conflict with other sources or with the agent's existing knowledge? (conflicting claims require cross-referencing, not arbitrary selection)
  - Can the claimed behavior be tested or validated independently? (syntax, configuration keys, and API signatures can often be validated against known patterns or schemas)
  - Does the source itself indicate uncertainty or caveats? (phrases like "may work", "deprecated in favor of", "not recommended for production" are signals to seek alternative approaches)

---

## Anti-patterns

- **Blind trust in top search results:** Assuming the first search result is the most correct or authoritative. Search ranking is influenced by SEO, recency, and popularity — not accuracy. The overlooked factor: relevance-ranking signals are orthogonal to factual correctness; verification is a separate step.
- **Single-source dependency:** Relying on one website (especially a tutorial or forum post) for all information on a topic. If that source is outdated, incorrect, or incomplete, the entire implementation inherits the flaw. The overlooked factor: cross-verification is the only defense against propagation of bad information.
- **Refetching the same page multiple times:** Re-fetching a page that was already retrieved to re-read its content instead of referencing the previously extracted information. Wastes token budget and risks rate limiting. The overlooked factor: batch and cache — fetch once, reference many times.
- **Overly broad queries followed by manual scanning:** Using vague search terms like "how to do X" and scanning dozens of irrelevant results. Produces high noise and low yield. The overlooked factor: query refinement (adding version numbers, language names, error codes) costs fewer tokens than parsing irrelevant pages.
- **Ignoring fetch failure signals:** Consuming a bot-block or login-wall page as if it were genuine content, extracting garbage or misleading information, and incorporating it into the answer. The overlooked factor: a 200 HTTP status does not imply useful content — evaluate the semantic content of the response, not just its status code, before treating it as a valid data source.
