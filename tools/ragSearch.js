/**
 * rag_search tool — searches the local RAG knowledge base.
 * Follows the existing [schema, handler] pattern used by other tools.
 *
 * This file is ESM. The RAG index is imported lazily (dynamically) to avoid
 * module-load failures when optional RAG dependencies are missing.
 *
 * @module tools/ragSearch
 */

/**
 * JSON Schema describing the rag_search tool parameters.
 */
export const rag_search_schema = {
  type: 'function',
  function: {
    name: 'rag_search',
    description:
      'Search the local RAG index (the project working directory + knowledge base: skills, references) and return the most relevant chunks with similarity scores, file paths, and line ranges. Use this to find indexed file content instead of scanning the project tree or re-reading whole files.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language retrieval query formulated from the task context.',
        },
        namespace: {
          type: 'string',
          description: 'Optional sub-namespace to scope retrieval (e.g. math, essay-draft).',
        },
        layer: {
          type: 'string',
          enum: ['knowledge', 'workspace', 'both'],
          default: 'both',
          description:
            'knowledge = curated references + skills; workspace = the live project you launched the CLI from; both = everything.',
        },
        top_k: {
          type: 'integer',
          default: 5,
          description: 'Number of chunks to return.',
        },
        min_score: {
          type: 'number',
          default: 0.6,
          description: 'Confidence threshold; triggers query rewriting below it.',
        },
        max_prompt_tokens: {
          type: 'integer',
          description: 'Cap on total context tokens injected; 10% safety buffer applied.',
        },
        search_mode: {
          type: 'string',
          enum: ['hybrid', 'keyword', 'dense'],
          default: 'hybrid',
          description:
            'Retrieval mode: hybrid (default, best quality), keyword (fast, exact-word), dense (semantic only). Prefer the default unless speed is explicitly requested.',
        },
      },
      required: ['query'],
    },
  },
};

/**
 * rag_search handler — executes a RAG search and returns a JSON string.
 *
 * @param {object} args - Tool arguments (validated against rag_search_schema).
 * @returns {Promise<string>} JSON string result of the search.
 */
export async function rag_search(args) {
  try {
    // Lazy dynamic import so load failures of optional RAG deps surface here
    // as a descriptive JSON error rather than breaking module loading.
    const index = await import('../lib/rag/index.js');

    const result = await index.search(args);

    const mappedResults = (result.results || []).map((r) => ({
      id: r.id ?? null,
      text: r.text ?? '',
      score: r.score ?? 0,
      layer: r.layer ?? null,
      namespace: r.namespace ?? null,
      file_path: r.file_path ?? null,
      line_start: r.line_start ?? null,
      line_end: r.line_end ?? null,
      section_headers: r.section_headers ?? null,
      // API contract exposes rerank_score (possibly undefined); map to null.
      rerank_score: r.rerank_score ?? null,
    }));

    return JSON.stringify({
      error: false,
      results: mappedResults,
      top_score: typeof result.topScore === 'number' ? result.topScore : null,
      low_confidence: Boolean(result.lowConfidence),
      warning: result.warning ?? null,
      truncated: Boolean(result.truncated),
      total_found: (result.results || []).length,
    });
  } catch (e) {
    return JSON.stringify({
      error: true,
      tool: 'rag_search',
      message: String(e && e.message ? e.message : e),
    });
  }
}
