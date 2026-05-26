import { describe, it, expect, vi } from "vitest";
import { execute_terminal_command } from "../../tools/executeTerminal.js";

vi.mock("../../lib/cliInput.js", () => ({
  ask: vi.fn().mockResolvedValue("y"),
}));

describe("executeTerminal - Reliability / Edge Cases", () => {
  // -----------------------------------------------------------------------
  // Invalid command
  // -----------------------------------------------------------------------
  it("should return error for an invalid command", async () => {
    const result = await execute_terminal_command({
      command: "nonexistentcommand_xyz123",
    });
    expect(typeof result).toBe("string");
    // PowerShell returns error output for unknown commands
    expect(result.length).toBeGreaterThan(0);
  }, 15000);

  // -----------------------------------------------------------------------
  // Command with .env reference - security check (mocked consent)
  // -----------------------------------------------------------------------
  it("should handle command referencing .env with mocked consent", async () => {
    const result = await execute_terminal_command({
      command: 'echo "Reading .env file"',
    });
    // Consent is mocked to "y", command proceeds
    expect(typeof result).toBe("string");
    expect(result).toContain(".env");
  }, 15000);

  // -----------------------------------------------------------------------
  // Empty command string
  // -----------------------------------------------------------------------
  it("should handle empty command string", async () => {
    const result = await execute_terminal_command({ command: "" });
    expect(typeof result).toBe("string");
    // PowerShell with empty command either returns empty or errors
  }, 15000);
});
