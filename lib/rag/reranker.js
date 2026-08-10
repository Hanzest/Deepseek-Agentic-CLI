import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Resolve the project root: models are shared from the repo root (see ./runtime.js).
import { defaultRoot } from './runtime.js';

const MODEL_DIR = path.join(defaultRoot(), '.rag', 'models', 'bge-reranker-base');

// Batch size for tokenization/scoring.
const BATCH_SIZE = 8;
const DEFAULT_TOP_N = 10;
const MAX_TOP_N = 10;

let ort = null;          // onnxruntime-node module (lazy)
let tokenizers = null;   // tokenizers module (lazy)
let session = null;      // InferenceSession
let tokenizer = null;    // Tokenizer instance
let hiddenSize = 768;
let ready = false;
let initPromise = null;

/**
 * Resolve model files. If `modelPath` is provided as a directory, look inside it
 * for the standard files; otherwise fall back to the bundled .rag/models path.
 *
 * @param {string|null} modelPath Optional explicit model directory path.
 * @returns {{ onnx: string, tokenizer: string, config: string }|null}
 */
function resolveModelFiles(modelPath = null) {
  let dir = modelPath ? path.resolve(modelPath) : MODEL_DIR;
  const onnx = path.join(dir, 'model_quantized.onnx');
  const tokenizerPath = path.join(dir, 'tokenizer.json');
  const configPath = path.join(dir, 'config.json');

  if (fs.existsSync(onnx) && fs.existsSync(tokenizerPath) && fs.existsSync(configPath)) {
    return { onnx, tokenizer: tokenizerPath, config: configPath };
  }
  return null;
}

/**
 * Initialize the re-ranker. Also populates cached tokenizer/session state.
 * @param {{ modelPath?: string|null, threads?: number|null }} [opts]
 */
export async function init({ modelPath = null, threads = null } = {}) {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const files = resolveModelFiles(modelPath);

    // Graceful: if model files are missing, resolve `false` without throwing.
    if (!files) {
      ready = false;
      return false;
    }

    try {
      // Lazy dynamic imports so module import never throws when deps missing.
      const [ortMod, tokMod] = await Promise.all([
        import('onnxruntime-node'),
        import('tokenizers'),
      ]);
      ort = ortMod.default ?? ortMod;
      tokenizers = tokMod.default ?? tokMod;

      const numThreads = threads ?? Math.max(1, os.cpus().length - 1);
      session = await ort.InferenceSession.create(files.onnx, {
        executionProviders: ['cpu'],
        intraOpNumThreads: numThreads,
      });
      tokenizer = await tokenizers.Tokenizer.fromFile(files.tokenizer);

      // Read hidden_size from config.json if present.
      try {
        const cfg = JSON.parse(fs.readFileSync(files.config, 'utf8'));
        if (cfg && typeof cfg.hidden_size === 'number') hiddenSize = cfg.hidden_size;
      } catch {
        // Fall back to default hidden size.
      }

      ready = true;
      return true;
    } catch {
      // Any init failure degrades gracefully.
      ready = false;
      session = null;
      tokenizer = null;
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
  return ready;
}

/**
 * Embedding/hidden dimension of the model.
 * @returns {number}
 */
export function getDim() {
  return hiddenSize;
}

/**
 * Tokenize a batch of query+doc pairs and return tensor arrays.
 * @param {string} query
 * @param {string[]} docs
 * @returns {{ inputIds: BigInt64Array[], masks: BigInt64Array[], types: BigInt64Array[], sessionInputNames: string[] }|null}
 */
async function buildBatchInputs(query, docs) {
  if (!tokenizer) return null;

  const pairs = docs.map((doc) => query + ' [SEP] ' + doc);
  const encoding = await tokenizer.encodeBatch(pairs);
  const maxLen = encoding.reduce((m, e) => Math.max(m, e.getIds().length), 1);

  const inputIds = [];
  const masks = [];

  for (const e of encoding) {
    const ids = e.getIds();
    const len = ids.length;
    const idsArr = new BigInt64Array(maxLen);
    const maskArr = new BigInt64Array(maxLen);
    for (let i = 0; i < len; i++) idsArr[i] = BigInt(ids[i]);
    for (let i = 0; i < len; i++) maskArr[i] = 1n;
    inputIds.push(idsArr);
    masks.push(maskArr);
  }

  return { inputIds, masks, types: null, sessionInputNames: session.inputNames };
}

/**
 * Build the feed object for the session for a given batch index window.
 * @param {{ inputIds: BigInt64Array[], masks: BigInt64Array[], types: BigInt64Array[], sessionInputNames: string[] }} inputs
 * @param {number} start
 * @param {number} count
 * @returns {Record<string, import('onnxruntime-node').Tensor>|null}
 */
function buildFeed(inputs, start, count) {
  const rows = inputs.inputIds.slice(start, start + count);
  const dims = [rows.length, rows[0].length];
  if (rows.length === 0) return null;

  const inputIdsFlat = new BigInt64Array(rows.length * rows[0].length);
  const masksFlat = new BigInt64Array(rows.length * rows[0].length);
  for (let r = 0; r < rows.length; r++) {
    inputIdsFlat.set(rows[r], r * rows[0].length);
    masksFlat.set(inputs.masks[start + r], r * rows[0].length);
  }

  const feed = {};
  const names = inputs.sessionInputNames;
  for (const name of names) {
    if (name.toLowerCase().includes('token_type') || name.includes('segment')) {
      feed[name] = new ort.Tensor('int64', new BigInt64Array(rows.length * rows[0].length), dims);
    } else if (name.toLowerCase().includes('input_ids') || name.toLowerCase().includes('input')) {
      feed[name] = new ort.Tensor('int64', inputIdsFlat, dims);
    } else if (name.toLowerCase().includes('attention')) {
      feed[name] = new ort.Tensor('int64', masksFlat, dims);
    } else {
      feed[name] = new ort.Tensor('int64', inputIdsFlat, dims);
    }
  }
  return feed;
}

/**
 * Re-rank chunks by cross-encoder relevance to the query.
 * @param {string} query
 * @param {Array} chunks
 * @param {number} [topN=10]
 * @returns {Promise<Array>}
 */
export async function rerank(query, chunks, topN = DEFAULT_TOP_N) {
  if (!ready || !session || !tokenizer) {
    // Graceful degradation: return chunks unchanged with null scores.
    return chunks.map((c) => ({ ...c, rerank_score: null }));
  }

  if (!Array.isArray(chunks) || chunks.length === 0) return chunks;

  const bounded = Math.min(chunks.length, Math.min(topN ?? DEFAULT_TOP_N, MAX_TOP_N));
  const docs = chunks.slice(0, bounded).map((c) => String(c.text ?? c.content ?? ''));

  const inputs = await buildBatchInputs(query, docs);
  if (!inputs) {
    return chunks.map((c) => ({ ...c, rerank_score: null }));
  }

  const scores = new Array(docs.length).fill(0);

  // Score in batches.
  for (let start = 0; start < docs.length; start += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, docs.length - start);
    const feed = buildFeed(inputs, start, count);
    if (!feed) continue;

    try {
      const results = await session.run(feed);
      // Use the first output tensor.
      const outputs = Object.values(results);
      if (outputs.length === 0) continue;
      const data = outputs[0].data;
      for (let i = 0; i < count; i++) {
        scores[start + i] = typeof data[i] === 'number' ? data[i] : Number(data[i]);
      }
    } catch {
      // Scoring failure for this batch: leave scores as 0.
    }
  }

  // Attach scores and sort descending.
  return chunks
    .map((c, i) => ({
      ...c,
      rerank_score: i < scores.length ? scores[i] : null,
    }))
    .sort((a, b) => (b.rerank_score ?? -Infinity) - (a.rerank_score ?? -Infinity));
}
