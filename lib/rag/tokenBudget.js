/**
 * Token budget enforcement for RAG retrieval.
 *
 * @module rag/tokenBudget
 */

/** Ratio of prompt to reserve as safety buffer. */
export const SAFETY_BUFFER_RATIO = 0.10;

/**
 * Estimate the number of tokens contained in a block of text.
 *
 * @param {string} text - The text to count tokens for.
 * @param {Function} [tokenizerFn] - Optional tokenizer function. Defaults to a
 *   heuristic of `text.length / 4`.
 * @returns {number} The estimated token count.
 */
export function countTokens(text, tokenizerFn = null) {
  if (typeof text !== 'string') {
    return 0;
  }
  if (typeof tokenizerFn === 'function') {
    return tokenizerFn(text);
  }
  // Heuristic: ~4 chars per token.
  return Math.ceil(text.length / 4);
}

/**
 * Greedily fit pre-ranked chunks into the prompt token budget, reserving a
 * 10% safety buffer.
 *
 * @typedef {Object} Chunk
 * @property {string} text - The chunk text.
 * @property {number} tokens - Optional precomputed token count for the chunk.
 * @property {string} [id] - Optional identifier.
 * @property {*} [metadata] - Optional metadata payload.
 *
 * @param {Array<Record<string, any>>} chunks - Pre-ranked chunks (best first).
 * @param {number} maxPromptTokens - The maximum prompt token allowance.
 * @param {Function} [tokenizerFn] - Optional tokenizer function.
 * @returns {{kept: Array, dropped: Array, usedTokens: number, budget: number}}
 *   An object describing which chunks were kept vs dropped, total tokens used,
 *   and the effective (buffered) budget.
 */
export function enforceBudget(chunks, maxPromptTokens, tokenizerFn = null) {
  const budget = Math.floor(maxPromptTokens * (1 - SAFETY_BUFFER_RATIO));

  const kept = [];
  const dropped = [];
  let usedTokens = 0;

  const remaining = Number.isFinite(budget) && budget > 0 ? budget : 0;

  for (const chunk of chunks) {
    const tokens = Number.isFinite(chunk?.tokens)
      ? chunk.tokens
      : countTokens(chunk?.text ?? '', tokenizerFn);

    const wouldExceed = usedTokens + tokens > remaining;

    if (!wouldExceed) {
      kept.push({ ...chunk, tokens, keptIndex: kept.length });
      usedTokens += tokens;
    } else {
      // If nothing has been kept yet and this single chunk still exceeds the
      // budget, keep it anyway (flag oversized).
      if (kept.length === 0) {
        kept.push({ ...chunk, tokens, keptIndex: 0, oversized: true });
        usedTokens += tokens;
      } else {
        dropped.push(chunk);
      }
    }
  }

  return {
    kept,
    dropped,
    usedTokens,
    budget: remaining,
  };
}
