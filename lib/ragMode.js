/**
 * @fileoverview RAG mode + intent-tag helpers (pure functions, unit-testable).
 *
 * RAG mode (per session):
 *   - 'auto'   (default) — rag_search tool available; the LLM decides when to use it.
 *   - 'manual' — rag_search only runs when the user explicitly tags `@rag` / `@rag:keyword`.
 *   - 'off'    — rag_search fully bypassed (tool removed from the model's tool list).
 *
 * Intent tags (prefix on the user message, stripped before reaching the model):
 *   - `@rag`           -> force a RAG search (hybrid mode) in manual mode.
 *   - `@rag:keyword`   -> force a keyword-only fast-path search (no embedding model).
 *
 * @module lib/ragMode
 */

/** Valid session RAG modes. */
export const RAG_MODES = Object.freeze(['auto', 'manual', 'off']);

/**
 * Normalize + validate a RAG mode string.
 * @param {string} input - Raw user input (e.g. " manual ").
 * @returns {{ok: boolean, mode: string|null, error: string|null}}
 */
export function parseRagMode(input) {
  const mode = String(input ?? '').trim().toLowerCase();
  if (RAG_MODES.includes(mode)) return { ok: true, mode, error: null };
  return {
    ok: false,
    mode: null,
    error: `Invalid RAG mode "${mode}". Use one of: ${RAG_MODES.join(' | ')}`,
  };
}

const TAG_RE = /^\s*@rag(?::(keyword))?(?=\s|$)/i;

/**
 * Strip a leading `@rag` / `@rag:keyword` tag from user text.
 * @param {string} text - Raw user message.
 * @returns {{text: string, tag: string|null}} Cleaned text + detected tag
 *   ('manual' | 'keyword' | null).
 */
export function stripRagTag(text) {
  const input = String(text ?? '');
  const m = TAG_RE.exec(input);
  if (!m) return { text: input, tag: null };
  const sub = m[1] ? m[1].toLowerCase() : 'manual';
  const remainder = input.slice(m[0].length).trim();
  return { text: remainder, tag: sub };
}

/**
 * Resolve whether / how a RAG search should run for the current turn.
 * @param {object} params
 * @param {string} [params.ragMode='auto'] - Session RAG mode.
 * @param {string|null} [params.tag=null] - Detected intent tag (see stripRagTag).
 * @returns {{enabled: boolean, force: boolean, search_mode: 'hybrid'|'keyword'}}
 */
export function resolveRagSearch({ ragMode = 'auto', tag = null } = {}) {
  const mode = String(ragMode ?? 'auto').toLowerCase();

  // 'off' always wins — even an explicit @rag tag is ignored (user sees a notice).
  if (mode === 'off') return { enabled: false, force: false, search_mode: 'keyword' };

  const tagged = tag === 'keyword' || tag === 'manual';

  // Explicit tag => deterministic, forced execution.
  if (tagged) {
    const search_mode = tag === 'keyword' ? 'keyword' : 'hybrid';
    return { enabled: true, force: true, search_mode };
  }

  // No tag: policy driven by the session mode.
  if (mode === 'manual') return { enabled: false, force: false, search_mode: 'hybrid' };
  // 'auto' (default): tool stays available; the LLM decides (force=false).
  return { enabled: true, force: false, search_mode: 'hybrid' };
}
