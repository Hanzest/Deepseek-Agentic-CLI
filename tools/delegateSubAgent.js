import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createToolHandler } from "./template.js";
import { runSubAgent } from "../lib/subAgentLoop.js";
import { createSubAgentTerminal } from "../lib/subAgentTerminal.js";
import { estimateTokens } from "../lib/tokenizer.js";
import { SessionContext } from "../lib/orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export const delegate_sub_agent_schema = {
    type: "function",
    function: {
        name: "delegate_sub_agent",
        description:
            "Delegates a complex sub-task to a specialized sub-agent by generating a " +
            "structured Markdown prompt file in the artifacts/ directory. The main agent " +
            "feeds this prompt into a fresh conversation to achieve true context isolation, " +
            "parallelization, and specialization. Use this to break down complex multi-step " +
            "tasks into independent, focused sub-tasks.",
        parameters: {
            type: "object",
            properties: {
                sub_agent_name: {
                    type: "string",
                    description:
                        "Unique, descriptive name for this sub-agent. Used as the filename " +
                        "stem (e.g., 'auth-module-builder', 'database-schema-designer'). " +
                        "Keep it short and kebab-case.",
                },
                goal: {
                    type: "string",
                    description:
                        "The specific, concrete goal for the sub-agent in one clear sentence. " +
                        "Must be verifiable — the sub-agent should know exactly when it is done.",
                },
                purpose: {
                    type: "string",
                    description:
                        "Why this sub-agent is needed. Explain the context-isolation benefit, " +
                        "the specialization angle, or the parallelization strategy.",
                },
                deliverable: {
                    type: "string",
                    description:
                        "Clear, unambiguous description of the expected output. Include format, " +
                        "location (e.g., which file to write), and acceptance criteria.",
                },
                skills: {
                    type: "array",
                    items: { type: "string" },
                    description:
                        "Specialization tags or skill descriptions to inject into the sub-agent's " +
                        "system prompt. Examples: ['React 18 expert', 'SQL optimization', " +
                        "'accessibility auditing']. These increase accuracy by narrowing expertise.",
                },
                context: {
                    type: "string",
                    description:
                        "Background information, code references, constraints, or relevant " +
                        "file paths the sub-agent needs to complete its task. " +
                        "Keep it concise — provide file paths and constraint summaries, not " +
                        "full file contents. The sub-agent has tools to read files. " +
                        "Max ~500 words recommended.",
                },
                priority: {
                    type: "string",
                    enum: ["low", "normal", "high"],
                    description:
                        "Task urgency. 'high' — minimize verification, favor speed. " +
                        "'normal' — standard behavior (default). " +
                        "'low' — may use fewer iterations, report partial results.",
                },
                budget_iterations: {
                    type: "integer",
                    description:
                        "Maximum iterations the sub-agent may use. " +
                        "Override the default (20). Lower values save tokens on simple tasks; " +
                        "higher values provide headroom for complex tasks. " +
                        "Recommended: 3-5 for single-file changes, 8-12 for multi-file, " +
                        "15-20 for full codebase analysis. Defaults to 20.",
                },
                self_contained: {
                    type: "boolean",
                    description:
                        "Set to true when the deliverable is purely a file write with no " +
                        "verification needed. Instructs the sub-agent to write and respond " +
                        "immediately — no re-reading, no verification loop. Saves 1-2 " +
                        "iterations per task. Defaults to false.",
                },
                output_file: {
                    type: "string",
                    description:
                        "Custom filename relative to artifacts/. Defaults to " +
                        "'subagent-{sub_agent_name}.md'. Only alphanumeric, dash, dot, " +
                        "and underscore characters are permitted. Must end with .md.",
                },
            },
            required: ["sub_agent_name", "goal", "purpose", "deliverable"],
        },
    },
};

// ---------------------------------------------------------------------------
// Internal: sanitize a name for use in a filename
// ---------------------------------------------------------------------------
function sanitizeFilename(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 80);
}

// ---------------------------------------------------------------------------
// Internal: sanitize the user-supplied output_file parameter.
// Prevents path traversal and ensures only safe characters.
// ---------------------------------------------------------------------------
function sanitizeOutputFile(raw, artifactsDir) {
    // Strip null bytes and path separators and parent-directory sequences
    let cleaned = raw.replace(/\0/g, "").replace(/[/\\]+/g, "").replace(/\.\./g, "");

    // Strip Windows drive-letter prefix (e.g., "C:" -> "") to prevent
    // path.join() from treating the result as an absolute path.
    cleaned = cleaned.replace(/^[a-zA-Z]:/, "");

    // Allow only alphanumeric, dash, underscore, and dot
    cleaned = cleaned.replace(/[^a-zA-Z0-9._-]/g, "");

    // Collapse multiple consecutive dots (except the .md extension dot)
    cleaned = cleaned.replace(/\.{2,}/g, ".");

    // Ensure it ends with .md
    if (!cleaned.endsWith(".md")) {
        cleaned = cleaned.replace(/\.md.*$/, "") + ".md";
    }

    // If empty after sanitization, return null so caller falls back to default
    if (cleaned.length <= 3) {
        return null;
    }

    // Resolve and verify the path stays within artifactsDir
    const resolved = path.resolve(artifactsDir, cleaned);
    const normalizedArtifacts = path.resolve(artifactsDir) + path.sep;
    if (!resolved.startsWith(normalizedArtifacts)) {
        return null; // path traversal detected — fall back to default
    }

    return cleaned;
}

// ---------------------------------------------------------------------------
// Internal: resolve a unique file path, auto-incrementing if the file exists.
// ---------------------------------------------------------------------------
/**
 * Resolve a unique file path by trying exclusive-create (wx flag).
 * Avoids the TOCTOU race window that exists between existsSync and writeFileSync.
 * Falls back to an auto-incrementing name if the exclusive write fails with EEXIST.
 */
function writeFileUnique(artifactsDir, desiredName, content) {
    const ext = path.extname(desiredName);
    const base = path.basename(desiredName, ext);

    let candidate = path.join(artifactsDir, desiredName);
    let counter = 2;

    while (true) {
        try {
            fs.writeFileSync(candidate, content, { encoding: "utf-8", flag: "wx" });
            return candidate; // success — file did not exist before
        } catch (e) {
            if (e.code === "EEXIST") {
                candidate = path.join(artifactsDir, `${base}-${counter}${ext}`);
                counter++;
                // Safety valve: avoid infinite loop
                if (counter > 1000) {
                    throw new Error("Unable to find a unique filename after 1000 attempts.");
                }
                continue;
            }
            throw e; // re-throw permission errors, disk full, etc.
        }
    }
}

// ---------------------------------------------------------------------------
// Internal: build the structured Markdown prompt
// ---------------------------------------------------------------------------
function buildMarkdownPrompt({
    sub_agent_name,
    goal,
    purpose,
    deliverable,
    skills,
    context,
    priority = "normal",
    budget_iterations,
    self_contained = false,
}) {
    const lines = [];

    lines.push(`# Sub-Agent: ${sub_agent_name}`);
    lines.push("");

    // Priority banner for high/low urgency
    if (priority === "high") {
        lines.push("> **HIGH PRIORITY** — Minimize verification. Favor speed. Deliver the result as quickly as possible.");
        lines.push("");
    } else if (priority === "low") {
        lines.push("> **LOW PRIORITY** — Standard effort is fine. Partial results are acceptable if the task proves complex.");
        lines.push("");
    }

    if (budget_iterations != null) {
        lines.push(`> **Iteration Budget:** ${budget_iterations} maximum. Plan accordingly.`);
        lines.push("");
    }

    if (self_contained) {
        lines.push("> **SELF-CONTAINED TASK** — Your deliverable is a file write. Once written, respond with the summary immediately. Do NOT re-read or verify the file unless the write tool returned an error.");
        lines.push("");
    }

    lines.push("## Goal");
    lines.push(goal);
    lines.push("");
    lines.push("## Purpose");
    lines.push(purpose);
    lines.push("");

    if (skills && skills.length > 0) {
        lines.push("## Skills / Specialization");
        lines.push("You are a specialist with deep expertise in the following areas:");
        lines.push("");
        for (const skill of skills) {
            lines.push(`- **${skill}**`);
        }
        lines.push("");
    }

    if (context) {
        lines.push("## Context");
        lines.push(context);
        lines.push("");
    }

    lines.push("## Deliverable");
    lines.push(deliverable);
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push("## Instructions");
    lines.push("");
    lines.push("1. Read this entire prompt carefully before starting.");
    lines.push("2. Plan your approach before writing any code or making changes.");
    lines.push("3. Produce exactly the deliverable described above.");
    lines.push("4. When done, clearly state that the deliverable is complete.");
    lines.push("");
    lines.push("---");
    lines.push(`*Generated by delegateSubAgent tool. Feed this entire prompt into a fresh conversation for true context isolation.*`);

    return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pure handler logic (no consent — safe workspace writes only)
// ---------------------------------------------------------------------------
async function delegateSubAgentCore({
    sub_agent_name,
    goal,
    purpose,
    deliverable,
    skills = [],
    context = "",
    priority = "normal",
    budget_iterations,
    self_contained = false,
    output_file = "",
} = {}) {
    const artifactsDir = path.resolve(__dirname, "..", "artifacts");

    // Ensure artifacts directory exists
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Determine filename: use sanitized custom name or default
    let desiredName;
    if (output_file) {
        const sanitized = sanitizeOutputFile(output_file, artifactsDir);
        desiredName = sanitized || `subagent-${sanitizeFilename(sub_agent_name)}.md`;
    } else {
        desiredName = `subagent-${sanitizeFilename(sub_agent_name)}.md`;
    }

    const markdown = buildMarkdownPrompt({
        sub_agent_name,
        goal,
        purpose,
        deliverable,
        skills,
        context,
        priority,
        budget_iterations,
        self_contained,
    });

    // -----------------------------------------------------------------------
    // Token size validation
    // -----------------------------------------------------------------------
    const TOKEN_WARNING_THRESHOLD = 8000;
    const mockMessages = [{ role: "system", content: markdown }];
    const { total_tokens: promptTokenCount } = estimateTokens(mockMessages);

    if (promptTokenCount > TOKEN_WARNING_THRESHOLD) {
        console.log(
            `\x1b[93m[Warning] Prompt size ~${promptTokenCount} tokens exceeds ${TOKEN_WARNING_THRESHOLD} token threshold. Consider splitting this task.\x1b[0m`
        );
    }

    // Write with exclusive-create to avoid TOCTOU race
    const filePath = writeFileUnique(artifactsDir, desiredName, markdown);
    const fileName = path.basename(filePath);

    console.log(`\x1b[1;97m[Sub-Agent Delegate]\x1b[0m`);
    console.log(`  Name:       \x1b[93m${sub_agent_name}\x1b[0m`);
    console.log(`  Goal:       \x1b[37m${goal}\x1b[0m`);
    console.log(`  Prompt:     \x1b[90martifacts/${fileName}\x1b[0m`);
    console.log(`  Skills:     ${skills.length > 0 ? skills.join(", ") : "\x1b[90m(none)\x1b[0m"}`);
    console.log(`  Status:     \x1b[32mcreated\x1b[0m`);

    // -----------------------------------------------------------------------
    // Launch the sub-agent autonomously in its own terminal window
    // -----------------------------------------------------------------------
    console.log(`\n\x1b[36m  Launching sub-agent in independent terminal...\x1b[0m\n`);

    let terminal;
    let result;
    try {
        terminal = createSubAgentTerminal(sub_agent_name);

        // Wrap terminal.write as a console-compatible .log() method
        const subAgentLogger = {
            log: (msg) => terminal.write(String(msg)),
        };

        result = await runSubAgent(markdown, sub_agent_name, subAgentLogger, SessionContext.agentMode);
    } catch (e) {
        const errMsg = `Sub-agent launch or execution failed: ${e.message || e}`;
        console.log(`\n\x1b[91m${errMsg}\x1b[0m`);
        return JSON.stringify({
            error: true,
            tool: "delegate_sub_agent",
            sub_agent_name,
            goal,
            status: "failed",
            message: errMsg,
        });
    } finally {
        if (terminal) {
            try { terminal.close(); } catch (_) { /* ignore cleanup errors */ }
        }
    }

    // -----------------------------------------------------------------------
    // Write the sub-agent report
    // -----------------------------------------------------------------------
    const reportName = `${sanitizeFilename(sub_agent_name)}-report.md`;
    const reportPath = path.join(artifactsDir, reportName);

    const reportLines = [
        `# Sub-Agent Report: ${sub_agent_name}`,
        "",
        `**Status:** Completed in ${result.iterationCount} iteration(s)`,
        "",
        "---",
        "",
        "## Final Output",
        "",
        result.finalContent,
        "",
    ];

    if (result.reasoningContent) {
        reportLines.push("---");
        reportLines.push("");
        reportLines.push("## Reasoning Content");
        reportLines.push("");
        reportLines.push(result.reasoningContent);
        reportLines.push("");
    }

    fs.writeFileSync(reportPath, reportLines.join("\n"), "utf-8");

    console.log(`\n\x1b[1;97m[Sub-Agent Complete]\x1b[0m`);
    console.log(`  Name:       \x1b[93m${sub_agent_name}\x1b[0m`);
    console.log(`  Report:     \x1b[90martifacts/${reportName}\x1b[0m`);
    console.log(`  Iterations: \x1b[37m${result.iterationCount}\x1b[0m`);
    console.log(`  Status:     \x1b[32mcompleted\x1b[0m`);

    const returnObj = {
        file_path: `artifacts/${fileName}`,
        report_path: `artifacts/${reportName}`,
        sub_agent_name,
        goal,
        purpose,
        skills,
        iteration_count: result.iterationCount,
        final_content_preview: result.finalContent.substring(0, 500),
        status: "completed",
        prompt_token_count: promptTokenCount,
    };

    if (promptTokenCount > TOKEN_WARNING_THRESHOLD) {
        returnObj.warning = `Prompt size (~${promptTokenCount} tokens) exceeds ${TOKEN_WARNING_THRESHOLD} token threshold. Consider splitting this task into smaller sub-tasks or reducing the context field.`;
    }

    return JSON.stringify(returnObj);
}

// ---------------------------------------------------------------------------
// Wrapped handler (no consent — artifacts/ is a safe workspace)
// ---------------------------------------------------------------------------
export const delegate_sub_agent = createToolHandler(
    "delegate_sub_agent",
    delegateSubAgentCore,
    false
);
