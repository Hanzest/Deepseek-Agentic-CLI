import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chunkText, chunkTextAsync, cosineSim } from '../../lib/rag/chunker.js';

const mdPath = path.resolve(__dirname, '../fixtures/rag/sample.md');
const mdText = fs.readFileSync(mdPath, 'utf8');
const pyPath = path.resolve(__dirname, '../fixtures/rag/sample.py');

function makeLongParas() {
  // Two paragraphs long enough that combined they exceed the 1000-char target,
  // forcing the second chunk to carry the overlap tail of the first.
  const a = Array(70).fill('alpha bravo charlie delta').join(' ');
  const b = Array(70).fill('echo foxtrot golf hotel').join(' ');
  return `${a}\n\n${b}`;
}

describe('chunkText canonical chunks', () => {
  it('produces canonical chunks with line_start/line_end from markdown', () => {
    const chunks = chunkText(mdText, { filePath: mdPath, language: 'markdown' });
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.id).toBeTruthy();
      expect(c.file_path).toBe(mdPath);
      expect(typeof c.line_start).toBe('number');
      expect(typeof c.line_end).toBe('number');
      expect(c.line_start).toBeGreaterThanOrEqual(1);
      expect(c.line_end).toBeGreaterThanOrEqual(c.line_start);
      expect(Array.isArray(c.section_headers)).toBe(true);
      expect(Array.isArray(c.tags)).toBe(true);
    }
  });

  it('tracks H1/H2 section headers', () => {
    const chunks = chunkText(mdText, { filePath: mdPath, language: 'markdown' });
    // The H2 Architecture section carries the H1 ancestor in its header stack.
    const arch = chunks.find((c) => (c.section_headers || []).includes('Architecture'));
    expect(arch).toBeTruthy();
    // The H1 ancestor is stored as an object in the heading stack.
    expect(arch.section_headers).toContainEqual({ level: 1, title: 'Project Overview' });
    expect(arch.section_headers).toContain('Architecture');
  });

  it('extracts tags from #tag and [tag] tokens', () => {
    const chunks = chunkText(mdText, { filePath: mdPath, language: 'markdown' });
    const overview = chunks.find((c) => (c.section_headers || []).includes('Project Overview'));
    expect(overview).toBeTruthy();
    expect(overview.tags).toContain('tag');
    expect(overview.tags).toContain('overview');
  });

  it('returns [] for empty or missing input', () => {
    expect(chunkText('', { filePath: mdPath })).toEqual([]);
    expect(chunkText('   \n  ', { filePath: mdPath })).toEqual([]);
  });
});

describe('chunkText overlap', () => {
  it('carries the overlap tail into the second chunk', () => {
    const text = makeLongParas();
    const chunks = chunkText(text, { filePath: mdPath, language: 'markdown' });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const first = chunks[0].text;
    const tail = first.slice(-120);
    expect(chunks[1].text).toContain(tail);
  });
});

describe('semantic segmentation', () => {
  it('splits a heading-less doc via a synchronous embedFn', () => {
    let idx = 0;
    const embedFn = () => {
      const vec = [0, 0, 0];
      vec[idx % 3] = 1;
      idx += 1;
      return vec;
    };
    // Each paragraph exceeds the chunk target so each semantic segment becomes
    // its own chunk, proving the heading-less semantic split took effect.
    const p = (word) => `${word} `.repeat(220).trim();
    const text = [p('alpha'), p('bravo'), p('charlie')].join('\n\n');
    const chunks = chunkText(text, { filePath: mdPath, embedFn });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  it('chunkTextAsync accepts a Promise-returning embedFn through the async entry point', async () => {
    const embedFn = async (s) => {
      void s;
      return [0.5, 0.5];
    };
    const text = '# Heading\n\nTopic paragraph one here.\n\nTopic paragraph two here.\n\nTopic paragraph three here.';
    const chunks = await chunkTextAsync(text, { filePath: mdPath, embedFn });
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of chunks) {
      expect(c.section_headers).toContain('Heading');
    }
  });
});

describe('cosineSim', () => {
  it('returns 1 for identical vectors and 0 for orthogonal/empty', () => {
    expect(cosineSim([1, 0], [1, 0])).toBe(1);
    expect(cosineSim([1, 0], [0, 1])).toBe(0);
    expect(cosineSim([], [])).toBe(0);
    expect(cosineSim([1, 2], [1, 2, 3])).toBe(0);
  });
});
