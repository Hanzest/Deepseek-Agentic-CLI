import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { projectRoot as resolveRoot } from './runtime.js';

/** Dynamic project root helper (honors RAG_ROOT env). */
const getProjectRoot = () => resolveRoot();

/** Path to the RAG config file. */
const configPath = () => path.join(getProjectRoot(), '.rag', 'config.json');

/** Default CPU thread count for watchers, capped to max 2 threads to prevent CPU exhaustion. */
function defaultCpuThreads() {
  return Math.min(2, Math.max(1, os.cpus().length - 1));
}

/**
 * Build the default configuration object.
 * @returns {object} the defaults
 */
function defaultConfig() {
  const root = getProjectRoot();
  const isSandbox = Boolean(process.env.RAG_ROOT && path.isAbsolute(process.env.RAG_ROOT));
  return {
    index: {
      // Bump when watched roots / keying semantics change so stale persisted
      // caches (.rag/hashes.json, .rag/bm25.json) are rebuilt automatically.
      schemaVersion: 3,
    },
    watched: {
      // Each layer maps to an ARRAY of roots (string values are normalized to
      // single-element arrays on load for backward compatibility).
      knowledge: [
        path.join(root, 'knowledge'),
      ],
      workspace: [
        isSandbox ? path.join(root, 'workspace') : process.cwd(),
      ],
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
      // Live watching during chat is disabled by default (active_layers: [])
      // to eliminate CPU spikes, terminal noise, and latency while user is chatting.
      // Changes are synchronized at session-end / exit or via /rag sync.
      active_layers: [],
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
let cachedConfigRoot = null;

/**
 * Clear the in-memory config cache (useful for testing).
 */
export function clearConfigCache() {
  cachedConfig = null;
  cachedConfigRoot = null;
}

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

  // Normalize watched roots to arrays (legacy configs may store single strings).
  for (const [layer, roots] of Object.entries(merged.watched)) {
    merged.watched[layer] = Array.isArray(roots) ? roots : [roots];
  }

  cachedConfig = merged;
  cachedConfigRoot = getProjectRoot();
  return merged;
}

/**
 * Deep-merge `source` into `target` (plain objects merged recursively, primitives overwritten).
 * @param {object} target the destination object
 * @param {object} source the source object with override properties
 * @returns {object} the mutated `target`
 */
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key in target &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Retrieve the current active configuration (cached after first load).
 * @returns {object} the active configuration
 */
export function getConfig() {
  const curRoot = getProjectRoot();
  if (!cachedConfig || cachedConfigRoot !== curRoot) {
    cachedConfig = loadConfig();
    cachedConfigRoot = curRoot;
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
  cachedConfigRoot = getProjectRoot();
  return current;
}

/**
 * Ensure all required RAG directories exist on disk.
 */
export function ensureDirs() {
  const cfg = getConfig();
  const rootDirs = Object.values(cfg.watched ?? {}).flat().filter(Boolean);
  const root = getProjectRoot();
  const dirs = [
    ...rootDirs,
    path.join(root, '.rag'),
    path.join(root, '.rag', 'lancedb'),
    path.join(root, '.rag', 'models'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
