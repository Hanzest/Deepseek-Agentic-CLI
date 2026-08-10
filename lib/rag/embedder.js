import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { defaultRoot } from './runtime.js';

const require = createRequire(import.meta.url);

// Models are shared infrastructure: always from the repo root, never isolated.
const MODEL_DIR_DEFAULT = path.join(defaultRoot(), '.rag', 'models', 'bge-small-en-v1.5');

let session = null;
let tokenizer = null;
let config = null;
let dim = 384;
let ortModule = null; // onnxruntime-node module (for Tensor construction)

/**
 * Check whether the embedding model files exist on disk.
 * @param {string} modelDir - Directory containing the model files.
 * @returns {boolean} True if all required files are present.
 */
function modelFilesPresent(modelDir) {
  const required = ['model_quantized.onnx', 'tokenizer.json', 'config.json'];
  return required.every((file) => {
    try {
      require.resolve(path.join(modelDir, file));
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Load the model config.json to determine the embedding dimension.
 * @param {string} modelDir - Directory containing config.json.
 */
function loadConfig(modelDir) {
  try {
    config = require(path.join(modelDir, 'config.json'));
    if (config && typeof config.hidden_size === 'number') {
      dim = config.hidden_size;
    }
  } catch {
    config = null;
  }
}

/**
 * Initialize the embedder. Loads ONNX runtime session and Hugging Face tokenizer lazily.
 * Resolves false (with no throw) if model files are missing or loading fails.
 *
 * @param {object} [opts] - Initialization options.
 * @param {string|null} [opts.modelPath=null] - Path to the model directory. Defaults to the bundled bge-small-en-v1.5.
 * @param {number} [opts.maxSeqLen=512] - Maximum sequence length for tokenization/truncation.
 * @param {number} [opts.batchSize=32] - Batch size for inference.
 * @param {number|null} [opts.threads=null] - Number of intra-op threads. Defaults to CPU count - 1.
 * @returns {Promise<boolean>} True if the embedder is ready.
 */
export async function init({
  modelPath = null,
  threads = null,
} = {}) {
  if (session && tokenizer) {
    return true;
  }

  const modelDir = modelPath || MODEL_DIR_DEFAULT;

  if (!modelFilesPresent(modelDir)) {
    return false;
  }

  try {
    loadConfig(modelDir);

    const [ort, { Tokenizer }] = await Promise.all([
      import('onnxruntime-node'),
      import('tokenizers'),
    ]);
    ortModule = ort;

    const sessionOptions = {
      executionProviders: ['cpu'],
      intraOpNumThreads: threads ?? Math.max(1, os.cpus().length - 1),
    };

    session = await ort.InferenceSession.create(
      path.join(modelDir, 'model_quantized.onnx'),
      sessionOptions,
    );

    tokenizer = await Tokenizer.fromFile(path.join(modelDir, 'tokenizer.json'));

    return true;
  } catch {
    session = null;
    tokenizer = null;
    return false;
  }
}

/**
 * Check whether the embedder has been successfully initialized and is ready.
 * @returns {boolean} True if ready to embed.
 */
export function isAvailable() {
  return session !== null && tokenizer !== null;
}

/**
 * Get the embedding dimension.
 * @returns {number} The hidden size (384 for bge-small-en-v1.5) or the loaded config value.
 */
export function getDim() {
  return dim;
}

/**
 * Mean-pool a batch of last_hidden_state tensors along the sequence dimension,
 * weighting by the attention mask, over raw Float32 outputs.
 * @param {Float32Array} lastHiddenState - Flattened [batch, seq, hidden] logits.
 * @param {Float32Array} mask - Flattened [batch, seq] attention mask (0/1 values).
 * @param {number} batchSize - Number of sequences in the batch.
 * @param {number} seqLen - Sequence length.
 * @param {number} hiddenSize - Hidden dimension.
 * @returns {Float32Array[]} Mean-pooled, not yet normalized vectors.
 */
function meanPool(lastHiddenState, mask, batchSize, seqLen, hiddenSize) {
  const vectors = [];
  for (let b = 0; b < batchSize; b += 1) {
    const pooled = new Float32Array(hiddenSize);
    let maskSum = 0;
    for (let s = 0; s < seqLen; s += 1) {
      const m = mask[b * seqLen + s];
      if (m === 0) continue;
      maskSum += m;
      const offset = (b * seqLen + s) * hiddenSize;
      for (let h = 0; h < hiddenSize; h += 1) {
        pooled[h] += lastHiddenState[offset + h];
      }
    }
    if (maskSum > 0) {
      for (let h = 0; h < hiddenSize; h += 1) {
        pooled[h] /= maskSum;
      }
    }
    vectors.push(pooled);
  }
  return vectors;
}

/**
 * L2-normalize a vector in place and return it.
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
 * Inputs are tokenized in batches, mean-pooled over the attention mask, and L2-normalized.
 *
 * @param {string[]} texts - Texts to embed.
 * @param {object} [opts] - Runtime options (overrides init-time maxSeqLen/batchSize).
 * @returns {Promise<Float32Array[]>} An array of normalized embedding vectors.
 * @throws {Error} If the embedder is not initialized/available or texts are invalid.
 */
export async function embed(texts, opts = {}) {
  const maxSeqLen = opts.maxSeqLen ?? 512;
  const batchSize = opts.batchSize ?? 32;

  if (!isAvailable()) {
    throw new Error(
      'Embedder is not available. Call init() first and ensure the model files are present.',
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
    const actualBatch = batchTexts.length;

    // Tokenize the batch (tokenizers 0.13.x returns a Promise).
    const encoding = await tokenizer.encodeBatch(batchTexts);

    const seqLen = encoding[0].getAttentionMask().length;
    const inputIds = new BigInt64Array(actualBatch * seqLen);
    const attentionMask = new BigInt64Array(actualBatch * seqLen);

    for (let b = 0; b < actualBatch; b += 1) {
      const ids = encoding[b].getIds();
      const mask = encoding[b].getAttentionMask();
      const offset = b * seqLen;
      for (let i = 0; i < seqLen; i += 1) {
        inputIds[offset + i] = BigInt(ids[i] ?? 0);
        attentionMask[offset + i] = BigInt(mask[i] ?? 0);
      }
    }

    const feeds = {
      input_ids: new ortModule.Tensor('int64', inputIds, [actualBatch, seqLen]),
      attention_mask: new ortModule.Tensor('int64', attentionMask, [actualBatch, seqLen]),
    };
    // bge-small-en-v1.5 also expects token_type_ids (zeros).
    if (session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = new ortModule.Tensor(
        'int64',
        new BigInt64Array(actualBatch * seqLen),
        [actualBatch, seqLen],
      );
    }

    const outputs = await session.run(feeds);

    const hiddenKey = Object.keys(outputs).find(
      (k) => k === 'last_hidden_state' || k === 'hidden_states',
    ) ?? Object.keys(outputs)[0];

    const tensor = outputs[hiddenKey];
    const hiddenData = tensor.data;
    const hiddenDims = tensor.dims;

    const hiddenSeqLen = hiddenDims[1];
    const hiddenSizeActual = hiddenDims[2];

    // Convert flattened BigInt64Array/NumberArray from ONNX to Float32 for pooling.
    const lastHidden = new Float32Array(actualBatch * hiddenSeqLen * hiddenSizeActual);
    for (let i = 0; i < lastHidden.length; i += 1) {
      lastHidden[i] = Number(hiddenData[i]);
    }

    const maskFloat = new Float32Array(actualBatch * seqLen);
    for (let i = 0; i < maskFloat.length; i += 1) {
      maskFloat[i] = Number(attentionMask[i]);
    }

    const pooled = meanPool(lastHidden, maskFloat, actualBatch, hiddenSeqLen, hiddenSizeActual);

    for (let b = 0; b < actualBatch; b += 1) {
      result[start + b] = l2Normalize(pooled[b]);
    }
  }

  return result;
}
