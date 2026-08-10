import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { detectLanguage, lineMap, lineFromOffset, buildId, extractMetadata } from '../../lib/rag/metadata.js';

describe('detectLanguage', () => {
  it('maps known extensions to canonical identifiers', () => {
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('app.ts')).toBe('typescript');
    expect(detectLanguage('app.js')).toBe('javascript');
    expect(detectLanguage('main.go')).toBe('go');
    expect(detectLanguage('util.cpp')).toBe('cpp');
    expect(detectLanguage('util.cc')).toBe('cpp');
    expect(detectLanguage('util.h')).toBe('cpp');
    expect(detectLanguage('util.hpp')).toBe('cpp');
    expect(detectLanguage('README.md')).toBe('markdown');
    expect(detectLanguage('data.json')).toBe('json');
    expect(detectLanguage('config.yaml')).toBe('yaml');
    expect(detectLanguage('config.yml')).toBe('yaml');
    expect(detectLanguage('app.log')).toBe('log');
    expect(detectLanguage('notes.txt')).toBe('text');
    expect(detectLanguage('doc.pdf')).toBe('text');
    expect(detectLanguage('doc.docx')).toBe('text');
  });

  it('return null for unknown extensions', () => {
    expect(detectLanguage('archive.zip')).toBeNull();
  });
});

describe('lineMap / lineFromOffset', () => {
  it('lineMap begins at offset 0 on line 1 and records newline boundaries', () => {
    const map = lineMap('ab\ncd\nef');
    expect(map[0]).toEqual({ offset: 0, line: 1 });
    expect(map[1]).toEqual({ offset: 3, line: 2 });
    expect(map[2]).toEqual({ offset: 6, line: 3 });
  });

  it('lineFromOffset resolves a char offset to a 1-based line', () => {
    const map = lineMap('ab\ncd\nef');
    expect(lineFromOffset(map, 0)).toBe(1);
    expect(lineFromOffset(map, 2)).toBe(1);
    expect(lineFromOffset(map, 3)).toBe(2);
    expect(lineFromOffset(map, 5)).toBe(2);
    expect(lineFromOffset(map, 6)).toBe(3);
    expect(lineFromOffset(map, 7)).toBe(3);
  });
});

describe('buildId', () => {
  it('is stable for identical inputs and differs across spans', () => {
    expect(buildId('/a/b.md', 1, 10)).toBe(buildId('/a/b.md', 1, 10));
    expect(buildId('/a/b.md', 1, 10)).not.toBe(buildId('/a/b.md', 2, 10));
    expect(buildId('/a/b.md', 1, 10)).not.toBe(buildId('/a/c.md', 1, 10));
  });

  it('returns a sha1 hex digest of fixed length', () => {
    expect(buildId('x', 1, 2)).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('extractMetadata', () => {
  it('returns canonical chunk shape with absolute file_path', () => {
    const layerRoot = '/layers/knowledge';
    const src = path.resolve('/layers/knowledge/sub/docs/guide.md');
    const meta = extractMetadata({
      filePath: src,
      layer: 'knowledge',
      text: 'body',
      lineStart: 2,
      lineEnd: 9,
      sectionHeaders: ['Intro', 'Details'],
      language: 'markdown',
      tags: ['guide'],
      fileHash: 'abc123',
      layerRoot,
    });

    expect(meta.id).toBe(buildId(src, 2, 9));
    expect(meta.layer).toBe('knowledge');
    expect(meta.namespace).toBe('sub/docs');
    expect(meta.file_path).toBe(path.resolve(src));
    expect(meta.line_start).toBe(2);
    expect(meta.line_end).toBe(9);
    expect(meta.section_headers).toEqual(['Intro', 'Details']);
    expect(meta.language).toBe('markdown');
    expect(meta.tags).toEqual(['guide']);
    expect(meta.text).toBe('body');
    expect(meta.file_hash).toBe('abc123');
    expect(typeof meta.timestamp).toBe('number');
  });

  it('computes namespace relative to layerRoot and empty when at root', () => {
    const filePath = path.resolve('/layers/workspace/es/notes.md');
    expect(
      extractMetadata({ filePath, layerRoot: '/layers/workspace', text: 'x', lineStart: 1, lineEnd: 1 })
        .namespace
    ).toBe('es');

    const atRoot = path.resolve('/layers/workspace/notes.md');
    expect(
      extractMetadata({ filePath: atRoot, layerRoot: '/layers/workspace', text: 'x', lineStart: 1, lineEnd: 1 })
        .namespace
    ).toBe('');
  });
});
