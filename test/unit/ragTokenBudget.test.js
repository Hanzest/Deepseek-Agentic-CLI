import { describe, it, expect } from "vitest";
import {
    enforceBudget,
    countTokens,
    SAFETY_BUFFER_RATIO,
} from "../../lib/rag/tokenBudget.js";

describe("tokenBudget", () => {
    it("exposes the mandatory 10% safety buffer ratio", () => {
        expect(SAFETY_BUFFER_RATIO).toBe(0.10);
    });

    it("reserves 10% of max_prompt_tokens as the effective budget", () => {
        const res = enforceBudget([], 1000);
        expect(res.budget).toBe(900);
    });

    it("keeps chunks greedily in pre-ranked order within the budget", () => {
        const chunks = [
            { id: "a", text: "y".repeat(200) }, // ~50 tokens
            { id: "b", text: "y".repeat(200) }, // ~50 tokens
            { id: "c", text: "y".repeat(200) }, // ~50 tokens
        ];
        const res = enforceBudget(chunks, 160); // effective 144 -> fits a+b (100), drops c
        expect(res.kept.map((c) => c.id)).toEqual(["a", "b"]);
        expect(res.dropped.map((c) => c.id)).toEqual(["c"]);
        expect(res.usedTokens).toBeLessThanOrEqual(res.budget);
    });

    it("assigns sequential keptIndex to kept chunks", () => {
        const chunks = [
            { id: "a", text: "y".repeat(40) },
            { id: "b", text: "y".repeat(40) },
        ];
        const res = enforceBudget(chunks, 100); // effective 90
        expect(res.kept.map((c) => c.keptIndex)).toEqual([0, 1]);
    });

    it("keeps a single oversized top chunk and flags oversized:true", () => {
        const chunks = [{ id: "big", text: "x".repeat(4000) }];
        const res = enforceBudget(chunks, 1000); // effective 900
        expect(res.kept).toHaveLength(1);
        expect(res.kept[0].id).toBe("big");
        expect(res.kept[0].oversized).toBe(true);
    });

    it("honors a custom tokenizerFn", () => {
        const chunks = [{ id: "a", text: "hello" }];
        const res = enforceBudget(chunks, 1000, () => 5);
        expect(res.kept[0].tokens).toBe(5);
    });

    it("never exceeds the effective budget", () => {
        const chunks = [
            { id: "a", text: "y".repeat(400) },
            { id: "b", text: "y".repeat(400) },
            { id: "c", text: "y".repeat(400) },
            { id: "d", text: "y".repeat(400) },
        ];
        const res = enforceBudget(chunks, 400); // effective 360, each ~100 tokens
        expect(res.usedTokens).toBeLessThanOrEqual(360);
        expect(res.kept.length).toBeGreaterThanOrEqual(1);
    });

    it("countTokens uses the length/4 heuristic by default", () => {
        expect(countTokens("a".repeat(16))).toBe(4);
        expect(countTokens("a".repeat(17))).toBe(5); // ceil
        expect(countTokens(null)).toBe(0);
    });
});
