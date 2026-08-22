/**
 * @fileoverview Hybrid dense + BM25 search with RRF fusion, metadata filtering,
 * optional rerank hook, token-budget enforcement, and search-mode fast paths.
 *
 * Pipeline:
 *   1. expandQuery(query) -> [query, ...subQueries] (deterministic decomposition)
 *   2. Gather dense candidates (embedder) + sparse candidates (BM25)
 *   3. Fuse with Reciprocal Rank Fusion (RRF)
 *   4. Attach normalized per-result scores
 *   5. Optional rerank (dynamic import — never top-level) — hybrid mode only
 *   6. Token-budget enforcement
 *   7. Slice top_k
 *
 * Search modes (`search_mode`):
 *   - 'hybrid'  (default) — dense + BM25 + RRF + optional rerank.
 *   - 'keyword'           — pure in-memory BM25. Skips FastEmbed dense
 *                           embedding, FlashRank reranking AND LanceDB stats —
 *                           ~2-5ms, zero ONNX CPU usage.
 *   - 'dense'             — vector-store embedding search without BM25.
 *
 * Persistence: the in-memory BM25 index + chunk metadata cache are persisted to
 * `.rag/bm25.json` so CLI startup restores them in one read instead of scanning
 * LanceDB and re-tokenizing every chunk on the main event loop.
 *
 * @module lib/rag/hybridSearch
 */

import fs from 'node:fs';
import path from 'node:path';

import { getConfig } from './config.js';
import { isAvailable as embedderAvailable, embed } from './embedder.js';
import { searchDense, getAllChunks, getStats } from './vectorStore.js';
import { BM25Index } from './bm25.js';
import { enforceBudget } from './tokenBudget.js';
import { projectRoot } from './runtime.js';

/** @type {BM25Index|null} */
let bm25Index = null;

/** @type {Promise<void>|null} */
let buildPromise = null;

/** @type {Map<string, object>|null} id -> full chunk metadata (text, sources, ...) */
let chunkMetaById = null;

/** Chunk count at the time the BM25 index was last built (-1 = unknown). */
let lastBuiltCount = -1;

/** Custom persisted search-cache path override (undefined = default dynamic path). */
let customBm25Path = undefined;

/**
 * Persisted search-cache path (.rag/bm25.json). null disables disk caching.
 * @returns {string|null}
 */
function getBm25Path() {
  if (customBm25Path !== undefined) return customBm25Path;
  return path.join(projectRoot(), '.rag', 'bm25.json');
}

/**
 * Override/disable the persisted search-cache path. Tests set this to null so
 * `rebuildIndex()` always builds from the (mocked) vector store.
 * @param {string|null} filePath - Cache path, or null to disable disk caching.
 * @returns {void}
 */
export function setBm25Path(filePath) {
  customBm25Path = filePath === null ? null : (filePath === undefined ? undefined : String(filePath));
}

/**
 * Deterministically expand a query into a list of query strings.
 * - The original query is always first.
 * - When the query contains ' and ' or ' or ', additional decomposed
 *   sub-queries are appended (split on those conjunctions).
 * @param {string} query
 * @returns {string[]}
 */
export function expandQuery(query) {
  const q = (query || '').trim();
  if (!q) return [q];
  const out = [q];
  // Decompose on ' and ' first, then ' or ', deterministically (order preserved).
  const andParts = q
    .split(/\s+and\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (andParts.length > 1) {
    for (const part of andParts) {
      if (part !== q && !out.includes(part)) out.push(part);
    }
    const orized = andParts
      .map((p) => p.split(/\s+or\s+/i).map((x) => x.trim()))
      .flat()
      .filter(Boolean);
    for (const part of orized) {
      if (!out.includes(part)) out.push(part);
    }
    return out;
  }
  const orParts = q
    .split(/\s+or\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (orParts.length > 1) {
    for (const part of orParts) {
      if (part !== q && !out.includes(part)) out.push(part);
    }
  }
  return out;
}

/**
 * Compute a Reciprocal Rank Fusion score given ranked id lists.
 * score(id) = Σ over lists rank(id) of 1/(k + rank)
 * @param {string[][]} lists ranked list of ids per retrieval system, best-first.
 * @param {number} [k]
 * @returns {Record<string, number>} id -> rrf score
 */
export function rrf(lists, k = 60) {
  const counts = {};
  const kk = k > 0 ? k : 60;
  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank];
      if (id === undefined || id === null) continue;
      counts[id] = (counts[id] || 0) + 1 / (kk + rank + 1);
    }
  }
  return counts;
}

/**
 * Restore the persisted search cache from disk, if present and valid.
 * @returns {Promise<{chunkCount:number, chunks:Array, bm25:object}|null>}
 */
async function loadSearchCache() {
  const p = getBm25Path();
  if (!p) return null;
  try {
    const raw = await fs.promises.readFile(p, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return null;
    if (!data.bm25 || typeof data.bm25 !== 'object') return null;
    return {
      chunkCount: Number(data.chunkCount) || 0,
      chunks: Array.isArray(data.chunks) ? data.chunks : [],
      bm25: data.bm25,
    };
  } catch {
    return null;
  }
}

/**
 * Persist the in-memory index + chunk metadata cache to disk (atomic write).
 * Accepts the index instance explicitly so the watcher can persist ITS live
 * shared instance even before hybridSearch's own lazy index has been built.
 * @param {BM25Index|null} [index=bm25Index] - Index to serialize (defaults to
 *   the module-level shared instance).
 * @returns {Promise<boolean>} True when the cache was written.
 */
export async function saveBm25Index(index = null) {
  const p = getBm25Path();
  if (!p) return false;
  const idx = index || bm25Index;
  if (!idx) return false;
  try {
    const chunks = chunkMetaById ? [...chunkMetaById.values()] : [];
    // Persist the ACTUAL serialized index size, not the possibly-stale
    // lastBuiltCount: the watcher may populate the shared index after the
    // module-level index was built empty (cold init before the scan), and a
    // stale count would make warm boots restore a "0 chunk" cache.
    const docCount = typeof idx.documents?.size === 'number' ? idx.documents.size : (idx.totalDocs ?? 0);
    const payload = {
      version: 1,
      chunkCount: docCount > 0 ? docCount : chunks.length,
      chunks,
      bm25: idx.serialize(),
    };
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(payload), 'utf8');
    await fs.promises.rename(tmp, p);
    return true;
  } catch (err) {
    console.warn('[hybridSearch] saveBm25Index failed:', err.message);
    return false;
  }
}

/**
 * Lazily build (once) the module-level BM25 index. When the persisted cache
 * exists it is restored directly (no LanceDB scan, no re-tokenization);
 * otherwise the index is rebuilt from the vector store.
 * Concurrent callers share a single in-flight build promise.
 * @returns {Promise<BM25Index|null>}
 */
export async function rebuildIndex() {
  if (bm25Index) return bm25Index;
  if (buildPromise) return buildPromise;
  buildPromise = (async () => {
    try {
      // Fast path: restore from the persisted search cache.
      const cache = await loadSearchCache();
      if (cache) {
        const index = new BM25Index().deserialize(cache.bm25);
        bm25Index = index;
        chunkMetaById = new Map(cache.chunks.map((c) => [String(c.id), c]));
        lastBuiltCount = cache.chunkCount || cache.chunks.length;
        return index;
      }
      // Fallback: full rebuild from the vector store.
      const chunks = await getAllChunks();
      const safe = Array.isArray(chunks) ? chunks : [];
      const index = new BM25Index();
      await index.init(safe);
      bm25Index = index;
      chunkMetaById = new Map(safe.map((c) => [String(c.id), c]));
      lastBuiltCount = safe.length;
      return index;
    } catch (err) {
      console.warn('[hybridSearch] BM25 index build failed:', err.message);
      return null;
    } finally {
      buildPromise = null;
    }
  })();
  return buildPromise;
}

/**
 * Return the shared BM25 index, building it first if needed (async).
 * The watcher uses the SAME instance so incremental adds stay in sync with
 * search (single source of truth, persisted via saveBm25Index()).
 * @returns {Promise<BM25Index|null>}
 */
export async function ensureBm25Index() {
  return rebuildIndex();
}

/**
 * Synchronous accessor for the shared BM25 index (null until first build).
 * @returns {BM25Index|null}
 */
export function getBm25Index() {
  return bm25Index;
}

/**
 * Look up full chunk metadata by chunk id (populated by rebuildIndex()).
 * @param {string} id - Chunk id.
 * @returns {object|undefined} The chunk record, or undefined.
 */
export function getChunkMeta(id) {
  return chunkMetaById ? chunkMetaById.get(String(id)) : undefined;
}

/**
 * Upsert a single chunk record into the metadata cache (watcher incremental).
 * @param {object} record - Full chunk metadata row.
 * @returns {void}
 */
export function upsertChunkMeta(record) {
  if (!record || record.id === undefined || record.id === null) return;
  if (!chunkMetaById) chunkMetaById = new Map();
  chunkMetaById.set(String(record.id), record);
}

/**
 * Replace the entire metadata cache (watcher full rebuild).
 * @param {Array<object>} records - All chunk metadata rows.
 * @returns {void}
 */
export function setChunkMeta(records) {
  chunkMetaById = new Map((Array.isArray(records) ? records : []).map((c) => [String(c.id), c]));
}

/**
 * Remove a chunk record from the metadata cache (watcher unlink).
 * @param {string|number} id - Chunk id to drop.
 * @returns {void}
 */
export function removeChunkMeta(id) {
  if (chunkMetaById) chunkMetaById.delete(String(id));
}

/**
 * Normalize a raw BM25 score to a 0..1 scale.
 * @param {number} score
 * @returns {number}
 */
function normalizeBm25(score) {
  return 1 - 1 / (1 + score);
}

/**
 * Run hybrid / keyword / dense retrieval.
 * @param {object} params
 * @param {string} params.query
 * @param {string|null} [params.namespace]
 * @param {string|null} [params.layer]
 * @param {number} [params.top_k]
 * @param {number|null} [params.min_score]
 * @param {number|null} [params.max_prompt_tokens]
 * @param {object|null} [params.filters] unused metadata filter bag (reserved)
 * @param {'hybrid'|'keyword'|'dense'} [params.search_mode='hybrid']
 * @returns {Promise<{results: Array<object>, topScore: number, truncated: boolean}>}
 */
export async function search({
  query,
  namespace = null,
  layer = null,
  top_k = 5,
  min_score = null,
  max_prompt_tokens = null,
  filters = null, // eslint-disable-line no-unused-vars
  search_mode = 'hybrid',
}) {
  const config = getConfig();
  const topN = (config.hybrid && config.hybrid.top_n_candidates) || 50;
  const rrfK = (config.hybrid && config.hybrid.rrf_k) || 60;
  const mode = search_mode === 'dense' || search_mode === 'keyword' ? search_mode : 'hybrid';

  const queries = expandQuery(query);

  // ---- 2a. Dense candidates (skipped entirely in keyword fast-path) ----
  /** @type {Array<[string, number]>} id -> dense score */
  const denseList = [];
  /** @type {Array<object>} all dense rows (full chunk metadata) for meta attach */
  const denseRowsAll = [];
  if (mode !== 'keyword' && embedderAvailable()) {
    try {
      const vecs = await embed(queries);
      for (let i = 0; i < vecs.length; i++) {
        const vec = vecs[i];
        const rows = await searchDense(vec, { layer, namespace, limit: topN });
        for (const row of rows) {
          denseRowsAll.push(row);
          const id = row.id;
          const dScore = typeof row.cosine === 'number' ? row.cosine : row.score;
          if (!denseList.some(([x]) => x === id)) {
            denseList.push([id, dScore]);
          } else {
            const idx = denseList.findIndex(([x]) => x === id);
            denseList[idx][1] = Math.max(denseList[idx][1], dScore);
          }
        }
      }
    } catch (err) {
      console.warn('[hybridSearch] dense retrieval failed:', err.message);
    }
  }

  // ---- 2b. Sparse candidates (skipped entirely in dense fast-path) ----
  /** @type {Map<string, number>} id -> bm25 score */
  const bm25Score = new Map();
  /** @type {Array<[string, number]>} id -> bm25 score (ranked) */
  const sparseList = [];
  if (mode !== 'dense') {
    // Refresh the sparse index when the store changed since the last build
    // (background watcher may have indexed new files). Keyword mode is pure
    // in-memory — it skips the LanceDB stats probe for zero-DB latency.
    if (mode === 'hybrid') {
      try {
        const stats = await getStats();
        const count = stats && typeof stats.chunkCount === 'number' ? stats.chunkCount : -1;
        if (count !== lastBuiltCount) {
          bm25Index = null; // force rebuild on next rebuildIndex()
        }
      } catch { /* ignore stats failure; keep cached index */ }
    }
    const index = await rebuildIndex();
    if (index) {
      try {
        for (const q of queries) {
          const hits = await index.search(q, { limit: topN });
          for (const hit of hits) {
            const id = hit.id;
            // metadata filtering by layer / namespace on sparse rows
            const meta = chunkMetaById ? chunkMetaById.get(String(id)) : null;
            if (meta && layer != null && meta.layer !== layer) continue;
            if (meta && namespace != null && meta.namespace !== namespace) continue;
            if (!bm25Score.has(id) || hit.score > bm25Score.get(id)) {
              bm25Score.set(id, hit.score);
            }
          }
        }
      } catch (err) {
        console.warn('[hybridSearch] sparse retrieval failed:', err.message);
      }
    }
    for (const [id, s] of bm25Score) sparseList.push([id, s]);
    sparseList.sort((a, b) => b[1] - a[1]);
  }

  // ---- 3. Fusion / ranking by mode ----
  const denseMap = new Map(denseList);
  const sparseMap = new Map(sparseList);
  let mergedIds;
  if (mode === 'keyword') {
    mergedIds = sparseList.map(([id]) => id);
  } else if (mode === 'dense') {
    mergedIds = denseList.map(([id]) => id);
  } else {
    const denseIds = denseList.map(([id]) => id);
    const sparseIds = sparseList.map(([id]) => id);
    const rrfScores = rrf([denseIds, sparseIds], rrfK);
    mergedIds = Object.keys(rrfScores).sort(
      (a, b) => rrfScores[b] - rrfScores[a]
    );
  }

  // Full chunk metadata (text, file_path, line spans, ...) keyed by id.
  const denseMetaMap = new Map();
  for (const row of denseRowsAll) {
    if (row && row.id != null) denseMetaMap.set(String(row.id), row);
  }

  // ---- 4. Per-result scoring ----
  let results = mergedIds.map((id) => {
    const dense = denseMap.get(id);
    const sparse = sparseMap.has(id) ? sparseMap.get(id) : null;
    let score;
    if (typeof dense === 'number') {
      score = Math.max(0, Math.min(1, dense));
    } else if (sparse != null) {
      score = normalizeBm25(sparse);
    } else {
      score = 0;
    }
    // Attach full chunk metadata (text + source location) from dense rows,
    // falling back to the chunk cache populated by rebuildIndex().
    const row = denseMetaMap.get(String(id)) || (chunkMetaById ? chunkMetaById.get(String(id)) : null) || {};
    return {
      id,
      score,
      dense_score: typeof dense === 'number' ? dense : null,
      bm25_score: sparse,
      ...row,
    };
  });

  // ---- min_score filtering ----
  if (min_score != null) {
    results = results.filter((r) => r.score >= min_score);
  }

  let truncated = false;

  // ---- 5. Rerank (hybrid mode only; keyword/dense skip FlashRank entirely) ----
  if (mode === 'hybrid' && config.reranker && config.reranker.enabled) {
    try {
      const reranker = await import('./reranker.js');
      if (reranker.isAvailable && reranker.isAvailable()) {
        const topNForRerank = (config.reranker.top_n || 10);
        const subset = results.slice(0, topNForRerank);
        if (subset.length) {
          const reranked = await reranker.rerank(query, subset, topNForRerank);
          if (Array.isArray(reranked) && reranked.length) results = reranked;
        }
      }
    } catch (err) {
      console.warn('[hybridSearch] rerank failed, skipping:', err.message);
    }
  }

  // ---- 6. Token budget ----
  if (max_prompt_tokens != null && results.length) {
    const res = enforceBudget(results, max_prompt_tokens);
    results = res.kept;
    truncated = (res.dropped && res.dropped.length) > 0;
  }

  // ---- 7. Slice top_k ----
  results = results.slice(0, top_k);
  const topScore = results.length ? results[0].score ?? 0 : 0;

  return { results, topScore, truncated };
}
