import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, getConfig, saveConfig, ensureDirs } from '../../lib/rag/config.js';

// config.js resolves projectRoot via lib/rag/.. so the on-disk config lives at
// <projectRoot>/.rag/config.json. We back up and restore ONLY config.json around
// tests — never the whole .rag dir, which also holds downloaded models/
// (310MB+) and the LanceDB index that must be preserved across test runs.
const projectRoot = path.resolve(__dirname, '..', '..');
const ragDir = path.join(projectRoot, '.rag');
const configFile = path.join(ragDir, 'config.json');

let originalConfig = null;

beforeEach(() => {
  if (fs.existsSync(configFile)) {
    originalConfig = fs.readFileSync(configFile, 'utf8');
    fs.rmSync(configFile, { force: true });
  } else {
    originalConfig = null;
  }
});

afterEach(() => {
  fs.rmSync(configFile, { force: true }); // remove test-written config only
  if (originalConfig !== null) {
    fs.mkdirSync(ragDir, { recursive: true });
    fs.writeFileSync(configFile, originalConfig, 'utf8');
  }
});

describe('rag config defaults', () => {
  it('loadConfig returns documented defaults when no config file exists', () => {
    const cfg = loadConfig();
    expect(cfg.thresholds.min_score).toBe(0.6);
    expect(cfg.thresholds.max_retries).toBe(2);
    expect(cfg.tokenizer.safety_buffer_ratio).toBe(0.1);
    expect(cfg.watcher.debounce_ms).toBe(700);
  });

  it('loadConfig merges on-disk JSON over the defaults', () => {
    fs.mkdirSync(ragDir, { recursive: true });
    fs.writeFileSync(configFile, JSON.stringify({ thresholds: { min_score: 0.75 } }), 'utf8');
    const cfg = loadConfig();
    // Overridden by the on-disk file.
    expect(cfg.thresholds.min_score).toBe(0.75);
    // Defaults untouched by the partial file remain intact.
    expect(cfg.thresholds.max_retries).toBe(2);
    expect(cfg.tokenizer.safety_buffer_ratio).toBe(0.1);
    expect(cfg.watcher.debounce_ms).toBe(700);
  });
});

describe('rag saveConfig', () => {
  it('persists a patch to disk and returns the merged config', () => {
    const merged = saveConfig({ thresholds: { min_score: 0.8 } });
    expect(merged.thresholds.min_score).toBe(0.8);
    expect(fs.existsSync(configFile)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    expect(onDisk.thresholds.min_score).toBe(0.8);
  });
});

describe('rag getConfig / ensureDirs', () => {
  it('getConfig returns the cached configuration', () => {
    const a = getConfig();
    const b = getConfig();
    expect(a).toBe(b);
  });

  it('ensureDirs does not throw and creates the .rag directory', () => {
    expect(() => ensureDirs()).not.toThrow();
    expect(fs.existsSync(ragDir)).toBe(true);
    // The knowledge/workspace watcher dirs as well as lancedb/models.
    const cfg = loadConfig();
    expect(fs.existsSync(cfg.watched.knowledge)).toBe(true);
    expect(fs.existsSync(cfg.watched.workspace)).toBe(true);
    expect(fs.existsSync(path.join(ragDir, 'lancedb'))).toBe(true);
    expect(fs.existsSync(path.join(ragDir, 'models'))).toBe(true);
  });
});
