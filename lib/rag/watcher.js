/**
 * @fileoverview Chokidar background file watcher with incremental indexing for
 * the two indexed RAG layers (knowledge/ and workspace/).
 *
 * LIVE watching is restricted to `knowledge/` only (config.watcher.active_layers)
 * so editing workspace/ files during chat never triggers ONNX re-embedding.
 * workspace/ is still indexed during the initial scan, keeping existing
 * workspace content searchable.
 *
 * Features:
 *   - Persistent hash cache (.rag/hashes.json: relPath -> sha256) so unchanged
 *     files are skipped on rescan.
 *   - Persistent BM25 search cache (.rag/bm25.json) — when present, startup
 *     skips the full directory re-scan (instant boot).
 *   - Debounced, coalesced file events (config.watcher.debounce_ms).
 *   - Incremental indexing: add/change -> vector store + shared BM25 (single
 *     file only — no full rebuildBm25 on single-file events), unlink -> removal.
 *   - Degraded mode: when the embedding model is unavailable, indexing proceeds
 *     with BM25-only (vectors = null).
 *   - All async errors are caught and logged; the watcher never crashes.
 *
 * @module lib/rag/watcher
 */

import fs from 'node:fs';
import path from 'node:path';

import { getConfig, ensureDirs } from './config.js';
import { projectRoot } from './runtime.js';
import { isExcluded } from './ragignore.js';
import { hashFile, detectLanguage } from './metadata.js';
import { chunkTextAsync } from './chunker.js';
import { init as initEmbedder, embed, isAvailable } from './embedder.js';
import * as vectorStore from './vectorStore.js';
import { BM25Index } from './bm25.js';
import * as hybridSearch from './hybridSearch.js';

const ROOT = projectRoot();
const HASHES_PATH = path.join(ROOT, '.rag', 'hashes.json');
const BM25_PATH = path.join(ROOT, '.rag', 'bm25.json');

/** Code languages routed through the AST chunker. */
const CODE_LANGUAGES = new Set(['python', 'javascript', 'typescript', 'go', 'cpp']);

/** Module-level state. */
let started = false;
let watcher = null;
let hashes = new Map();      // relPath -> sha256
let debounceTimers = new Map(); // absPath -> timer
let runningBatches = 0;
let state = {
  ragReady: false,
  ragChunkCount: 0,
  ragLastIndexTime: null,
};

/** Throttle interval for batch (initial-scan) status emission. */
const BATCH_EMIT_MS = 2000;
let lastBatchEmit = 0;

/** Settled dependency overrides (defaults to real modules). */
const deps = {
  embedder: null,
  vectorStore: null,
  bm25: null,
};

/* --------------------------------------------------------------------------
 * Hash cache persistence
 * ------------------------------------------------------------------------ */

/**
 * Load the hash cache from disk. Missing or corrupt files yield an empty map.
 */
async function loadHashes() {
  try {
    const raw = await fs.promises.readFile(HASHES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    hashes = new Map(Object.entries(parsed));
  } catch {
    hashes = new Map();
  }
}

/**
 * Atomically persist the hash cache to disk.
 */
async function saveHashes() {
  try {
    await fs.promises.mkdir(path.dirname(HASHES_PATH), { recursive: true });
    const obj = Object.fromEntries(hashes.entries());
    await fs.promises.writeFile(HASHES_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.warn('[watcher] failed to persist hashes.json:', err.message);
  }
}

/* --------------------------------------------------------------------------
 * Layer resolution
 * ------------------------------------------------------------------------ */

/**
 * Given an absolute path and a layer root, return the relative path (with
 * forward slashes) used as the index key. Returns null when the path does not
 * live under that root.
 * @param {string} absPath - Absolute file path.
 * @param {string} layerRoot - Absolute root of the layer.
 * @returns {string|null} Relative posix key or null.
 */
function relKey(absPath, layerRoot) {
  const rel = path.relative(layerRoot, absPath);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/**
 * Resolve which layer owns a given absolute path.
 * @param {string} absPath - Absolute path.
 * @returns {{layer:string, layerRoot:string, rel:string}|null} Layer info or null.
 */
function resolveLayer(absPath) {
  const cfg = getConfig();
  for (const [layer, layerRoot] of Object.entries(cfg.watched)) {
    const rel = relKey(absPath, layerRoot);
    if (rel !== null) return { layer, layerRoot, rel };
  }
  return null;
}

/* --------------------------------------------------------------------------
 * Scaffolding
 * ------------------------------------------------------------------------ */

/**
 * Remove all BM25 documents for a file whose chunks carry the given id prefix.
 * @param {string} layer - Layer name.
 * @param {string} rel - File-relative key (posix).
 */
function removeBm25ForFile(layer, rel) {
  if (!deps.bm25) return;
  const prefix = `${layer}:${rel}:`;
  for (const id of [...deps.bm25.documents.keys()]) {
    if (id.startsWith(prefix)) {
      try {
        deps.bm25.removeDocument(id);
        hybridSearch.removeChunkMeta(id);
      } catch (err) {
        console.warn('[watcher] bm25 remove failed:', err.message);
      }
    }
  }
}

/**
 * Rebuild the BM25 index from the full set of current chunks, refresh the
 * shared hybridSearch metadata cache, and persist the search cache to disk.
 * Used after large batches / full re-indexes — never on single-file events.
 */
async function rebuildBm25() {
  try {
    const allChunks = await deps.vectorStore.getAllChunks();
    if (!Array.isArray(allChunks)) return;
    if (!deps.bm25) return;
    deps.bm25.rebuild(
      allChunks
        .filter((c) => c && typeof c.id === 'string' && typeof c.text === 'string')
        .map((c) => ({ id: c.id, text: c.text }))
    );
    hybridSearch.setChunkMeta(allChunks);
    await hybridSearch.saveBm25Index(deps.bm25);
  } catch (err) {
    console.warn('[watcher] bm25 rebuild failed:', err.message);
  }
}

/**
 * Refresh state.ragChunkCount from the vector store (best-effort).
 */
async function refreshChunkCount() {
  try {
    const stats = await deps.vectorStore.getStats();
    if (stats && typeof stats.chunkCount === 'number') {
      state.ragChunkCount = stats.chunkCount;
    }
  } catch { /* keep previous count */ }
}

/**
 * Refresh the public status via the onStatus callback.
 * @param {Function} [onStatus] - Status reporter.
 */
async function emitStatus(onStatus) {
  if (typeof onStatus === 'function') {
    try {
      await onStatus({ ...state });
    } catch (err) {
      console.warn('[watcher] onStatus failed:', err.message);
    }
  }
}

/* --------------------------------------------------------------------------
 * Text extraction
 * ------------------------------------------------------------------------ */

/**
 * Extract raw text from a binary document (.docx / .pdf). Falls back to UTF-8
 * text for anything else.
 * @param {string} absPath - Absolute file path.
 * @param {string} ext - Lowercased file extension.
 * @returns {Promise<string>} Extracted text content.
 */
/**
 * Reconstruct a PDF page's text with real line breaks and paragraph gaps.
 *
 * pdfjs gives text items with `transform[5]` = baseline y. Items on the same
 * visual line share a y; a large y-gap between consecutive lines signals a
 * paragraph break. Without this, an entire page becomes one giant paragraph,
 * which destroys the chunker's structure detection.
 *
 * @param {Array<object>} items - pdfjs getTextContent() items.
 * @returns {string} Page text with '\n' line breaks and '\n\n' paragraph gaps.
 */
function reconstructPageText(items) {
  const pts = (items || [])
    .filter((it) => it && typeof it.str === 'string' && it.str.length > 0)
    .map((it) => ({
      x: (it.transform && typeof it.transform[4] === 'number') ? it.transform[4] : 0,
      y: (it.transform && typeof it.transform[5] === 'number') ? it.transform[5] : 0,
      str: it.str,
    }));
  if (pts.length === 0) return '';

  // Sort by vertical then horizontal position.
  pts.sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // Group into visual lines (tolerance ~1.5 pdf units).
  const lines = [];
  let cur = [];
  let curY = null;
  for (const p of pts) {
    if (curY === null || Math.abs(p.y - curY) <= 1.5) {
      cur.push(p);
      curY = curY === null ? p.y : (curY * 0.5 + p.y * 0.5);
    } else {
      lines.push(cur);
      cur = [p];
      curY = p.y;
    }
  }
  if (cur.length > 0) lines.push(cur);

  const lineTexts = lines.map((ln) => ln.map((p) => p.str).join(' ').trim()).filter((t) => t.length > 0);
  if (lineTexts.length === 0) return '';

  // Median vertical gap between consecutive lines.
  const gaps = [];
  for (let i = 1; i < lines.length; i += 1) {
    gaps.push(lines[i][0].y - lines[i - 1][0].y);
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

  const out = [];
  for (let i = 0; i < lineTexts.length; i += 1) {
    if (i > 0) {
      const g = gaps[i - 1];
      // A gap > ~2.5x the median signals a paragraph boundary.
      out.push(g > Math.max(median * 2.5, 3) ? '\n\n' : '\n');
    }
    out.push(lineTexts[i]);
  }
  return out.join('');
}

export async function extractText(absPath, ext) {
  if (ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: absPath });
      return result.value ?? '';
    } catch (err) {
      console.warn(`[watcher] docx extraction failed for ${absPath}:`, err.message);
      return '';
    }
  }
  if (ext === '.pdf') {
    try {
      // pdfjs-dist v5 requires the 'legacy' build in Node (DOMMatrix polyfill).
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const data = new Uint8Array(await fs.promises.readFile(absPath));
      const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += reconstructPageText(content.items) + '\n';
      }
      return text;
    } catch (err) {
      console.warn(`[watcher] pdf extraction failed for ${absPath}:`, err.message);
      return '';
    }
  }
  try {
    return await fs.promises.readFile(absPath, 'utf8');
  } catch (err) {
    console.warn(`[watcher] read failed for ${absPath}:`, err.message);
    return '';
  }
}

/* --------------------------------------------------------------------------
 * Indexing
 * ------------------------------------------------------------------------ */

/**
 * Index a single file into the vector store and BM25 index.
 * @param {string} absPath - Absolute path.
 * @param {object} layer - Resolved layer info ({layer, layerRoot, rel}).
 * @param {{onStatus?:Function, batch?:boolean}} opts - Options.
 * @returns {Promise<boolean>} True when the file was (re)indexed.
 */
async function indexFile(absPath, layer, { onStatus = null, batch = false } = {}) {
  let fileHash;
  try {
    fileHash = await hashFile(absPath);
  } catch (err) {
    console.warn(`[watcher] cannot hash ${absPath}:`, err.message);
    return false;
  }

  const prevHash = hashes.get(layer.rel);
  if (prevHash === fileHash) return false; // unchanged

  // Remove prior slices of this file before re-adding.
  if (prevHash !== undefined) {
    try {
      await deps.vectorStore.removeByFile(absPath);
      removeBm25ForFile(layer.layer, layer.rel);
    } catch (err) {
      console.warn(`[watcher] pre-remove failed for ${absPath}:`, err.message);
    }
  }

  const language = detectLanguage(absPath);
  const ext = path.extname(absPath).toLowerCase();
  const embedFn = deps.embedder && deps.embedder.isAvailable()
    ? (texts) => deps.embedder.embed(texts)
    : null;

  let chunks;
  try {
    if (language && CODE_LANGUAGES.has(language)) {
      const { chunkCodeAsync } = await import('./astChunker.js');
      chunks = await chunkCodeAsync(await extractText(absPath, ext), {
        filePath: absPath,
        layer: layer.layer,
        layerRoot: layer.layerRoot,
        language,
        fileHash,
      });
    } else {
      const text = await extractText(absPath, ext);
      if (!text || !text.trim()) return false; // empty/garbage content
      chunks = await chunkTextAsync(text, {
        filePath: absPath,
        layer: layer.layer,
        layerRoot: layer.layerRoot,
        language,
        fileHash,
        embedFn,
      });
    }
  } catch (err) {
    console.warn(`[watcher] chunking failed for ${absPath}:`, err.message);
    return false;
  }

  if (!chunks || chunks.length === 0) return false;

  // Embed (degraded -> null vectors).
  let vectors = null;
  try {
    if (embedFn) {
      const texts = chunks.map((c) => (c && typeof c.text === 'string' ? c.text : ''));
      vectors = await deps.embedder.embed(texts);
    }
  } catch (err) {
    console.warn(`[watcher] embedding failed for ${absPath}, falling back to BM25-only:`, err.message);
    vectors = null;
  }

  // Degraded mode (no embedding model): persist rows with zero vectors so the
  // vector store can still serve BM25 rebuilds via getAllChunks().
  if (!vectors || vectors.length === 0) {
    vectors = chunks.map(() => new Float32Array(384));
  }

  try {
    await deps.vectorStore.addChunks(chunks, vectors);
    if (vectors && Array.isArray(vectors) && vectors.length !== chunks.length) {
      console.warn(`[watcher] vector count mismatch for ${absPath} (${vectors.length} vs ${chunks.length})`);
    }
  } catch (err) {
    console.warn(`[watcher] vectorStore.addChunks failed for ${absPath}:`, err.message);
  }

  // Incremental BM25 add (shared hybridSearch instance) + metadata cache sync.
  if (deps.bm25) {
    try {
      for (const c of chunks) {
        if (c && typeof c.id === 'string' && typeof c.text === 'string') {
          deps.bm25.addDocument(c.id, c.text);
        }
        if (c && c.id !== undefined && c.id !== null) {
          hybridSearch.upsertChunkMeta(c);
        }
      }
    } catch (err) {
      console.warn(`[watcher] bm25 add failed for ${absPath}:`, err.message);
    }
  }

  hashes.set(layer.rel, fileHash);
  state.ragLastIndexTime = Date.now();
  await refreshChunkCount();
  if (!batch) {
    await hybridSearch.saveBm25Index(deps.bm25);
    await saveHashes();
    await emitStatus(onStatus);
  } else {
    // During the initial scan (batch=true) report progress on a throttle so
    // the UI (/status) shows a live chunk count instead of a frozen 0 for
    // the whole (potentially minutes-long) first index of large corpora.
    const now = Date.now();
    if (now - lastBatchEmit >= BATCH_EMIT_MS) {
      lastBatchEmit = now;
      await emitStatus(onStatus);
    }
  }
  return true;
}

/* --------------------------------------------------------------------------
 * Debounced event handling
 * ------------------------------------------------------------------------ */

/**
 * Queue an add/change event for a file, debounced per file.
 * @param {string} absPath - Absolute changed path.
 * @param {{onStatus?:Function}} ctx - Context.
 */
function queueAdd(absPath, ctx) {
  if (debounceTimers.has(absPath)) clearTimeout(debounceTimers.get(absPath));
  const timer = setTimeout(() => {
    debounceTimers.delete(absPath);
    runningBatches += 1;
    (async () => {
      const layer = resolveLayer(absPath);
      if (!layer) return;
      if (isExcluded(absPath, layer.layerRoot)) return;
      await indexFile(absPath, layer, { onStatus: ctx.onStatus });
    })()
      .catch((err) => console.warn('[watcher] add handler error:', err.message))
      .finally(() => {
        runningBatches -= 1;
        if (runningBatches === 0) {
          saveHashes().then(() => emitStatus(ctx.onStatus)).catch(() => {});
        }
      });
  }, getConfig().watcher.debounce_ms);
  debounceTimers.set(absPath, timer);
}

/**
 * Process a file unlink event.
 * @param {string} absPath - Removed file path.
 */
async function handleUnlink(absPath) {
  const layer = resolveLayer(absPath);
  if (!layer) return;
  try {
    await deps.vectorStore.removeByFile(absPath);
    removeBm25ForFile(layer.layer, layer.rel);
    if (hashes.delete(layer.rel)) {
      await saveHashes();
    }
    await hybridSearch.saveBm25Index(deps.bm25);
    await refreshChunkCount();
  } catch (err) {
    console.warn(`[watcher] unlink handling failed for ${absPath}:`, err.message);
  }
}

/**
 * Process a directory unlink (remove subtree from indexes).
 * @param {string} dirPath - Removed directory path.
 */
async function handleUnlinkDir(dirPath) {
  const layer = resolveLayer(dirPath);
  if (!layer) return;
  const prefix = `${layer.layer}:${layer.rel}/`;
  try {
    await deps.vectorStore.removeSubtree(layer.layer, prefix);
    if (deps.bm25) {
      for (const id of [...deps.bm25.documents.keys()]) {
        if (id.startsWith(prefix)) {
          try {
            deps.bm25.removeDocument(id);
            hybridSearch.removeChunkMeta(id);
          } catch { /* ignore */ }
        }
      }
    }
    await hybridSearch.saveBm25Index(deps.bm25);
  } catch (err) {
    console.warn(`[watcher] unlinkDir handling failed for ${dirPath}:`, err.message);
  }
}

/* --------------------------------------------------------------------------
 * Initial scan
 * ------------------------------------------------------------------------ */

/**
 * Recursively walk a directory collecting non-excluded file paths.
 * @param {string} dir - Directory to walk.
 * @param {string} layerRoot - Layer root for exclusion checks.
 * @returns {Promise<string[]>} Absolute file paths.
 */
async function walk(dir, layerRoot) {
  let results = [];
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[watcher] cannot read dir ${dir}:`, err.message);
    return results;
  }
  for (const entry of entries) {
    const entryAbs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcluded(entryAbs, layerRoot)) continue;
      results = results.concat(await walk(entryAbs, layerRoot));
    } else if (entry.isFile()) {
      if (isExcluded(entryAbs, layerRoot)) continue;
      results.push(entryAbs);
    }
  }
  return results;
}

/**
 * Perform the initial background scan: walk both roots and index changed/new
 * files, then rebuild BM25 once and mark the index ready.
 * @param {object} ctx - Context ({onStatus}).
 */
async function initialScan(ctx) {
  const cfg = getConfig();
  runningBatches += 1;
  try {
    // Signal "indexing..." before the (possibly long) walk begins.
    await emitStatus(ctx.onStatus);
    for (const [layer, layerRoot] of Object.entries(cfg.watched)) {
      const files = await walk(layerRoot, layerRoot);
      for (const absPath of files) {
        const rel = relKey(absPath, layerRoot);
        if (rel === null) continue;
        const prevHash = hashes.get(rel);
        let fileHash;
        try {
          fileHash = await hashFile(absPath);
        } catch {
          continue;
        }
        const indexed = await indexFile(absPath, { layer, layerRoot, rel }, { onStatus: ctx.onStatus, batch: true });
        if (indexed) {
          await new Promise((r) => setImmediate(r));
        }
      }
    }
    await rebuildBm25();
    await saveHashes();
  } catch (err) {
    console.warn('[watcher] initial scan failed:', err.message);
  } finally {
    runningBatches -= 1;
    await refreshChunkCount();
    state.ragReady = true;
    await emitStatus(ctx.onStatus);
  }
}

/* --------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------ */

/**
 * Start the watcher: init stores, run the initial background scan, and begin
 * watching the configured layers.
 *
 * @param {object} [opts] - Options.
 * @param {Function|null} [opts.onStatus] - Status callback.
 * @param {object|null} [opts.embedderOverride] - Test override for embedder.
 * @param {object|null} [opts.vectorStoreOverride] - Test override for vector store.
 * @param {object|null} [opts.bm25Override] - Test override for BM25 instance.
 * @returns {Promise<{ready:boolean}>} Ready flag.
 */
export async function start({ onStatus = null, embedderOverride = null, vectorStoreOverride = null, bm25Override = null } = {}) {
  if (started) return { ready: state.ragReady };
  started = true;

  ensureDirs();
  const cfg = getConfig();

  // Resolve dependency overrides (default to real modules).
  deps.embedder = embedderOverride || {
    init: initEmbedder,
    isAvailable: () => Boolean(isAvailable()),
    embed: (texts) => embed(texts),
  };
  deps.vectorStore = vectorStoreOverride || vectorStore;
  deps.bm25 = bm25Override || hybridSearch.getBm25Index() || (await hybridSearch.ensureBm25Index()) || new BM25Index();

  const ctx = { onStatus };

  try {
    await deps.embedder.init({ threads: cfg.watcher.cpu_threads });
  } catch (err) {
    console.warn('[watcher] embedder init failed (degraded):', err.message);
  }
  try {
    await deps.vectorStore.init();
  } catch (err) {
    console.warn('[watcher] vectorStore init failed:', err.message);
  }

  await loadHashes();

  // Cache-aware startup: when both the BM25 search cache and the hash cache
  // exist, restore the shared index from disk and SKIP the full directory
  // re-scan so the CLI boots instantly (no LanceDB scan / re-tokenization).
  const cacheReady = fs.existsSync(BM25_PATH) && fs.existsSync(HASHES_PATH);
  if (cacheReady) {
    try {
      const loaded = await hybridSearch.ensureBm25Index();
      if (loaded) deps.bm25 = loaded;
    } catch {
      /* corrupt cache -> fall through to a full scan */
    }
  }

  if (cacheReady && deps.bm25 && deps.bm25.totalDocs > 0) {
    state.ragReady = true;
    await emitStatus(ctx.onStatus);
  } else {
    // Kick off the initial background scan (first run / missing cache).
    setImmediate(() => {
      initialScan(ctx).catch((err) => console.warn('[watcher] background scan error:', err.message));
    });
  }

  // Set up the chokidar file watcher — LIVE watching is restricted to the
  // active layers only (knowledge/). workspace/ is never watched so editing
  // workspace files during chat never triggers ONNX re-embedding.
  try {
    const chokidar = await import('chokidar');
    const activeLayers = Array.isArray(cfg.watcher?.active_layers)
      ? cfg.watcher.active_layers
      : ['knowledge'];
    const watchRoots = activeLayers
      .map((layerName) => cfg.watched[layerName])
      .filter(Boolean)
      .filter((r) => fs.existsSync(r));
    watcher = chokidar.watch(watchRoots, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    watcher.on('add', (p) => queueAdd(path.resolve(p), ctx));
    watcher.on('change', (p) => queueAdd(path.resolve(p), ctx));
    watcher.on('unlink', (p) => {
      handleUnlink(path.resolve(p)).catch((err) => console.warn('[watcher] unlink error:', err.message));
    });
    watcher.on('unlinkDir', (p) => {
      handleUnlinkDir(path.resolve(p)).catch((err) => console.warn('[watcher] unlinkDir error:', err.message));
    });
    watcher.on('error', (err) => console.warn('[watcher] chokidar error:', err.message));
  } catch (err) {
    console.warn('[watcher] chokidar unavailable; watching disabled:', err.message);
    watcher = null;
  }

  return { ready: false };
}

/**
 * Stop the watcher and flush pending timers. Idempotent.
 * @returns {Promise<void>}
 */
export async function stop() {
  if (!started) return;
  started = false;

  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();

  if (watcher && typeof watcher.close === 'function') {
    try {
      await watcher.close();
    } catch (err) {
      console.warn('[watcher] close failed:', err.message);
    }
    watcher = null;
  }
  try {
    await hybridSearch.saveBm25Index(deps.bm25);
  } catch {
    /* best-effort */
  }
  try {
    await saveHashes();
  } catch {
    /* best-effort */
  }
}

/**
 * Force a full reindex: clear indexes, clear hash cache, and rescan.
 * @returns {Promise<void>}
 */
export async function forceReindex() {
  try {
    await deps.vectorStore.reset();
  } catch (err) {
    console.warn('[watcher] vectorStore.reset failed:', err.message);
  }
  if (deps.bm25) {
    try {
      deps.bm25.rebuild([]);
    } catch {
      /* ignore */
    }
  }
  hashes = new Map();
  await saveHashes();
  const cfg = getConfig();
  for (const layerRoot of Object.values(cfg.watched)) {
    if (!fs.existsSync(layerRoot)) continue;
    try {
      const files = await walk(layerRoot, layerRoot);
      for (const absPath of files) {
        const layer = resolveLayer(absPath);
        if (!layer) continue;
        hashes.delete(layer.rel);
        await indexFile(absPath, layer, { onStatus: null, batch: true });
      }
    } catch (err) {
      console.warn('[watcher] force reindex scan failed:', err.message);
    }
  }
  await rebuildBm25();
  await saveHashes();
  state.ragReady = true;
  await emitStatus(null);
}

/**
 * Remove orphaned index entries whose files no longer exist on disk.
 * @returns {Promise<void>}
 */
export async function cleanOrphans() {
  const cfg = getConfig();
  const liveRel = new Set();

  for (const [, layerRoot] of Object.entries(cfg.watched)) {
    if (!fs.existsSync(layerRoot)) continue;
    const files = await walk(layerRoot, layerRoot);
    for (const absPath of files) {
      const rel = relKey(absPath, layerRoot);
      if (rel !== null) liveRel.add(rel);
    }
  }

  // Remove stale BM25 documents for hashed keys that no longer exist.
  const cfgOrder = Object.keys(cfg.watched);
  for (const rel of [...hashes.keys()]) {
    if (!liveRel.has(rel)) {
      // Determine owning layer from the prefix of the stored chunk ids.
      const layer = cfgOrder.find((l) =>
        deps.bm25 && [...deps.bm25.documents.keys()].some((id) => id.startsWith(`${l}:${rel}:`)));
      if (layer) {
        removeBm25ForFile(layer, rel);
        await deps.vectorStore.removeSubtree(layer, `${layer}:${rel}:`);
      }
      hashes.delete(rel);
    }
  }
  await saveHashes();
  await rebuildBm25();
  state.ragReady = true;
}

export default { start, stop, forceReindex, cleanOrphans };
