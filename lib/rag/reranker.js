/**
 * @fileoverview Cross-encoder re-ranker built on FlashRank — a CPU-optimized,
 * ONNX-based re-ranking library. Model (config.reranker.model):
 * ms-marco-MultiBERT-L-6-v2 (multilingual BERT), far lighter than the legacy
 * bge-reranker-base on constrained CPUs.
 *
 * Keeps the historical module API — init() / isAvailable() / getDim() / rerank() —
 * so lib/rag/hybridSearch.js is unaffected. `getDim()` now returns null because
 * FlashRank does not expose a hidden size (no consumer reads it).
 *
 * The optional 'flashrank' package is imported lazily inside init(), so this
 * module never throws at load time when the dependency (or the network needed
 * to fetch the ONNX model) is missing — it degrades to isAvailable() === false
 * and rerank() returns chunks unchanged with null scores, exactly like the old
 * ONNX Runtime wrapper.
 *
 * @module lib/rag/reranker
 */

import { getConfig } from './config.js';

// Batch/top-N bounds (unchanged from the legacy wrapper).
const BATCH_SIZE = 8;
const DEFAULT_TOP_N = 10;
const MAX_TOP_N = 10;

/** @type {import('flashrank').Rerank|null} */
let reranker = null;
let ready = false;
let initPromise = null;

/**
 * Lazy-load the FlashRank module and return the Rerank class. Never throws.
 * @returns {Promise<Function|null>} The Rerank constructor or null.
 */
async function loadFlashRank() {
  try {
    const mod = await import('flashrank');
    // CJS interop: named export (Node >=20 cjs-module-lexer) or default fallback.
    return mod?.Rerank ?? mod?.default?.Rerank ?? null;
  } catch {
    return null;
  }
}

/**
 * Initialize the re-ranker. Constructs the FlashRank Rerank instance (model
 * files are fetched on first use into FlashRank's own cache). Resolves false
 * gracefully on any failure, and clears initPromise so a later retry works
 * (e.g. after the model cache has been warmed by `npm run setup:rag`).
 *
 * @param {{ modelPath?: string|null, threads?: number|null }} [opts]
 * @returns {Promise<boolean>} True if ready.
 */
export async function init({ modelPath = null, threads = null } = {}) {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const Rerank = await loadFlashRank();
    if (typeof Rerank !== 'function') {
      ready = false;
      return false;
    }
    try {
      const config = getConfig();
      const model = modelPath || config?.reranker?.model || 'ms-marco-MultiBERT-L-6-v2';
      reranker = new Rerank({ model });
      ready = true;
      return true;
    } catch (err) {
      console.warn('[reranker] FlashRank init failed:', err?.message ?? err);
      reranker = null;
      ready = false;
      initPromise = null; // allow retry after model cache warm-up
      return false;
    }
  })();

  return initPromise;
}

/**
 * Whether the re-ranker is ready to score.
 * @returns {boolean}
 */
export function isAvailable() {
  return ready && reranker !== null;
}

/**
 * Hidden dimension of the model. FlashRank does not expose one; kept for API
 * compatibility with the legacy wrapper (no consumer reads it).
 * @returns {null}
 */
export function getDim() {
  return null;
}

/**
 * Re-rank chunks by cross-encoder relevance to the query using FlashRank.
 * On any failure (or when unavailable) chunks are returned unchanged with
 * `rerank_score: null`, preserving the graceful-degradation contract.
 *
 * @param {string} query - The search query.
 * @param {Array<object>} chunks - Chunk objects (id/text/content/... metadata).
 * @param {number} [topN=10] - Max number of chunks to score (capped at 10).
 * @returns {Promise<Array<object>>} Chunks with rerank_score attached, sorted desc.
 */
export async function rerank(query, chunks, topN = DEFAULT_TOP_N) {
  if (!isAvailable()) {
    // Graceful degradation: return chunks unchanged with null scores.
    return chunks.map((c) => ({ ...c, rerank_score: null }));
  }

  if (!Array.isArray(chunks) || chunks.length === 0) return chunks;

  const bounded = Math.min(chunks.length, Math.min(topN ?? DEFAULT_TOP_N, MAX_TOP_N));
  const subset = chunks.slice(0, bounded);

  const passages = subset.map((c, i) => ({
    id: String(c.id ?? `chunk_${i}`),
    text: String(c.text ?? c.content ?? ''),
    meta: { index: i },
  }));

  let scored;
  try {
    scored = await reranker.rerank(query, passages);
  } catch (err) {
    console.warn('[reranker] rerank failed:', err?.message ?? err);
    return chunks.map((c) => ({ ...c, rerank_score: null }));
  }

  if (!Array.isArray(scored)) {
    return chunks.map((c) => ({ ...c, rerank_score: null }));
  }

  // Map FlashRank scores back onto the original chunk objects (preserves full
  // metadata: text, file_path, line spans, section_headers, ...).
  const scoreById = new Map();
  for (const s of scored) {
    scoreById.set(String(s.id), Number(s.score));
  }

  return subset
    .map((c, i) => ({
      ...c,
      rerank_score: scoreById.get(String(c.id ?? `chunk_${i}`)) ?? null,
    }))
    .sort((a, b) => (b.rerank_score ?? -Infinity) - (a.rerank_score ?? -Infinity));
}
