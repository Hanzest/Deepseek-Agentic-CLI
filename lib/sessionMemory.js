/**
 * @fileoverview Session file-memory registry — remembers which files the agent
 * has READ during the current session so the model can recognize already-loaded
 * content and avoid re-reading full files across turns (token savings).
 *
 * - `recordRead(absPath, info)` — called after every successful read_file_chunk.
 * - `invalidate(absPath)` — called when a mutation tool writes/patches a file.
 * - `getPromptBlock()` — compact markdown injected into the system context.
 * - `reset()` — called on a fresh conversation (/new, /load).
 *
 * Module-level singleton (like the read cache) so both the orchestrator and the
 * batch tool executor can share it without threading context.
 *
 * @module lib/sessionMemory
 */

/** Cap on tracked files (LRU by insertion order). */
const MAX_ENTRIES = 200;

/** @type {Map<string, {mtimeMs:number, lines:number, summary:string}>} */
const readFiles = new Map();

/** Normalize a path for use as a map key. */
function keyOf(absPath) {
  return String(absPath).replace(/\\/g, '/');
}

/**
 * Record that a file was read this session.
 * @param {string} absPath - Absolute file path.
 * @param {{mtimeMs?:number, lines?:number, summary?:string}} [info] - Metadata.
 */
export function recordRead(absPath, info = {}) {
  const key = keyOf(absPath);
  readFiles.set(key, {
    mtimeMs: Number(info.mtimeMs) || 0,
    lines: Number(info.lines) || 0,
    summary: String(info.summary || '').slice(0, 120),
  });
  if (readFiles.size > MAX_ENTRIES) {
    const oldest = readFiles.keys().next().value;
    if (oldest !== undefined) readFiles.delete(oldest);
  }
}

/**
 * Drop a file from the registry (after a mutation touched it).
 * @param {string} absPath - Absolute file path.
 */
export function invalidate(absPath) {
  readFiles.delete(keyOf(absPath));
}

/** Clear the registry entirely (fresh conversation). */
export function reset() {
  readFiles.clear();
}

/** @returns {number} Number of tracked files. */
export function size() {
  return readFiles.size;
}

/**
 * Build the compact markdown block injected into the model context.
 * @returns {string} Empty string when nothing was read.
 */
export function getPromptBlock() {
  if (readFiles.size === 0) return '';
  const lines = [
    '## Files Read This Session (already loaded — reuse this; avoid re-reading full files)',
  ];
  for (const [p, info] of readFiles) {
    lines.push(
      `- ${p} (${info.lines} lines)${info.summary ? ` — ${info.summary}` : ''}`
    );
  }
  return lines.join('\n');
}

export default { recordRead, invalidate, reset, size, getPromptBlock };
