import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { ask_user_preferences, ask_user_preferences_schema } from "../../tools/askUserPreferences.js";
import { ask } from "../../lib/cliInput.js";

describe("askUserPreferences — Reliability / Edge Cases", () => {
  it("should return 'No questions provided' for empty array", async () => {
    const result = await ask_user_preferences({ questions: [] });
    expect(result).toBe("No questions provided.");
  });

  it("should handle questions without choices (free-text)", async () => {
    ask.mockResolvedValueOnce("custom free-text answer");
    const result = await ask_user_preferences({
      questions: [{ question_text: "What is your name?" }],
    });
    expect(typeof result).toBe("string");
  });

  it("should handle non-numeric choice input", async () => {
    ask.mockResolvedValueOnce("abc");
    const result = await ask_user_preferences({
      questions: [{ question_text: "Pick one", choices: ["A", "B"] }],
    });
    expect(typeof result).toBe("string");
  });

  it("schema has correct name and type", () => {
    expect(ask_user_preferences_schema.type).toBe("function");
    expect(ask_user_preferences_schema.function.name).toBe("ask_user_preferences");
  });

  it("schema requires 'questions'", () => {
    expect(ask_user_preferences_schema.function.parameters.required).toContain("questions");
  });
});
