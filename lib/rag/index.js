/**
 * @fileoverview Public RAG API hub. Initializes the vector store, embedder,
 * and BM25 index, starts the background file watcher, and exposes high-level
 * search/status/lifecycle operations. All calls are wrapped so this module
 * never throws; failures are logged via console.warn.
 *
 * @module lib/rag/index
 */

import { getConfig, ensureDirs } from './config.js';
import * as embedder from './embedder.js';
import * as vectorStore from './vectorStore.js';
import { rebuildIndex } from './hybridSearch.js';
import { retrieve } from './reflectionLoop.js';
import * as watcher from './watcher.js';

/** Whether the RAG runtime has been initialized. */
let ready = false;

/** Optional token-budget estimator fn: ({query, ...ctx}) => number|null. */
let budgetEstimator = null;

/**
 * Initialize the RAG pipeline. Non-blocking: directory setup and core
 * sub-system init happen here, then the background watcher scan is kicked off
 * fire-and-forget (its full index build completes asynchronously).
 *
 * @param {object} [opts]
 * @param {Function|null} [opts.onStatus=null] Status callback forwarded to the watcher.
 * @returns {Promise<{ready: boolean}>} Ready flag (always true once init completes).
 */
export async function init({ onStatus = null } = {}) {
  try {
    const config = getConfig();
    ensureDirs();
    await vectorStore.init();
    await embedder.init({ threads: config.watcher?.cpu_threads ?? null });
    await rebuildIndex();

    // Fire-and-forget: watcher.start performs its own background scan.
    // Never await the full index; attach a no-op catch to avoid unhandled rejections.
    Promise.resolve(watcher.start({ onStatus })).catch((err) => {
      console.warn('[rag] watcher start failed:', err?.message ?? err);
    });

    ready = true;
  } catch (err) {
    console.warn('[rag] init failed:', err?.message ?? err);
    ready = false;
  }
  return { ready };
}

/**
 * Run a retrieval search across the RAG index.
 *
 * @param {object} [params]
 * @param {string} params.query Search query text.
 * @param {string|null} [params.namespace=null] Namespace filter.
 * @param {'both'|string|null} [params.layer='both'] Layer filter; 'both' maps to null (both layers).
 * @param {number} [params.top_k=5] Number of results to return.
 * @param {number} [params.min_score=0.60] Confidence threshold (0..1).
 * @param {number|null} [params.max_prompt_tokens=null] Token budget cap.
 * @param {object|null} [params.filters=null] Reserved: additional metadata filters (unused).
 * @returns {Promise<{results: Array, topScore: number, lowConfidence: boolean, warning: string|null, truncated: boolean, iterations: number}>}
 */
export async function search({
  query,
  namespace = null,
  layer = 'both',
  top_k = 5,
  min_score = 0.60,
  max_prompt_tokens = null,
  filters = null,
} = {}) {
  try {
    // Map layer 'both' -> null (null means both layers).
    const resolvedLayer = layer === 'both' || layer == null ? null : layer;

    // If no explicit budget was supplied, ask the registered estimator.
    if (max_prompt_tokens == null && typeof budgetEstimator === 'function') {
      try {
        const estimate = budgetEstimator({ query, namespace, layer: resolvedLayer, top_k, filters });
        const num = Number(estimate);
        if (Number.isFinite(num) && num > 0) max_prompt_tokens = num;
      } catch (err) {
        console.warn('[rag] budgetEstimator failed, using unbounded budget:', err?.message ?? err);
      }
    }

    const config = getConfig();
    return await retrieve({
      query,
      namespace,
      layer: resolvedLayer,
      top_k,
      min_score,
      max_prompt_tokens,
      maxRetries: config.thresholds?.max_retries ?? 2,
    });
  } catch (err) {
    console.warn('[rag] search failed:', err?.message ?? err);
    return {
      results: [],
      topScore: 0,
      lowConfidence: true,
      warning: 'RAG search failed',
      truncated: false,
      iterations: 0,
    };
  }
}

/**
 * Compute per-layer chunk counts from the vector store.
 * @returns {Promise<Record<string, number>>} layer -> count map.
 */
async function computeLayerSizes() {
  try {
    const rows = await vectorStore.getAllChunks();
    if (!Array.isArray(rows)) return {};
    const sizes = {};
    for (const row of rows) {
      const layer = row?.layer ?? 'unknown';
      sizes[layer] = (sizes[layer] || 0) + 1;
    }
    return sizes;
  } catch (err) {
    console.warn('[rag] computeLayerSizes failed:', err?.message ?? err);
    return {};
  }
}

/**
 * Report the current RAG runtime status.
 * @returns {Promise<{ready: boolean, chunkCount: number, lastIndexTime: number|null, watchedPaths: string[], dbSize: number, modelAvailable: boolean, layerSizes: Record<string, number>}>}
 */
export async function getStatus() {
  try {
    let chunkCount = 0;
    let lastIndexTime = null;
    let dbSize = 0;

    const stats = await vectorStore.getStats();
    if (stats && typeof stats === 'object') {
      chunkCount = Number(stats.chunkCount) || 0;
      dbSize = Number(stats.tableSizeBytes) || 0;
      if (stats.lastWriteTime != null) lastIndexTime = Number(stats.lastWriteTime) || null;
    }

    const config = getConfig();
    const watchedPaths = Object.values(config.watched ?? {}).filter(Boolean);

    return {
      ready,
      chunkCount,
      lastIndexTime,
      watchedPaths,
      dbSize,
      modelAvailable: embedder.isAvailable(),
      layerSizes: await computeLayerSizes(),
    };
  } catch (err) {
    console.warn('[rag] getStatus failed:', err?.message ?? err);
    return {
      ready: false,
      chunkCount: 0,
      lastIndexTime: null,
      watchedPaths: [],
      dbSize: 0,
      modelAvailable: false,
      layerSizes: {},
    };
  }
}

/**
 * Remove orphaned index entries whose files no longer exist on disk.
 * @returns {Promise<void>}
 */
export async function clean() {
  try {
    await watcher.cleanOrphans();
  } catch (err) {
    console.warn('[rag] clean failed:', err?.message ?? err);
  }
}

/**
 * Force a full rebuild of the RAG index from the watched directories.
 * @returns {Promise<void>}
 */
export async function reindex() {
  try {
    await watcher.forceReindex();
  } catch (err) {
    console.warn('[rag] reindex failed:', err?.message ?? err);
  }
}

/**
 * Shut down the RAG runtime: stop the watcher and close the vector store.
 * @returns {Promise<void>}
 */
export async function shutdown() {
  try {
    await watcher.stop();
  } catch (err) {
    console.warn('[rag] shutdown (stop watcher) failed:', err?.message ?? err);
  }
  try {
    await vectorStore.close();
  } catch (err) {
    console.warn('[rag] shutdown (close store) failed:', err?.message ?? err);
  }
  ready = false;
}

/**
 * Register a token-budget estimator used to compute max_prompt_tokens from
 * the current conversation context when no explicit budget is supplied.
 * @param {Function} fn ({query, namespace, layer, top_k, filters}) => number|null
 * @returns {void}
 */
export function setBudgetEstimator(fn) {
  budgetEstimator = typeof fn === 'function' ? fn : null;
}

// getConfig passthrough export (re-exports the config resolver).
export { getConfig };
