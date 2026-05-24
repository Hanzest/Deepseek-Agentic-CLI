import { describe, it, expect } from "vitest";
import { execute_terminal_command } from "../../tools/executeTerminal.js";

describe("executeTerminal - Functionality / Happy Paths", () => {
  // -----------------------------------------------------------------------
  // echo command
  // -----------------------------------------------------------------------
  it("should execute echo and return output", async () => {
    const result = await execute_terminal_command({
      command: 'echo "Hello from vitest"',
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("Hello from vitest");
  });

  // -----------------------------------------------------------------------
  // node -e command
  // -----------------------------------------------------------------------
  it("should execute node -e and capture output", async () => {
    const result = await execute_terminal_command({
      command: 'node -e "console.log(\'test_output_42\')"',
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("test_output_42");
  });

  // -----------------------------------------------------------------------
  // Directory listing
  // -----------------------------------------------------------------------
  it("should return directory listing for Get-ChildItem", async () => {
    const result = await execute_terminal_command({
      command: "Get-ChildItem -Name",
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Command with no output
  // -----------------------------------------------------------------------
  it("should handle command that produces no output", async () => {
    const result = await execute_terminal_command({
      command: 'node -e ""',
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0); // success message or empty
  });
});
