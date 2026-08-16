/**
 * Central project-root resolution for the RAG subsystem.
 *
 * Defaults to the repository root (two levels up from lib/rag). When the
 * `RAG_ROOT` environment variable is set to an absolute path, ALL RAG runtime
 * data (knowledge/, workspace/, .rag/) resolves under that root instead —
 * used by benchmarks and sandboxed experiments so they never touch the user's
 * real index or folders.
 *
 * @module lib/rag/runtime
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default root: <repo>/ (lib/rag -> up two levels). */
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Resolve the active RAG root directory (data: knowledge/, workspace/, .rag/).
 * Honors process.env.RAG_ROOT when set & absolute.
 * @returns {string} Absolute root.
 */
export function projectRoot() {
  const env = process.env.RAG_ROOT;
  if (env && path.isAbsolute(env)) {
    return path.resolve(env);
  }
  return DEFAULT_ROOT;
}

/**
 * Resolve the repository root (models + shared infrastructure always live here,
 * even when RAG_ROOT isolates the data folders).
 * @returns {string} Absolute repo root.
 */
export function defaultRoot() {
  return DEFAULT_ROOT;
}
