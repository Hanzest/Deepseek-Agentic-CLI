import { describe, it, expect, vi, beforeEach } from "vitest";

const hybridSearchMock = vi.fn();

vi.mock("../../lib/rag/hybridSearch.js", () => ({
    search: (...args) => hybridSearchMock(...args),
}));

import { retrieve, rewriteQuery } from "../../lib/rag/reflectionLoop.js";

const mkResult = (score, n = 1) => ({
    results: Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        text: `chunk ${i}`,
        score,
        file_path: "C:/a.md",
        line_start: 1,
        line_end: 3,
    })),
    topScore: score,
    truncated: false,
});

describe("reflectionLoop.retrieve", () => {
    beforeEach(() => {
        hybridSearchMock.mockReset();
    });

    it("returns 'no relevant data found' when retrieval is empty", async () => {
        hybridSearchMock.mockResolvedValue({ results: [], topScore: 0, truncated: false });
        const out = await retrieve({ query: "q", min_score: 0.6 });
        expect(out.lowConfidence).toBe(true);
        expect(out.warning).toBe("no relevant data found");
        expect(out.results).toEqual([]);
        expect(hybridSearchMock).toHaveBeenCalledTimes(1);
    });

    it("returns results normally when topScore meets the threshold", async () => {
        hybridSearchMock.mockResolvedValue(mkResult(0.85));
        const out = await retrieve({ query: "q", min_score: 0.6 });
        expect(out.lowConfidence).toBe(false);
        expect(out.warning).toBeNull();
        expect(out.topScore).toBe(0.85);
        expect(hybridSearchMock).toHaveBeenCalledTimes(1);
    });

    it("rewrites the query and re-searches when confidence is low (bounded)", async () => {
        hybridSearchMock.mockResolvedValue(mkResult(0.3));
        const out = await retrieve({ query: "api", min_score: 0.6, maxRetries: 2 });
        expect(out.lowConfidence).toBe(true);
        expect(out.warning).toBe("WARNING: Low confidence context");
        // 1 initial + bounded rewrites (maxRetries clamped to [0,2])
        const calls = hybridSearchMock.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect(calls.length).toBeLessThanOrEqual(3);
        // the rewritten query differs from the original
        expect(calls[0][0].query).toBe("api");
        expect(calls[calls.length - 1][0].query).not.toBe("api");
    });

    it("stops retrying as soon as a rewrite clears the threshold", async () => {
        hybridSearchMock
            .mockResolvedValueOnce(mkResult(0.2))
            .mockResolvedValue(mkResult(0.9));
        const out = await retrieve({ query: "config", min_score: 0.6, maxRetries: 2 });
        expect(out.lowConfidence).toBe(false);
        expect(out.topScore).toBe(0.9);
        expect(hybridSearchMock).toHaveBeenCalledTimes(2);
    });

    it("clamps maxRetries to [0, 2]", async () => {
        hybridSearchMock.mockResolvedValue(mkResult(0.1));
        await retrieve({ query: "q", min_score: 0.9, maxRetries: 99 });
        expect(hybridSearchMock.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it("never throws when hybridSearch rejects", async () => {
        hybridSearchMock.mockRejectedValue(new Error("boom"));
        const out = await retrieve({ query: "q" });
        expect(out).toBeDefined();
        expect(out.results).toEqual([]);
        expect(out.lowConfidence).toBe(true);
    });
});

describe("rewriteQuery", () => {
    it("appends a synonym for known keywords", () => {
        expect(rewriteQuery("api").toLowerCase()).toContain("endpoint");
        expect(rewriteQuery("config").toLowerCase()).toContain("settings");
        expect(rewriteQuery("deploy").toLowerCase()).toContain("release");
    });

    it("is deterministic", () => {
        expect(rewriteQuery("auth")).toBe(rewriteQuery("auth"));
    });

    it("strips trailing question/exclamation marks", () => {
        expect(rewriteQuery("deploy?")).not.toMatch(/[?!]$/);
    });

    it("returns unchanged when no keyword matches", () => {
        expect(rewriteQuery("hello world")).toBe("hello world");
    });
});
