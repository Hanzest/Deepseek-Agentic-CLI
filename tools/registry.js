import {
    execute_terminal_command_schema,
    execute_terminal_command,
} from "./executeTerminal.js";
import {
    patch_file_schema,
    patch_file,
} from "./patchFile.js";
import {
    read_file_chunk_schema,
    read_file_chunk,
} from "./readFileChunk.js";
import {
    get_project_tree_schema,
    get_project_tree,
} from "./getProjectTree.js";
import {
    search_web_schema,
    search_web,
} from "./searchWeb.js";
import {
    fetch_url_schema,
    fetch_url,
} from "./fetchUrl.js";
import {
    ask_user_preferences_schema,
    ask_user_preferences,
} from "./askUserPreferences.js";
import {
    delegate_sub_agent_schema,
    delegate_sub_agent,
} from "./delegateSubAgent.js";
import {
    write_or_create_file_schema,
    write_or_create_file,
} from "./writeOrCreateFile.js";
import {
    multi_file_search_string_schema,
    multi_file_search_string,
} from "./multiFileSearchString.js";

import { callToolsInBatch } from "./callToolsInBatch.js";
import { getRoleEntry } from "./roleSystemPrompts.js";

export { callToolsInBatch };

// ---------------------------------------------------------------------------
// ALL_TOOLS — master catalog of every tool as [schema, handler] pairs.
// No consent flags here; consumers (orchestrator, sub-agents) apply their
// own consent semantics.
// ---------------------------------------------------------------------------
export const ALL_TOOLS = {
    execute_terminal_command: [execute_terminal_command_schema, execute_terminal_command],
    patch_file:             [patch_file_schema,             patch_file],
    read_file_chunk:        [read_file_chunk_schema,        read_file_chunk],
    get_project_tree:       [get_project_tree_schema,       get_project_tree],
    search_web:             [search_web_schema,             search_web],
    fetch_url:              [fetch_url_schema,              fetch_url],
    ask_user_preferences:   [ask_user_preferences_schema,   ask_user_preferences],
    write_or_create_file:   [write_or_create_file_schema,   write_or_create_file],
    multi_file_search_string: [multi_file_search_string_schema, multi_file_search_string],
};

// ---------------------------------------------------------------------------
// ORCHESTRATOR_TOOLS — read-only codebase inspection tools + delegation.
// Main agent / orchestrator uses this set.
// ---------------------------------------------------------------------------
export const ORCHESTRATOR_TOOLS = {
    read_file_chunk: [read_file_chunk_schema, read_file_chunk, false],
    get_project_tree: [get_project_tree_schema, get_project_tree, false],
    multi_file_search_string: [multi_file_search_string_schema, multi_file_search_string, false],
    ask_user_preferences: [ask_user_preferences_schema, ask_user_preferences, false],
    delegate_sub_agent: [delegate_sub_agent_schema, delegate_sub_agent, false],
    execute_terminal_command: [execute_terminal_command_schema, execute_terminal_command, true],
    patch_file: [patch_file_schema, patch_file, false],
    write_or_create_file: [write_or_create_file_schema, write_or_create_file, false],
};

// ---------------------------------------------------------------------------
// buildSubagentTools(role)
//
// Resolves a sub-agent's tool map from its role entry in ROLE_SYSTEM_PROMPT.
// The role's `tools` array lists allowed tool names; this function filters
// ALL_TOOLS to only those names and wraps each entry as [schema, handler, false].
//
// Rationale: sub-agents are trusted delegates — all needsConsent flags are false.
//
// @param {string} role - Role identifier (e.g., "execution", "inspection").
// @returns {object} Tool map shaped like the old SUBAGENT_TOOLS:
//                   { name: [schema, handler, false], ... }
// @throws {Error} If the role is unknown.
// ---------------------------------------------------------------------------
export function buildSubagentTools(role) {
    const roleEntry = getRoleEntry(role);
    if (!roleEntry) {
        throw new Error(
            `Unknown role: "${role}". Must be one of: ` +
            ["requirement_analyzer", "execution", "inspection", "unit_review", "integration_review"].join(", ")
        );
    }

    if (!Array.isArray(roleEntry.tools) || roleEntry.tools.length === 0) {
        throw new Error(`Role "${role}" has no tools defined.`);
    }

    const result = {};
    for (const toolName of roleEntry.tools) {
        const entry = ALL_TOOLS[toolName];
        if (!entry) {
            throw new Error(
                `Role "${role}" references unknown tool "${toolName}". ` +
                `Available tools: ${Object.keys(ALL_TOOLS).join(", ")}`
            );
        }
        result[toolName] = [entry[0], entry[1], false];
    }
    return result;
}
