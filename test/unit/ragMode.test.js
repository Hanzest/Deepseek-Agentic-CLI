import { describe, it, expect } from 'vitest';
import { parseRagMode, stripRagTag, resolveRagSearch, RAG_MODES } from '../../lib/ragMode.js';

describe('parseRagMode', () => {
  it('accepts auto/manual/off case-insensitively with surrounding whitespace', () => {
    expect(parseRagMode('auto')).toEqual({ ok: true, mode: 'auto', error: null });
    expect(parseRagMode(' MANUAL ')).toEqual({ ok: true, mode: 'manual', error: null });
    expect(parseRagMode('off')).toEqual({ ok: true, mode: 'off', error: null });
  });

  it('rejects unknown modes with a helpful error', () => {
    const r = parseRagMode('sometimes');
    expect(r.ok).toBe(false);
    expect(r.mode).toBeNull();
    expect(r.error).toContain('Invalid RAG mode');
    expect(r.error).toContain('auto');
  });

  it('exposes the valid mode list', () => {
    expect(RAG_MODES).toEqual(['auto', 'manual', 'off']);
  });
});

describe('stripRagTag', () => {
  it('detects and strips @rag, @rag:keyword, @rag:exact prefixes', () => {
    expect(stripRagTag('@rag how do I deploy?')).toEqual({ text: 'how do I deploy?', tag: 'manual' });
    expect(stripRagTag('@rag:keyword auth api')).toEqual({ text: 'auth api', tag: 'keyword' });
    expect(stripRagTag('@rag:exact timeout policy')).toEqual({ text: 'timeout policy', tag: 'exact' });
  });

  it('leaves untagged text untouched (tag must be a prefix)', () => {
    expect(stripRagTag('plain question')).toEqual({ text: 'plain question', tag: null });
    expect(stripRagTag('a @rag mid-message')).toEqual({ text: 'a @rag mid-message', tag: null });
    expect(stripRagTag('')).toEqual({ text: '', tag: null });
  });
});

describe('resolveRagSearch', () => {
  it('auto mode: enabled, not forced, hybrid search_mode', () => {
    expect(resolveRagSearch({ ragMode: 'auto' })).toEqual({
      enabled: true, force: false, search_mode: 'hybrid',
    });
  });

  it('manual mode without a tag: disabled (no auto invocation)', () => {
    expect(resolveRagSearch({ ragMode: 'manual' })).toEqual({
      enabled: false, force: false, search_mode: 'hybrid',
    });
  });

  it('manual mode with @rag tag: forced hybrid search', () => {
    expect(resolveRagSearch({ ragMode: 'manual', tag: 'manual' })).toEqual({
      enabled: true, force: true, search_mode: 'hybrid',
    });
  });

  it('keyword/exact tags force the keyword fast-path', () => {
    const kw = resolveRagSearch({ ragMode: 'manual', tag: 'keyword' });
    expect(kw.enabled).toBe(true);
    expect(kw.force).toBe(true);
    expect(kw.search_mode).toBe('keyword');

    const ex = resolveRagSearch({ ragMode: 'auto', tag: 'exact' });
    expect(ex.enabled).toBe(true);
    expect(ex.force).toBe(true);
    expect(ex.search_mode).toBe('keyword');
  });

  it('off mode wins even with an explicit tag', () => {
    expect(resolveRagSearch({ ragMode: 'off', tag: 'keyword' })).toEqual({
      enabled: false, force: false, search_mode: 'keyword',
    });
  });

  it('defaults to auto mode when ragMode is missing', () => {
    expect(resolveRagSearch({})).toEqual({ enabled: true, force: false, search_mode: 'hybrid' });
  });
});
