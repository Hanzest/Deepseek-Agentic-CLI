import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { projectRoot as resolveRoot } from './runtime.js';

/** Project root resolved from this file's location (honors RAG_ROOT env). */
const projectRoot = resolveRoot();

/** Path to the RAG config file. */
const configPath = () => path.join(projectRoot, '.rag', 'config.json');

/** Default CPU thread count for watchers, capped to max 2 threads to prevent CPU exhaustion. */
function defaultCpuThreads() {
  return Math.min(2, Math.max(1, os.cpus().length - 1));
}

/**
 * Build the default configuration object.
 * @returns {object} the defaults
 */
function defaultConfig() {
  return {
    watched: {
      knowledge: path.join(projectRoot, 'knowledge'),
      workspace: path.join(projectRoot, 'workspace'),
    },
    thresholds: {
      min_score: 0.60,
      max_retries: 2,
    },
    hybrid: {
      top_n_candidates: 50,
      rrf_k: 60,
      dense_weight: 0.5,
      sparse_weight: 0.5,
    },
    reranker: {
      // FlashRank (CPU-cheap) — ms-marco-MultiBERT-L-6-v2 multilingual cross-encoder.
      enabled: true,
      top_n: 10,
      model: 'ms-marco-MultiBERT-L-6-v2',
    },
    tokenizer: {
      safety_buffer_ratio: 0.10,
    },
    watcher: {
      debounce_ms: 700,
      cpu_threads: defaultCpuThreads(),
      // Layers with LIVE background watching. workspace/ is intentionally NOT
      // watched: editing workspace files during chat must never trigger ONNX
      // re-embedding. workspace/ is still indexed during the initial scan so
      // existing content remains searchable.
      active_layers: ['knowledge'],
    },
    embedding: {
      // FastEmbed (Qdrant) — intfloat/multilingual-e5-small, INT8-quantized when supported.
      model: 'intfloat/multilingual-e5-small',
      quantize: true,
      max_seq_len: 512,
      batch_size: 32,
    },
  };
}

/** In-memory cache of the resolved config. */
let cachedConfig = null;

/**
 * Load configuration, merging file contents over the defaults.
 * @returns {object} the resolved configuration
 */
export function loadConfig() {
  const merged = defaultConfig();

  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const fileConfig = JSON.parse(raw);
    deepMerge(merged, fileConfig);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  cachedConfig = merged;
  return merged;
}

/**
 * Deep-merge `source` into `target` (plain objects merged recursively, primitives overwritten).
 * @param {object} target the destination object
 * @param {object} source the source object
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
}

/**
 * Return the current configuration, loading it on first access if needed.
 * @returns {object} the resolved configuration
 */
export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Save a config patch to disk, merging it over the current configuration.
 * @param {object} patch the partial config to apply
 * @returns {object} the updated configuration
 */
export function saveConfig(patch) {
  const current = getConfig();
  deepMerge(current, patch);
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(current, null, 2), 'utf8');
  cachedConfig = current;
  return current;
}

/**
 * Ensure all required RAG directories exist on disk.
 */
export function ensureDirs() {
  const cfg = getConfig();
  const dirs = [
    cfg.watched.knowledge,
    cfg.watched.workspace,
    path.join(projectRoot, '.rag'),
    path.join(projectRoot, '.rag', 'lancedb'),
    path.join(projectRoot, '.rag', 'models'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
