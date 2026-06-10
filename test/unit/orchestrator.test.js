import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSessionMemoryContent, getActiveMessages, SessionContext, escapeRegExp } from "../../lib/orchestrator.js";

describe("Orchestrator Session Memory caching and audit tests", () => {
    let originalSessionMemory;

    beforeEach(() => {
        originalSessionMemory = SessionContext.sessionMemory;
    });

    afterEach(() => {
        SessionContext.sessionMemory = originalSessionMemory;
    });

    it("should return empty string if session memory is empty", () => {
        SessionContext.sessionMemory = {
            filesCreated: new Set(),
            filesModified: new Set(),
            userPreferences: [],
            keyDecisions: [],
        };
        const content = getSessionMemoryContent();
        expect(content).toBe("");
    });

    it("should format files, preferences, and decisions in getSessionMemoryContent", () => {
        SessionContext.sessionMemory = {
            filesCreated: new Set(["/path/to/project/src/index.js"]),
            filesModified: new Set(["/path/to/project/README.md"]),
            userPreferences: ["dark-mode", "no-confirm"],
            keyDecisions: ["Use vitest for testing"],
        };

        const content = getSessionMemoryContent();
        expect(content).toContain("## Session Memory (State & Decisions)");
        expect(content).toContain("index.js");
        expect(content).toContain("README.md");
        expect(content).toContain("dark-mode | no-confirm");
        expect(content).toContain("Use vitest for testing");
    });

    it("should get active messages array with session memory system message appended", () => {
        SessionContext.sessionMemory = {
            filesCreated: new Set(["/path/to/project/src/index.js"]),
            filesModified: new Set(),
            userPreferences: [],
            keyDecisions: [],
        };

        const initialMessages = [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: "Hello" }
        ];

        const active = getActiveMessages(initialMessages);
        expect(active.length).toBe(3);
        expect(active[0]).toEqual(initialMessages[0]);
        expect(active[1]).toEqual(initialMessages[1]);
        expect(active[2].role).toBe("system");
        expect(active[2].content).toContain("## Session Memory (State & Decisions)");
    });
});

describe("Search Regex and whole-word matching logic", () => {
    it("should escape regex special characters in keyword", () => {
        const keyword = "caching.test*helper(func)";
        const escaped = escapeRegExp(keyword);
        expect(escaped).toBe("caching\\.test\\*helper\\(func\\)");
    });

    it("should match whole word case-insensitively with regex", () => {
        const keyword = "caching";
        const escaped = escapeRegExp(keyword);
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');

        expect(regex.test("This is a caching test")).toBe(true);
        expect(regex.test("Caching is important")).toBe(true);
        expect(regex.test("We are CACHING results")).toBe(true);
        expect(regex.test("This is cached")).toBe(false);
        expect(regex.test("multicaching is not matching")).toBe(false);
        expect(regex.test("caching-related")).toBe(true);
        expect(regex.test("caching? yes")).toBe(true);
    });
});
