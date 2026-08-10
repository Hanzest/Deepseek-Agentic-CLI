import { describe, it, expect } from 'vitest';
import { BM25Index, tokenize, stopwords } from '../../lib/rag/bm25.js';

describe('tokenize', () => {
  it('lowercases, strips punctuation, drops single-char tokens, and filters stopwords', () => {
    expect(tokenize('The Quick brown-fox! jumps OVER 42')).toEqual(['quick', 'brown', 'fox', 'jumps', 'over', '42']);
  });

  it('keeps stopwords when useStopwords is false', () => {
    expect(tokenize('the cat and dog', { useStopwords: false })).toEqual(['the', 'cat', 'and', 'dog']);
  });

  it('returns [] for empty or non-string input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });

  it('exposes the default stopword set', () => {
    expect(stopwords.has('the')).toBe(true);
    expect(stopwords.has('and')).toBe(true);
  });
});

function build() {
  return new BM25Index();
}

describe('BM25Index ranking', () => {

  it('returns deterministic desc-by-score results', () => {
    const index = build().init([
      { id: 'a', text: 'the quick brown fox jumps' },
      { id: 'b', text: 'quick red fox runs fast' },
      { id: 'c', text: 'slow green turtle walks' },
    ]);
    const r1 = index.search('quick fox');
    const r2 = index.search('quick fox');
    expect(r1).toEqual(r2);
    expect(r1[0].score).toBeGreaterThanOrEqual(r1[r1.length - 1].score);
  });

  it('ranks higher tf on a shorter doc above a longer doc', () => {
    const index = build().init([
      { id: 'short', text: 'apple apple apple juice' },
      { id: 'long', text: 'apple orchard and apples in a big basket full of many different fruits' },
    ]);
    const results = index.search('apple');
    expect(results[0].id).toBe('short');
  });

  it('prefers the shorter doc when term frequency is equal', () => {
    const index = build().init([
      { id: 'd1', text: 'retrieval plus a great deal of additional filler words here to pad' },
      { id: 'd2', text: 'retrieval' },
    ]);
    const results = index.search('retrieval');
    expect(results[0].id).toBe('d2');
  });

  it('respects the limit option', () => {
    const index = build().init([
      { id: 'a', text: 'one two three four' },
      { id: 'b', text: 'one two' },
      { id: 'c', text: 'one' },
    ]);
    expect(index.search('one', { limit: 2 })).toHaveLength(2);
  });
});

describe('BM25Index document lifecycle', () => {
  it('removeDocument drops the doc from results', () => {
    const index = build().init([
      { id: 'a', text: 'uniqueterm alpha' },
      { id: 'b', text: 'uniqueterm beta' },
    ]);
    expect(index.removeDocument('a')).toBe(true);
    expect(index.removeDocument('a')).toBe(false); // already gone
    const results = index.search('uniqueterm');
    expect(results.map((r) => r.id)).toEqual(['b']);
  });

  it('init and rebuild replace prior index contents', () => {
    const index = build()
      .addDocument('x', 'hello world')
      .addDocument('y', 'hello there');
    index.rebuild([{ id: 'z', text: 'completely different topic' }]);
    expect(index.search('hello')).toEqual([]);
    expect(index.search('different')[0].id).toBe('z');
  });

  it('skips entries without a valid id during rebuild', () => {
    const index = build().rebuild([
      { id: 'a', text: 'keep me' },
      { id: null, text: 'drop me' },
      { id: undefined, text: 'drop me too' },
      {},
    ]);
    expect(index.search('keep')[0].id).toBe('a');
    expect(index.search('drop')).toEqual([]);
  });

  it('addDocument replaces an existing id rather than duplicating it', () => {
    const index = build().addDocument('a', 'alpha beta');
    index.addDocument('a', 'gamma delta');
    expect(index.totalDocs).toBe(1);
    expect(index.search('alpha')).toEqual([]);
    expect(index.search('gamma')[0].id).toBe('a');
  });

  it('search returns [] on an empty index or empty query features', () => {
    const index = build();
    expect(index.search('anything')).toEqual([]);
  });
});
