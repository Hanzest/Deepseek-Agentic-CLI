import { describe, it, expect, vi, beforeEach } from "vitest";

const indexSearchMock = vi.fn();

vi.mock("../../lib/rag/index.js", () => ({
    search: (...args) => indexSearchMock(...args),
}));

import { rag_search_schema, rag_search } from "../../tools/ragSearch.js";

const SAMPLE_SEARCH_RESULT = {
    results: [
        {
            id: "abc123",
            text: "The deployment checklist is in the ops runbook.",
            score: 0.82,
            layer: "knowledge",
            namespace: "ops",
            file_path: "C:/knowledge/ops/runbook.md",
            line_start: 12,
            line_end: 25,
            section_headers: ["Deployment", "Checklist"],
            rerank_score: undefined, // should map to null in output
        },
    ],
    topScore: 0.82,
    lowConfidence: false,
    warning: null,
    truncated: false,
};

describe("rag_search_schema", () => {
    it("requires query and exposes the spec parameters", () => {
        expect(rag_search_schema.type).toBe("function");
        expect(rag_search_schema.function.name).toBe("rag_search");
        expect(rag_search_schema.function.parameters.required).toContain("query");
        const props = rag_search_schema.function.parameters.properties;
        expect(props.layer.enum).toEqual(["knowledge", "workspace", "both"]);
        expect(props.layer.default).toBe("both");
        expect(props.top_k.default).toBe(5);
        expect(props.min_score.default).toBe(0.6);
        expect(props.max_prompt_tokens.type).toBe("integer");
        expect(props.search_mode.enum).toEqual(["hybrid", "keyword", "dense"]);
        expect(props.search_mode.default).toBe("hybrid");
    });
});

describe("rag_search handler", () => {
    beforeEach(() => {
        indexSearchMock.mockReset();
    });

    it("returns a JSON string with the mapped result contract", async () => {
        indexSearchMock.mockResolvedValue(SAMPLE_SEARCH_RESULT);
        const raw = await rag_search({ query: "deployment checklist" });
        const out = JSON.parse(raw);
        expect(out.error).toBe(false);
        expect(out.total_found).toBe(1);
        expect(out.top_score).toBe(0.82);
        expect(out.low_confidence).toBe(false);
        expect(out.warning).toBeNull();
        expect(out.results[0].text).toContain("deployment checklist");
        expect(out.results[0].file_path).toContain("runbook.md");
        expect(out.results[0].line_start).toBe(12);
        expect(out.results[0].rerank_score).toBeNull(); // undefined -> null
    });

    it("forwards the search arguments to index.search", async () => {
        indexSearchMock.mockResolvedValue({ results: [], topScore: 0, lowConfidence: true, warning: "no relevant data found", truncated: false });
        await rag_search({ query: "q", namespace: "ops", layer: "knowledge", top_k: 3, max_prompt_tokens: 2000 });
        expect(indexSearchMock).toHaveBeenCalledWith({
            query: "q", namespace: "ops", layer: "knowledge", top_k: 3, max_prompt_tokens: 2000,
        });
    });

    it("forwards search_mode to index.search", async () => {
        indexSearchMock.mockResolvedValue({ results: [], topScore: 0, lowConfidence: true, warning: "no relevant data found", truncated: false });
        await rag_search({ query: "q", search_mode: "keyword" });
        expect(indexSearchMock).toHaveBeenCalledWith({ query: "q", search_mode: "keyword" });
    });

    it("reports low-confidence warnings", async () => {
        indexSearchMock.mockResolvedValue({
            results: [{ id: "x", text: "t", score: 0.3 }],
            topScore: 0.3,
            lowConfidence: true,
            warning: "WARNING: Low confidence context",
            truncated: false,
        });
        const out = JSON.parse(await rag_search({ query: "q" }));
        expect(out.low_confidence).toBe(true);
        expect(out.warning).toContain("Low confidence");
    });

    it("returns an error JSON when the index search throws", async () => {
        indexSearchMock.mockRejectedValue(new Error("vector store unavailable"));
        const out = JSON.parse(await rag_search({ query: "q" }));
        expect(out.error).toBe(true);
        expect(out.tool).toBe("rag_search");
        expect(out.message).toContain("vector store unavailable");
    });
});
