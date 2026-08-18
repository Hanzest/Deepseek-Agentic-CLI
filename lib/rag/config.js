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
  // In sandbox mode (RAG_ROOT set) the "workspace" layer resolves under the
  // sandbox root so benchmarks/tests never index the real launch directory.
  // In production the workspace layer IS the live project: the directory the
  // user launched the CLI from (process.cwd()).
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
        path.join(projectRoot, 'knowledge'),
      ],
      workspace: [
        isSandbox ? path.join(projectRoot, 'workspace') : process.cwd(),
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
      // Both layers are LIVE-watched. workspace/ = the user's active project
      // (launch CWD) — editing a project file during chat triggers an
      // incremental single-file re-embed (debounced), so changes are searchable
      // ~1s later without any manual /rag reindex.
      active_layers: ['knowledge', 'workspace'],
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

  // Normalize watched roots to arrays (legacy configs may store single strings).
  for (const [layer, roots] of Object.entries(merged.watched)) {
    merged.watched[layer] = Array.isArray(roots) ? roots : [roots];
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
  const rootDirs = Object.values(cfg.watched ?? {}).flat().filter(Boolean);
  const dirs = [
    ...rootDirs,
    path.join(projectRoot, '.rag'),
    path.join(projectRoot, '.rag', 'lancedb'),
    path.join(projectRoot, '.rag', 'models'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
