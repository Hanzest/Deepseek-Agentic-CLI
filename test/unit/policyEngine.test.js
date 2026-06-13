import path from "path";
import { describe, it, expect } from "vitest";
import {
    createPolicyEngine,
    modeGatePolicy,
    MUTATION_BLOCKED_TOOLS,
} from "../../lib/policyEngine.js";

// ---------------------------------------------------------------------------
// createPolicyEngine - basic construction and validation
// ---------------------------------------------------------------------------
describe("createPolicyEngine", () => {
    it("returns an object with an evaluate method", () => {
        const engine = createPolicyEngine([modeGatePolicy]);
        expect(engine).toBeDefined();
        expect(typeof engine.evaluate).toBe("function");
    });

    it("throws if policies is not an array", () => {
        expect(() => createPolicyEngine("not_array")).toThrow("policies must be an array");
    });

    it("throws if a policy is not a function", () => {
        expect(() => createPolicyEngine([modeGatePolicy, "not_a_function"])).toThrow(
            "policy at index 1 is not a function"
        );
    });

    it("returns allow: true when all policies pass", () => {
        const engine = createPolicyEngine([
            () => ({ allow: true }),
            () => ({ allow: true }),
        ]);
        const result = engine.evaluate({ toolName: "read_file_chunk", args: {}, agentMode: "agent" });
        expect(result.allow).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it("short-circuits on first deny", () => {
        let secondPolicyCalled = false;
        const engine = createPolicyEngine([
            () => ({ allow: false, reason: "first denied" }),
            () => {
                secondPolicyCalled = true;
                return { allow: true };
            },
        ]);
        const result = engine.evaluate({ toolName: "write_or_create_file", args: {}, agentMode: "agent" });
        expect(result.allow).toBe(false);
        expect(result.reason).toBe("first denied");
        expect(secondPolicyCalled).toBe(false);
    });

    it("throws if a policy returns an invalid result (missing allow)", () => {
        const engine = createPolicyEngine([
            () => ({ reason: "oops" }), // missing allow boolean
        ]);
        expect(() => engine.evaluate({ toolName: "test", args: {}, agentMode: "agent" })).toThrow(
            "returned invalid result"
        );
    });
});

// ---------------------------------------------------------------------------
// modeGatePolicy - Plan Mode blocking logic
// ---------------------------------------------------------------------------
describe("modeGatePolicy", () => {
    // --- Agent Mode ---
    it("allows mutation tools in agent mode", () => {
        for (const toolName of MUTATION_BLOCKED_TOOLS) {
            const result = modeGatePolicy({
                toolName,
                args: {},
                agentMode: "agent",
            });
            expect(result.allow).toBe(true);
        }
    });

    it("allows read-only tools in agent mode", () => {
        const result = modeGatePolicy({
            toolName: "read_file_chunk",
            args: {},
            agentMode: "agent",
        });
        expect(result.allow).toBe(true);
    });

    // --- Plan Mode: blocked ---
    it("blocks mutation tools in plan mode", () => {
        for (const toolName of MUTATION_BLOCKED_TOOLS) {
            const result = modeGatePolicy({
                toolName,
                args: {},
                agentMode: "plan",
            });
            expect(result.allow).toBe(false);
            expect(result.reason).toContain("Plan Mode");
        }
    });

    it("allows read-only tools in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "read_file_chunk",
            args: {},
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    // --- Plan Mode: artifacts/ exemption ---
    it("allows write_or_create_file targeting artifacts/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "artifacts/active/plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows write_or_create_file targeting ./artifacts/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "./artifacts/active/plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows write_or_create_file targeting artifacts with Windows backslash in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "artifacts\\active\\plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("blocks write_or_create_file targeting ../src/ in plan mode (outside workspace)", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "../src/index.js" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
    });

    it("blocks write_or_create_file targeting absolute C:/ path outside project in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "C:/Users/test/artifacts/active/plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
    });

    it("allows write_or_create_file targeting absolute path that resolves to project artifacts/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: path.resolve("artifacts/active/plan.md") },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows patch_file targeting artifacts/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "patch_file",
            args: { file_path: "artifacts/active/plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("blocks write_or_create_file targeting src/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "write_or_create_file",
            args: { file_path: "src/index.js" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
        expect(result.reason).toContain("Plan Mode");
    });

    // --- Plan Mode: safe terminal commands ---
    it("allows git status in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "execute_terminal_command",
            args: { command: "git status" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows git diff in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "execute_terminal_command",
            args: { command: "git diff --cached" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows terminal commands redirecting to artifacts/ in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "execute_terminal_command",
            args: { command: "echo hello > artifacts/output.txt" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("blocks destructive terminal commands in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "execute_terminal_command",
            args: { command: "rm -rf src" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
        expect(result.reason).toContain("Plan Mode");
    });

    it("blocks git push in plan mode", () => {
        const result = modeGatePolicy({
            toolName: "execute_terminal_command",
            args: { command: "git push origin main" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
        expect(result.reason).toContain("Plan Mode");
    });
});

// ---------------------------------------------------------------------------
// MUTATION_BLOCKED_TOOLS export
// ---------------------------------------------------------------------------
describe("MUTATION_BLOCKED_TOOLS", () => {
    it("contains the expected mutation tools", () => {
        const expected = new Set(["patch_file", "write_or_create_file", "execute_terminal_command"]);
        expect(MUTATION_BLOCKED_TOOLS).toEqual(expected);
    });
});

// ---------------------------------------------------------------------------
// Integration: Engine + modeGatePolicy together
// ---------------------------------------------------------------------------
describe("PolicyEngine + modeGatePolicy integration", () => {
    const engine = createPolicyEngine([modeGatePolicy]);

    it("denies write_or_create_file in plan mode (no artifacts/ path)", () => {
        const result = engine.evaluate({
            toolName: "write_or_create_file",
            args: { file_path: "lib/newFile.js" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(false);
        expect(result.reason).toContain("Plan Mode");
    });

    it("allows write_or_create_file to artifacts/ even in plan mode", () => {
        const result = engine.evaluate({
            toolName: "write_or_create_file",
            args: { file_path: "artifacts/active/plan.md" },
            agentMode: "plan",
        });
        expect(result.allow).toBe(true);
    });

    it("allows all tools in agent mode", () => {
        const tools = [
            "read_file_chunk",
            "write_or_create_file",
            "patch_file",
            "execute_terminal_command",
            "get_project_tree",
            "fetch_url",
        ];
        for (const toolName of tools) {
            const result = engine.evaluate({
                toolName,
                args: {},
                agentMode: "agent",
            });
            expect(result.allow).toBe(true);
        }
    });
});
