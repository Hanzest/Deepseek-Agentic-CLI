import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Watcher smoke test — validates the T4 lag-fix pipeline end-to-end:
//   1. start() runs the initial scan and indexes a knowledge/ file.
//   2. The shared BM25 index + chunk metadata are persisted to .rag/bm25.json.
//   3. On restart (cache present) the full directory re-scan is SKIPPED
//      (zero vector-store writes) — the CLI boots instantly.
// I/O is stubbed (embedder unavailable, in-memory vector store, no-op chokidar)
// so the test never touches LanceDB, ONNX models, or the real knowledge/ dir.
// ---------------------------------------------------------------------------

/** @type {string} */
let tmpRoot;
/** @type {Array<object>} in-memory chunk store */
let stored = [];

const embedderStub = {
    init: vi.fn(async () => {}),
    isAvailable: vi.fn(() => false),
    embed: vi.fn(async () => []),
};

const vectorStoreStub = {
    init: vi.fn(async () => {}),
    addChunks: vi.fn(async (chunks, vectors) => {
        stored.push(...(chunks || []).map((c, i) => ({ ...c, vector: vectors?.[i] ?? null })));
    }),
    removeByFile: vi.fn(async (p) => {
        stored = stored.filter((c) => c.file_path !== p);
    }),
    removeSubtree: vi.fn(async () => {}),
    getAllChunks: vi.fn(async () => stored),
    getStats: vi.fn(async () => ({ chunkCount: stored.length, tableSizeBytes: 0 })),
    reset: vi.fn(async () => { stored = []; }),
    close: vi.fn(async () => {}),
};

vi.mock('chokidar', () => ({
    watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn(async () => {}) })),
}));

/** Sleep helper (ms). */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll until predicate is truthy or timeout. */
async function waitFor(predicate, timeoutMs = 8000, stepMs = 100) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        if (predicate()) return true;
        await sleep(stepMs);
    }
    return false;
}

beforeEach(async () => {
    stored = [];
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-watch-'));
    process.env.RAG_ROOT = tmpRoot;
    // Fresh module registry per test so watcher/hybridSearch bind to THIS tmpRoot.
    vi.resetModules();
    // The chokidar mock's call history persists across resetModules — clear it
    // so watch-root assertions only see the current test's calls.
    const chokidarModule = await import('chokidar');
    if (chokidarModule?.watch && typeof chokidarModule.watch.mockClear === 'function') {
        chokidarModule.watch.mockClear();
    }
});

afterEach(() => {
    delete process.env.RAG_ROOT;
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('watcher knowledge-only indexing + persistent cache', () => {
    it('indexes a knowledge file, persists .rag/bm25.json, and skips rescan on restart', async () => {
        // Seed one markdown file under knowledge/.
        const knowledgeDir = path.join(tmpRoot, 'knowledge');
        fs.mkdirSync(knowledgeDir, { recursive: true });
        fs.writeFileSync(
            path.join(knowledgeDir, 'sample.md'),
            '# Sample\n\nThe quick brown fox jumps over the lazy dog.\nAuth tokens live in the config.',
            'utf8'
        );

        const bm25Path = path.join(tmpRoot, '.rag', 'bm25.json');

        // ---- First boot: no cache -> full scan -> shared BM25 + save ----
        const { default: watcher } = await import('../../lib/rag/watcher.js');
        const { BM25Index } = await import('../../lib/rag/bm25.js');
        const started = await watcher.start({
            onStatus: null,
            embedderOverride: embedderStub,
            vectorStoreOverride: vectorStoreStub,
        });
        expect(started).toBeTruthy();

        // Wait for the background scan to finish persisting the cache.
        const persisted = await waitFor(() => fs.existsSync(bm25Path));
        expect(persisted).toBe(true);
        await watcher.stop();

        // The persisted cache restores a populated index. The file is the
        // search-cache wrapper: { version, chunkCount, chunks, bm25 } — the
        // BM25 payload lives under `bm25` (same shape hybridSearch restores).
        const raw = JSON.parse(fs.readFileSync(bm25Path, 'utf8'));
        expect(raw.version).toBe(1);
        expect(raw.chunkCount).toBeGreaterThanOrEqual(1);
        const restored = new BM25Index().deserialize(raw.bm25);
        expect(restored.totalDocs).toBeGreaterThanOrEqual(1);
        expect(restored.search('fox').length).toBeGreaterThanOrEqual(1);

        // Chunk metadata (text + file_path) is persisted alongside the BM25 data.
        expect(Array.isArray(raw.chunks)).toBe(true);
        expect(raw.chunks.length).toBeGreaterThanOrEqual(1);
        expect(raw.chunks[0].text).toContain('quick brown fox');
        expect(typeof raw.chunks[0].file_path).toBe('string');

        // ---- Second boot: cache present -> initial scan SKIPPED (0 writes) ----
        vectorStoreStub.addChunks.mockClear();
        const { default: watcher2 } = await import('../../lib/rag/watcher.js');
        await watcher2.start({
            onStatus: null,
            embedderOverride: embedderStub,
            vectorStoreOverride: vectorStoreStub,
        });
        // Give any (incorrect) background scan a chance to run, then assert it did not.
        await sleep(500);
        expect(vectorStoreStub.addChunks).not.toHaveBeenCalled();
        await watcher2.stop();
    });

    it('chokidar watch roots are restricted to knowledge/ only', async () => {
        const { default: watcher } = await import('../../lib/rag/watcher.js');
        await watcher.start({
            onStatus: null,
            embedderOverride: embedderStub,
            vectorStoreOverride: vectorStoreStub,
        });
        await watcher.stop();

        const chokidarMock = await import('chokidar');
        expect(chokidarMock.watch).toHaveBeenCalled();
        const [roots] = chokidarMock.watch.mock.calls[0];
        expect(roots).toHaveLength(1); // only knowledge/
        expect(path.normalize(roots[0])).toBe(path.normalize(path.join(tmpRoot, 'knowledge')));
    });
});
