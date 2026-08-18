import { describe, it, expect, beforeEach } from 'vitest';
import { recordRead, invalidate, reset, size, getPromptBlock } from '../../lib/sessionMemory.js';

describe('sessionMemory file registry', () => {
  beforeEach(() => {
    reset();
  });

  it('starts empty', () => {
    expect(size()).toBe(0);
    expect(getPromptBlock()).toBe('');
  });

  it('records reads and emits a compact prompt block', () => {
    recordRead('C:/proj/notes.md', { mtimeMs: 123, lines: 40, summary: '# Heading' });
    recordRead('C:/proj/src/app.js', { mtimeMs: 456, lines: 120, summary: 'import x' });

    expect(size()).toBe(2);
    const block = getPromptBlock();
    expect(block).toContain('Files Read This Session');
    expect(block).toContain('C:/proj/notes.md (40 lines)');
    expect(block).toContain('— # Heading');
    expect(block).toContain('C:/proj/src/app.js (120 lines)');
  });

  it('normalizes backslash paths to forward slashes', () => {
    recordRead('C:\\proj\\win.md', { lines: 5 });
    expect(getPromptBlock()).toContain('C:/proj/win.md');
  });

  it('invalidate removes a single entry (after mutation)', () => {
    recordRead('C:/proj/a.md', { lines: 5 });
    recordRead('C:/proj/b.md', { lines: 5 });
    invalidate('C:/proj/a.md');
    expect(size()).toBe(1);
    expect(getPromptBlock()).not.toContain('a.md');
    expect(getPromptBlock()).toContain('b.md');
  });

  it('evicts the oldest entry past the LRU cap (200)', () => {
    for (let i = 0; i < 205; i += 1) {
      recordRead(`C:/proj/f${i}.md`, { lines: 1 });
    }
    expect(size()).toBe(200);
    const block = getPromptBlock();
    expect(block).not.toContain('f0.md');
    expect(block).toContain('f204.md');
  });

  it('truncates summaries to 120 chars', () => {
    recordRead('C:/proj/long.md', { lines: 1, summary: 'x'.repeat(500) });
    expect(getPromptBlock()).toContain('x'.repeat(120));
    expect(getPromptBlock()).not.toContain('x'.repeat(121));
  });

  it('reset clears the registry', () => {
    recordRead('C:/proj/a.md', { lines: 1 });
    reset();
    expect(size()).toBe(0);
    expect(getPromptBlock()).toBe('');
  });
});
