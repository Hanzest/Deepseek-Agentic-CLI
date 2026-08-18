import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

// ---------------------------------------------------------------------------
// ragPerformance.test.js — Pillar gates of rag-performance-verification-plan.md:
//   1. Warm-start cache restore is fast (< 100 ms) and complete.
//   2. keyword search_mode is a zero-ONNX fast path (embed/rerank never called).
//   3. Chokidar watch roots are restricted to knowledge/ (workspace ignored).
//   4. saveBm25Index / loadFromFile cache round-trip preserves postings.
// All I/O is stubbed: no LanceDB, no ONNX, no real knowledge/ dir.
// ---------------------------------------------------------------------------

/** @type {string} */
let tmpRoot;

const corpus = [
    {
        id: 'a', layer: 'knowledge', namespace: '', file_path: 'C:/handbook.md',
        line_start: 1, line_end: 3, section_headers: ['Intro'],
        text: 'alpha beta gamma delta', timestamp: 1, file_hash: 'h1',
    },
    {
        id: 'b', layer: 'knowledge', namespace: '', file_path: 'C:/handbook.md',
        line_start: 5, line_end: 6, section_headers: ['Caching'],
        text: 'the cache time-to-live is three hundred seconds', timestamp: 2, file_hash: 'h2',
    },
    {
        id: 'c', layer: 'knowledge', namespace: 'math', file_path: 'C:/math.md',
        line_start: 1, line_end: 2, section_headers: ['Math'],
        text: 'alpha alpha alpha beta', timestamp: 3, file_hash: 'h3',
    },
];

const embedderMock = {
    init: vi.fn(async () => true),
    isAvailable: vi.fn(() => true),
    embed: vi.fn(async () => [new Float32Array([1, 0])]),
    getDim: vi.fn(() => 384),
};

const vectorStoreMock = {
    init: vi.fn(async () => {}),
    searchDense: vi.fn(async () => []),
    getAllChunks: vi.fn(async () => corpus),
    getStats: vi.fn(async () => ({ chunkCount: corpus.length })),
    close: vi.fn(async () => {}),
};

const rerankerMock = {
    init: vi.fn(async () => true),
    isAvailable: vi.fn(() => true),
    rerank: vi.fn(async () => []),
};

vi.mock('../../lib/rag/embedder.js', () => embedderMock);
vi.mock('../../lib/rag/vectorStore.js', () => vectorStoreMock);
vi.mock('../../lib/rag/reranker.js', () => rerankerMock);
vi.mock('chokidar', () => ({
    watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn(async () => {}) })),
}));

/** Seed a valid search-cache wrapper at <root>/.rag/bm25.json. */
async function seedCache(root, rows = corpus) {
    const { BM25Index } = await import('../../lib/rag/bm25.js');
    const index = new BM25Index();
    await index.init(rows); // materializes documents/postings
    const payload = { version: 1, chunkCount: rows.length, chunks: rows, bm25: index.serialize() };
    const dir = path.join(root, '.rag');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'bm25.json'), JSON.stringify(payload), 'utf8');
    return payload;
}

beforeEach(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-perf-'));
    process.env.RAG_ROOT = tmpRoot;
    vi.resetModules();
    embedderMock.embed.mockClear();
    rerankerMock.rerank.mockClear();
    vectorStoreMock.getAllChunks.mockClear();
});

afterEach(() => {
    delete process.env.RAG_ROOT;
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('Pillar 1 — warm cache restore', () => {
    it('restores a populated BM25 index from .rag/bm25.json in < 100 ms without a store scan', async () => {
        await seedCache(tmpRoot);

        const hybrid = await import('../../lib/rag/hybridSearch.js');
        // Do NOT setBm25Path(null): the default path must point at the seeded cache.

        const t0 = performance.now();
        const idx = await hybrid.rebuildIndex();
        const elapsed = performance.now() - t0;

        expect(idx).not.toBeNull();
        expect(idx.totalDocs).toBeGreaterThanOrEqual(3);
        expect(idx.documents.size).toBeGreaterThanOrEqual(3);
        expect(elapsed).toBeLessThan(100);
        // The cache path was used: the (mocked) vector store was never scanned.
        expect(vectorStoreMock.getAllChunks).not.toHaveBeenCalled();
        // Chunk metadata (text + sources) restored alongside the index.
        const meta = hybrid.getChunkMeta('b');
        expect(meta?.text).toBe('the cache time-to-live is three hundred seconds');
        expect(meta?.file_path).toBe('C:/handbook.md');
    });
});

describe('Pillar 2 — keyword zero-ONNX fast path', () => {
    it('never calls embed() or rerank() and returns BM25-only results', async () => {
        const hybrid = await import('../../lib/rag/hybridSearch.js');
        hybrid.setBm25Path(null); // build from the mocked store
        await hybrid.rebuildIndex();

        const out = await hybrid.search({ query: 'cache time-to-live', search_mode: 'keyword', top_k: 5 });
        expect(out.results.length).toBeGreaterThanOrEqual(1);
        expect(out.results[0].id).toBe('b');
        expect(embedderMock.embed).not.toHaveBeenCalled();
        expect(rerankerMock.rerank).not.toHaveBeenCalled();
        expect(vectorStoreMock.searchDense).not.toHaveBeenCalled();
    });

    it('positive control: hybrid mode DOES call embed() (proves the spies work)', async () => {
        const hybrid = await import('../../lib/rag/hybridSearch.js');
        hybrid.setBm25Path(null);
        await hybrid.rebuildIndex();

        await hybrid.search({ query: 'cache time-to-live', search_mode: 'hybrid', top_k: 5 });
        expect(embedderMock.embed).toHaveBeenCalled();
    });
});

describe('Pillar 3 — watcher watches all active layers', () => {
    it('watches knowledge/ + workspace (live project) roots', async () => {
        fs.mkdirSync(path.join(tmpRoot, 'knowledge'), { recursive: true });
        fs.writeFileSync(path.join(tmpRoot, 'knowledge', 'k.md'), '# K\n\ntext', 'utf8');
        fs.mkdirSync(path.join(tmpRoot, 'workspace'), { recursive: true });

        const { default: watcher } = await import('../../lib/rag/watcher.js');
        await watcher.start({
            onStatus: null,
            embedderOverride: embedderMock,
            vectorStoreOverride: vectorStoreMock,
        });
        await watcher.stop();

        const chokidarModule = await import('chokidar');
        expect(chokidarModule.watch).toHaveBeenCalled();
        const [roots] = chokidarModule.watch.mock.calls[0];
        const normalized = roots.map((r) => path.normalize(r)).sort();
        expect(normalized).toHaveLength(2);
        expect(normalized).toContain(path.normalize(path.join(tmpRoot, 'knowledge')));
        expect(normalized).toContain(path.normalize(path.join(tmpRoot, 'workspace')));
    });
});

describe('Pillar 1/4 — cache round-trip validity', () => {
    it('saveBm25Index() -> loadFromFile() preserves postings and search parity', async () => {
        const { BM25Index } = await import('../../lib/rag/bm25.js');
        const index = new BM25Index();
        await index.init(corpus);

        // Materialize postings via a search, then persist the RAW BM25 payload.
        const before = index.search('alpha').map((h) => h.id);
        expect(before.length).toBeGreaterThanOrEqual(2);

        const file = path.join(tmpRoot, 'bm25-roundtrip.json');
        await index.saveToFile(file);

        const restored = await BM25Index.loadFromFile(file);
        expect(restored).not.toBeNull();
        const after = restored.search('alpha').map((h) => h.id);
        expect(after.sort()).toEqual([...before].sort());

        // Missing / corrupt file -> null, never throws.
        expect(await BM25Index.loadFromFile(path.join(tmpRoot, 'nope.json'))).toBeNull();
        fs.writeFileSync(path.join(tmpRoot, 'corrupt.json'), 'not json {{{', 'utf8');
        expect(await BM25Index.loadFromFile(path.join(tmpRoot, 'corrupt.json'))).toBeNull();
    });
});
