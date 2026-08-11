/**
 * @fileoverview Dense embedding wrapper built on FastEmbed (Qdrant) — ONNX
 * embeddings executed CPU-only, models cached under <root>/.rag/models/fastembed.
 *
 * Model (config.embedding.model): intfloat/multilingual-e5-small (384-dim),
 * INT8-quantized when the installed FastEmbed version supports the quantize flag
 * (per user requirement: the CPU cannot carry the legacy bge stack).
 *
 * Keeps the historical module API — init() / isAvailable() / getDim() / embed() —
 * so lib/rag/index.js, lib/rag/watcher.js and lib/rag/hybridSearch.js are
 * unaffected by the migration.
 *
 * The optional '@fastembed/fastembed' package is imported lazily inside init(),
 * so this module never throws at load time when the dependency (or the network
 * needed to fetch the model) is missing — it degrades to isAvailable() === false,
 * exactly like the old ONNX Runtime wrapper.
 *
 * @module lib/rag/embedder
 */

import path from 'node:path';
import { defaultRoot } from './runtime.js';
import { getConfig } from './config.js';

// Models are shared infrastructure: always from the repo root, never isolated.
// FastEmbed downloads/reads its ONNX artifacts from this cache directory.
const CACHE_DIR_DEFAULT = path.join(defaultRoot(), '.rag', 'models', 'fastembed');

// e5-small hidden size (matches LanceDB VECTOR_DIM = 384 in vectorStore.js).
const DEFAULT_DIM = 384;

/** @type {import('@fastembed/fastembed').TextEmbedding|null} */
let model = null;
let dim = DEFAULT_DIM;
let quantized = false;

/**
 * Lazy-load the FastEmbed module. Never throws.
 * @returns {Promise<{TextEmbedding?: Function}|null>} The module or null.
 */
async function loadFastEmbed() {
  try {
    return await import('@fastembed/fastembed');
  } catch {
    return null;
  }
}

/**
 * Initialize the embedder. Loads the FastEmbed TextEmbedding instance and
 * warms its model cache. Resolves false (with no throw) when the package or
 * model is unavailable.
 *
 * @param {object} [opts] - Initialization options.
 * @param {string|null} [opts.modelPath=null] - Override for the FastEmbed
 *   cache directory (defaults to <root>/.rag/models/fastembed).
 * @param {number|null} [opts.threads=null] - Accepted for API compatibility.
 *   FastEmbed manages its own ONNX Runtime threads internally; the INT8 model
 *   is small enough that explicit thread capping is unnecessary.
 * @returns {Promise<boolean>} True if the embedder is ready.
 */
export async function init({ modelPath = null, threads = null } = {}) {
  if (model) return true;

  const mod = await loadFastEmbed();
  if (!mod || typeof mod.TextEmbedding !== 'function') {
    return false;
  }

  const config = getConfig();
  const modelName = config?.embedding?.model ?? 'intfloat/multilingual-e5-small';
  const wantQuantize = config?.embedding?.quantize !== false;
  const cacheDir = modelPath ? path.resolve(modelPath) : CACHE_DIR_DEFAULT;

  // Try INT8-quantized first (per requirement); fall back to FP32 when the
  // installed FastEmbed version does not support the quantize flag.
  const attempts = wantQuantize ? [true, false] : [false];
  for (const useQuantize of attempts) {
    try {
      const opts = { model: modelName, cacheDir };
      if (useQuantize) opts.quantize = true;
      model = await mod.TextEmbedding.init(opts);
      quantized = useQuantize;
      // Resolve the dimension from the instance when exposed (e5-small = 384).
      if (model && typeof model.getVectorSize === 'function') {
        const d = Number(model.getVectorSize());
        if (Number.isFinite(d) && d > 0) dim = d;
      }
      return true;
    } catch (err) {
      model = null;
      if (!useQuantize) {
        // Last attempt failed — report and degrade gracefully.
        console.warn('[embedder] FastEmbed init failed:', err?.message ?? err);
        return false;
      }
      // Quantized attempt failed (e.g. unsupported flag): retry unquantized.
    }
  }
  return false;
}

/**
 * Check whether the embedder has been successfully initialized and is ready.
 * @returns {boolean} True if ready to embed.
 */
export function isAvailable() {
  return model !== null && typeof model.embed === 'function';
}

/**
 * Get the embedding dimension (384 for intfloat/multilingual-e5-small).
 * @returns {number} The hidden size.
 */
export function getDim() {
  return dim;
}

/**
 * L2-normalize a vector in place and return it. Idempotent — FastEmbed already
 * emits normalized vectors; this guards against provider variance.
 * @param {Float32Array} vector - Vector to normalize.
 * @returns {Float32Array} The same normalized vector.
 */
function l2Normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) {
      vector[i] /= norm;
    }
  }
  return vector;
}

/**
 * Embed a list of text strings into dense vectors.
 * Inputs are batched (FastEmbed handles tokenization + pooling internally),
 * L2-normalized, and returned as Float32Array[] of length `dim`.
 *
 * @param {string[]} texts - Texts to embed.
 * @param {object} [opts] - Runtime options.
 * @param {number} [opts.maxSeqLen=512] - Max sequence length (4 chars/token heuristic).
 * @param {number} [opts.batchSize=32] - Batch size for inference.
 * @returns {Promise<Float32Array[]>} An array of normalized embedding vectors.
 * @throws {Error} If the embedder is not initialized/available or texts are invalid.
 */
export async function embed(texts, opts = {}) {
  const maxSeqLen = opts.maxSeqLen ?? 512;
  const batchSize = opts.batchSize ?? 32;

  if (!isAvailable()) {
    throw new Error(
      'Embedder is not available. Call init() first and ensure the model cache is warmed (npm run setup:rag).',
    );
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('embed() requires a non-empty array of text strings.');
  }

  const result = new Array(texts.length);

  for (let start = 0; start < texts.length; start += batchSize) {
    // Guard the model's 512-token window: ~4 chars/token heuristic truncation.
    const batchTexts = texts.slice(start, start + batchSize)
      .map((t) => (t.length > maxSeqLen * 4 ? t.slice(0, maxSeqLen * 4) : t));

    let vectors;
    try {
      vectors = await model.embed(batchTexts);
    } catch (err) {
      throw new Error(`FastEmbed embed failed: ${err?.message ?? err}`);
    }

    // FastEmbed may return an array or an async/sync iterable.
    const arr = Array.isArray(vectors) ? vectors : Array.from(vectors ?? []);

    for (let i = 0; i < batchTexts.length; i += 1) {
      const raw = arr[i];
      const vec = raw instanceof Float32Array
        ? Float32Array.from(raw)
        : Float32Array.from(raw ?? []);
      result[start + i] = l2Normalize(vec);
    }
  }

  return result;
}
