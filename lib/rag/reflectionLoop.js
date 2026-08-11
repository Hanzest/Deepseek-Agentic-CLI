import { search as hybridSearch } from './hybridSearch.js';

const SYNONYM_MAP = new Map([
  ['deploy', 'deployment, release'],
  ['config', 'configuration, settings'],
  ['auth', 'authentication, login'],
  ['error', 'error, exception, failure'],
  ['api', 'api, endpoint, interface'],
  ['test', 'test, testing, unit test'],
  ['security', 'security, authentication, access control'],
]);

/**
 * Deterministically rewrite a query for retry: append a synonym for the
 * first known keyword (if the query has no embedded list separators), and
 * strip trailing punctuation ('?' / '!').
 *
 * @param {string} query - Original query string.
 * @returns {string} Rewritten deterministic query.
 */
export function rewriteQuery(query) {
  if (typeof query !== 'string') return String(query ?? '');
  let q = query;
  for (const { 0: keyword, 1: synonym } of SYNONYM_MAP) {
    if (q.toLowerCase().includes(keyword)) {
      if (!q.includes('/') && !q.includes(',')) {
        q = `${q} ${synonym}`;
      }
      break;
    }
  }
  return q.replace(/[?!]+$/u, '');
}

/**
 * Agentic reflection + bounded query-rewrite retrieval loop.
 * Runs an initial hybrid search, then, if confidence is low, rewrites the
 * query and retries up to maxRetries times. Never throws.
 *
 * @param {object} params
 * @param {string} params.query - Search query text.
 * @param {string|null} [params.namespace=null] - Namespace filter.
 * @param {string|null} [params.layer=null] - Layer filter.
 * @param {number} [params.top_k=5] - Number of results to return.
 * @param {number} [params.min_score=0.60] - Confidence threshold (0..1).
 * @param {number|null} [params.max_prompt_tokens=null] - Token budget cap.
 * @param {number} [params.maxRetries=2] - Max retries, clamped to [0, 2].
 * @param {'hybrid'|'keyword'|'dense'} [params.search_mode='hybrid'] - Retrieval mode.
 * @returns {Promise<{results: Array, topScore: number, lowConfidence: boolean, warning: string|null, iterations: number, truncated: boolean}>}
 */
export async function retrieve({
  query,
  namespace = null,
  layer = null,
  top_k = 5,
  min_score = 0.60,
  max_prompt_tokens = null,
  maxRetries = 2,
  search_mode = 'hybrid',
}) {
  const clampedRetries = Math.max(0, Math.min(2, Number(maxRetries) || 0));

  const runSearch = async (q) => {
    try {
      return await hybridSearch({
        query: q,
        namespace,
        layer,
        top_k,
        max_prompt_tokens,
        search_mode,
      });
    } catch {
      return { results: [], topScore: 0, truncated: false };
    }
  };

  // Step 1: initial run.
  let attempt = await runSearch(query);
  let iterations = 1;

  if (!attempt.results || attempt.results.length === 0) {
    return {
      results: [],
      topScore: 0,
      lowConfidence: true,
      warning: 'no relevant data found',
      iterations,
      truncated: Boolean(attempt.truncated),
    };
  }

  const topScore = Number(attempt.topScore) || 0;
  if (topScore >= min_score) {
    return {
      results: attempt.results,
      topScore,
      lowConfidence: false,
      warning: null,
      iterations,
      truncated: Boolean(attempt.truncated),
    };
  }

  // Step 2: bounded reflection loop.
  let currentQuery = query;
  while (iterations < clampedRetries) {
    currentQuery = rewriteQuery(currentQuery);
    attempt = await runSearch(currentQuery);
    iterations += 1;

    const score = Number(attempt.topScore) || 0;
    if (score >= min_score) {
      return {
        results: attempt.results,
        topScore: score,
        lowConfidence: false,
        warning: null,
        iterations,
        truncated: Boolean(attempt.truncated),
      };
    }
  }

  // Step 3: best-effort fallback after exhausted budget.
  const finalScore = Number(attempt.topScore) || 0;
  return {
    results: attempt.results || [],
    topScore: finalScore,
    lowConfidence: true,
    warning: 'WARNING: Low confidence context',
    iterations,
    truncated: Boolean(attempt.truncated),
  };
}
