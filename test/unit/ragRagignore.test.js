import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shouldExclude, isExcluded, loadRagignore } from '../../lib/rag/ragignore.js';

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ragignore-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('shouldExclude built-in patterns', () => {
  it('excludes common machine/build/private paths', () => {
    const excluded = [
      'node_modules/pkg/index.js',
      '.env',
      '.env.local',
      'config.local.env',
      'dist/bundle.js',
      '.git/config',
      '__pycache__/mod.cpython-311.pyc',
      '.rag/config.json',
      'chat_history/thread1.json',
      'artifacts/out.json',
      'test/tmp/generated.json',
    ];
    for (const p of excluded) {
      expect(shouldExclude(p), p).toBe(true);
    }
  });

  it('allows normal source and data files', () => {
    const allowed = ['notes.md', 'config.json', 'sample.py'];
    for (const p of allowed) {
      expect(shouldExclude(p), p).toBe(false);
    }
  });

  it('allows the newly enabled document formats (epub/rtf/html)', () => {
    const allowed = ['book.epub', 'notes.rtf', 'page.html', 'page.htm', 'page.xhtml'];
    for (const p of allowed) {
      expect(shouldExclude(p), p).toBe(false);
    }
  });

  it('rejects an extension not in the allowed whitelist', () => {
    expect(shouldExclude('archive.zip')).toBe(true);
  });

  it('normalizes backslash separators and strip leading ./', () => {
    expect(shouldExclude('node_modules/pkg/index.js')).toBe(true);
    expect(shouldExclude('./notes.md')).toBe(false);
  });
});

describe('loadRagignore / isExcluded layer rules', () => {
  it('loads a .ragignore file seeded over built-ins', () => {
    fs.writeFileSync(path.join(tmpRoot, '.ragignore'), '# generated\n*.secret.md\n', 'utf8');
    const ig = loadRagignore(tmpRoot);
    expect(ig.ignores('notes.secret.md')).toBe(true);
    expect(ig.ignores('notes.md')).toBe(false);
  });

  it('isExcluded honors a layer .ragignore file', () => {
    fs.writeFileSync(path.join(tmpRoot, '.ragignore'), '*.secret.md\n', 'utf8');
    const secret = path.join(tmpRoot, 'notes.secret.md');
    fs.writeFileSync(secret, '# secret\n', 'utf8');
    expect(isExcluded(secret, tmpRoot)).toBe(true);

    const normal = path.join(tmpRoot, 'notes.md');
    fs.writeFileSync(normal, '# normal\n', 'utf8');
    expect(isExcluded(normal, tmpRoot)).toBe(false);
  });
});
