import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

import { ask_user_preferences } from "../../tools/askUserPreferences.js";
import { ask } from "../../lib/cliInput.js";

describe("askUserPreferences - Functionality / Happy Paths", () => {
  it("should handle single question with choices", async () => {
    ask.mockResolvedValueOnce("2");
    const result = await ask_user_preferences({
      questions: [{ question_text: "Favorite color?", choices: ["Red", "Blue", "Green"] }],
    });
    expect(typeof result).toBe("string");
  });

  it("should handle multiple questions", async () => {
    ask.mockResolvedValueOnce("1").mockResolvedValueOnce("2");
    const result = await ask_user_preferences({
      questions: [
        { question_text: "Q1?", choices: ["A", "B"] },
        { question_text: "Q2?", choices: ["X", "Y"] },
      ],
    });
    expect(typeof result).toBe("string");
  });

  it("should handle custom input when user picks last option", async () => {
    ask.mockResolvedValueOnce("3").mockResolvedValueOnce("my custom answer");
    const result = await ask_user_preferences({
      questions: [{ question_text: "Type something", choices: ["Option A", "Option B"] }],
    });
    expect(typeof result).toBe("string");
  });

  it("should return structured text result with Q/A pairs", async () => {
    ask.mockResolvedValueOnce("1");
    const result = await ask_user_preferences({
      questions: [{ question_text: "Test?", choices: ["Yes", "No"] }],
    });
    expect(typeof result).toBe("string");
    // Output format: "[User Preferences]\nQ: Test?\nA: Yes\n"
    expect(result).toContain("[User Preferences]");
    expect(result).toContain("Q: Test?");
    expect(result).toContain("A: Yes");
  });
});
