// ---------------------------------------------------------------------------
// Policy Engine - Pluggable middleware pipeline for tool-call guardrails.
//
// Separates policy enforcement from tool execution logic. Each guardrail is
// a standalone policy function. The engine evaluates all policies in order;
// the first policy that returns { allow: false } short-circuits the chain.
//
// Consumers (orchestrator, callToolsInBatch) call engine.evaluate(context)
// once per tool call instead of evaluating ad-hoc conditionals inline.
//
// Usage:
//   import { createPolicyEngine, modeGatePolicy } from "./policyEngine.js";
//   const engine = createPolicyEngine([ modeGatePolicy ]);
//   const result = engine.evaluate({ toolName, args, agentMode });
//   if (!result.allow) { /* block */ }
// ---------------------------------------------------------------------------

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// MUTATION_BLOCKED_TOOLS — tools that modify system state.
// Exported so callToolsInBatch can use it for cache invalidation.
// ---------------------------------------------------------------------------
export const MUTATION_BLOCKED_TOOLS = new Set([
    "patch_file",
    "write_or_create_file",
    "execute_terminal_command",
]);

// ---------------------------------------------------------------------------
// Helpers (moved here from callToolsInBatch.js)
// ---------------------------------------------------------------------------

/**
 * Checks whether a terminal command is safe to run in Plan Mode.
 * Safe commands are read-only git operations and output redirections
 * to the artifacts/ folder.
 * @param {string} command
 * @returns {boolean}
 */
function isSafePlanModeCommand(command) {
    if (!command) return false;
    const trimmed = command.trim();
    // Allow basic git status / git diff
    if (/^git\s+(status|diff)(\s+|$)/i.test(trimmed)) {
        return true;
    }
    // Allow commands redirecting to artifacts/ directory
    if (/>+?\s*artifacts[\/\\]/i.test(trimmed)) {
        return true;
    }
    return false;
}

/**
 * Checks whether a file-mutation tool targets a path inside the artifacts/
 * folder (safe workspace). If so, the tool is allowed even in Plan Mode.
 * @param {Object} args - Tool call arguments
 * @returns {boolean}
 */
function isArtifactsPath(args) {
    const filePath = args?.file_path || "";
    if (!filePath) return false;

    // ---- Check 1: Relative path starting with artifacts/ (or ./artifacts/) ----
    let normalized = filePath.replace(/\\/g, "/");
    normalized = normalized.replace(/^\.\//, "");
    if (normalized.startsWith("artifacts/") || normalized === "artifacts") {
        return true;
    }

    // ---- Check 2: Absolute path — check for artifacts/active segment ----
    // Allows any path containing ".../artifacts/active/..." as a proper
    // path segment, while explicitly blocking C: drive.
    try {
        const resolved = path.resolve(filePath);
        const resolvedNormalized = resolved.replace(/\\/g, "/");

        // Block C: drive absolutely (case-insensitive)
        if (/^c:/i.test(resolvedNormalized)) {
            return false;
        }

        // Check if path contains "artifacts/active" as a path segment
        const segments = resolvedNormalized.split("/");
        for (let i = 0; i < segments.length - 1; i++) {
            if (segments[i] === "artifacts" && segments[i + 1] === "active") {
                return true;
            }
        }
    } catch {
        // If path resolution fails, treat as non-artifacts path
    }

    return false;
}

// ---------------------------------------------------------------------------
// Policy Types (JSDoc)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PolicyContext
 * @property {string}   toolName   - Name of the tool being called
 * @property {Object}   args       - Parsed arguments for the tool call
 * @property {string}   agentMode  - "plan" | "agent"
 * @property {boolean}  needsConsent - Whether the tool requires consent in the registry
 */

/**
 * @typedef {Object} PolicyResult
 * @property {boolean}  allow      - true if the tool call is permitted
 * @property {string}   [reason]   - Human-readable explanation when allow === false
 */

/**
 * Policy function signature: (context: PolicyContext) => PolicyResult
 * @typedef {Function} PolicyFn
 */

// ---------------------------------------------------------------------------
// createPolicyEngine(policies)
//
// Creates a policy engine from an ordered array of policy functions.
// Each policy runs in sequence; the first { allow: false } short-circuits
// and returns immediately. If all policies pass, { allow: true } is returned.
//
// @param {PolicyFn[]} policies - Ordered list of policy functions
// @returns {{ evaluate: (context: PolicyContext) => PolicyResult }}
// ---------------------------------------------------------------------------
export function createPolicyEngine(policies) {
    if (!Array.isArray(policies)) {
        throw new Error("PolicyEngine: policies must be an array.");
    }
    for (let i = 0; i < policies.length; i++) {
        if (typeof policies[i] !== "function") {
            throw new Error(`PolicyEngine: policy at index ${i} is not a function.`);
        }
    }

    return {
        /**
         * Evaluate all policies against the given context.
         * @param {PolicyContext} context
         * @returns {PolicyResult}
         */
        evaluate(context) {
            for (const policy of policies) {
                const result = policy(context);
                if (!result || typeof result.allow !== "boolean") {
                    throw new Error(
                        `PolicyEngine: policy '${policy.name || "anonymous"}' returned invalid result. ` +
                        "Expected { allow: boolean, reason?: string }."
                    );
                }
                if (!result.allow) return result;
            }
            return { allow: true };
        },
    };
}

// ---------------------------------------------------------------------------
// modeGatePolicy
//
// Blocks mutation/execution tools in Plan Mode, with exemptions:
// 1. Writes to the artifacts/ folder are always allowed (safe workspace).
// 2. Safe terminal commands (git status, git diff, redirects to artifacts/)
//    are allowed.
//
// In Agent Mode, all tools pass through.
// ---------------------------------------------------------------------------
export function modeGatePolicy(context) {
    const { toolName, args, agentMode } = context;

    // Outside Plan Mode → no restrictions
    if (agentMode !== "plan") {
        return { allow: true };
    }

    // Tool is not a mutation tool → pass through
    if (!MUTATION_BLOCKED_TOOLS.has(toolName)) {
        return { allow: true };
    }

    // ---- Plan Mode exemptions ----

    // Exemption 1: Terminal commands that are read-only (git status/diff) or
    //              redirect output to artifacts/
    if (toolName === "execute_terminal_command" && isSafePlanModeCommand(args?.command)) {
        return { allow: true };
    }

    // Exemption 2: File writes targeting the artifacts/ workspace
    if (toolName !== "execute_terminal_command" && isArtifactsPath(args)) {
        return { allow: true };
    }

    // Blocked
    return {
        allow: false,
        reason:
            "Blocked: File mutation and system execution are disabled in Plan Mode. " +
            "Switch to Agent Mode (/agent) to proceed. " +
            "(Writes to artifacts/ folder are allowed.)",
    };
}
