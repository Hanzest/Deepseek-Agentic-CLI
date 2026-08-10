import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Stub the native/DB-backed modules so tests never touch lancedb/onnx ----
const corpus = [
    {
        id: "a", layer: "workspace", namespace: "", file_path: "C:/a.md",
        line_start: 1, line_end: 3, section_headers: ["Intro"],
        text: "alpha beta gamma", timestamp: 1, file_hash: "h1",
    },
    {
        id: "b", layer: "knowledge", namespace: "", file_path: "C:/b.md",
        line_start: 1, line_end: 2, section_headers: ["Ref"],
        text: "delta epsilon zeta", timestamp: 2, file_hash: "h2",
    },
    {
        id: "c", layer: "knowledge", namespace: "math", file_path: "C:/c.md",
        line_start: 5, line_end: 7, section_headers: ["Math"],
        text: "alpha alpha alpha", timestamp: 3, file_hash: "h3",
    },
];

const embedderMock = {
    isAvailable: vi.fn(() => true),
    embed: vi.fn(async () => [new Float32Array([1, 0])]),
    getDim: vi.fn(() => 384),
};

const vectorStoreMock = {
    searchDense: vi.fn(async (vec, { layer = null, namespace = null, limit = 50 } = {}) => {
        let rows = [
            { ...corpus[0], cosine: 0.95 },
            { ...corpus[2], cosine: 0.8 },
        ];
        if (layer != null) rows = rows.filter((r) => r.layer === layer);
        if (namespace != null) rows = rows.filter((r) => r.namespace === namespace);
        return rows.slice(0, limit);
    }),
    getAllChunks: vi.fn(async () => corpus),
    getStats: vi.fn(async () => ({ chunkCount: corpus.length })),
};

vi.mock("../../lib/rag/embedder.js", () => embedderMock);
vi.mock("../../lib/rag/vectorStore.js", () => vectorStoreMock);

/** @type {typeof import("../../lib/rag/hybridSearch.js")} */
let hybrid;

beforeEach(async () => {
    vi.resetModules();
    embedderMock.isAvailable.mockClear();
    embedderMock.embed.mockClear();
    vectorStoreMock.searchDense.mockClear();
    vectorStoreMock.getAllChunks.mockClear();
    hybrid = await import("../../lib/rag/hybridSearch.js");
    await hybrid.rebuildIndex(); // seeds module-level BM25 + chunkMetaById
});

describe("hybridSearch.search", () => {
    it("fuses dense + sparse and attaches full chunk metadata", async () => {
        const out = await hybrid.search({ query: "alpha", top_k: 10 });
        expect(out.results.length).toBeGreaterThanOrEqual(2);
        const top = out.results[0];
        expect(top.id).toBe("a");
        expect(top.score).toBeCloseTo(0.95, 5);
        // metadata attached (the critical fix)
        expect(top.text).toBe("alpha beta gamma");
        expect(top.file_path).toBe("C:/a.md");
        expect(top.line_start).toBe(1);
        expect(top.section_headers).toEqual(["Intro"]);
        expect(typeof out.topScore).toBe("number");
    });

    it("applies layer filtering on both dense and sparse paths", async () => {
        const out = await hybrid.search({ query: "alpha", layer: "knowledge", top_k: 10 });
        const layers = new Set(out.results.map((r) => r.layer));
        expect(layers.has("workspace")).toBe(false);
        expect(layers.has("knowledge")).toBe(true);
    });

    it("applies namespace filtering", async () => {
        const out = await hybrid.search({ query: "alpha", namespace: "math", top_k: 10 });
        expect(out.results.length).toBeGreaterThanOrEqual(1);
        expect(out.results.every((r) => r.namespace === "math")).toBe(true);
    });

    it("filters by min_score", async () => {
        const out = await hybrid.search({ query: "alpha", min_score: 0.9, top_k: 10 });
        expect(out.results.length).toBeGreaterThanOrEqual(1);
        expect(out.results.every((r) => r.score >= 0.9)).toBe(true);
    });

    it("enforces max_prompt_tokens with truncation flag", async () => {
        const out = await hybrid.search({ query: "alpha", max_prompt_tokens: 1, top_k: 10 });
        // effective budget floor(1*0.9)=0 -> at most the oversized top chunk
        expect(out.results.length).toBeLessThanOrEqual(1);
        expect(typeof out.truncated).toBe("boolean");
    });

    it("returns sparse-only results when the embedder is unavailable", async () => {
        embedderMock.isAvailable.mockReturnValue(false);
        const out = await hybrid.search({ query: "epsilon", top_k: 10 });
        expect(out.results.length).toBeGreaterThanOrEqual(1);
        expect(out.results[0].id).toBe("b");
        expect(typeof out.results[0].score).toBe("number");
    });
});

describe("expandQuery", () => {
    it("keeps the original first and decomposes ' and ' queries", () => {
        expect(hybrid.expandQuery("auth and deploy")).toEqual([
            "auth and deploy",
            "auth",
            "deploy",
        ]);
    });

    it("decomposes ' or ' queries deterministically", () => {
        expect(hybrid.expandQuery("pdf or docx")).toEqual(["pdf or docx", "pdf", "docx"]);
    });

    it("returns a single-element list for plain queries", () => {
        expect(hybrid.expandQuery("alpha")).toEqual(["alpha"]);
    });
});

describe("rrf", () => {
    it("rewards ids present in more lists and at higher ranks", () => {
        const scores = hybrid.rrf([["a", "b"], ["b", "c"]], 60);
        expect(scores.b).toBeGreaterThan(scores.a);
        expect(scores.a).toBeGreaterThan(0);
        expect(scores.c).toBeGreaterThan(0);
    });
});
