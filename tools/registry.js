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

// ---------------------------------------------------------------------------
// Central tool registry
// ---------------------------------------------------------------------------
import { callToolsInBatch } from "./callToolsInBatch.js";

export { callToolsInBatch };

// Each entry: [schema, wrappedHandler, needsConsent]

// WORKER_TOOLS — execution and inspection tools only.
// Sub-agents use this set to prevent infinite delegation chains.
export const WORKER_TOOLS = {
    execute_terminal_command: [execute_terminal_command_schema, execute_terminal_command, true],
    patch_file: [patch_file_schema, patch_file, true],
    read_file_chunk: [read_file_chunk_schema, read_file_chunk, false],
    get_project_tree: [get_project_tree_schema, get_project_tree, false],
    search_web: [search_web_schema, search_web, false],
    fetch_url: [fetch_url_schema, fetch_url, true],
    ask_user_preferences: [ask_user_preferences_schema, ask_user_preferences, false],
    write_or_create_file: [write_or_create_file_schema, write_or_create_file, true],
    multi_file_search_string: [multi_file_search_string_schema, multi_file_search_string, false],
};

// SUBAGENT_TOOLS — identical to WORKER_TOOLS but all needsConsent flags are false.
// Rationale: the manager agent (already trusted by the user) delegates work explicitly,
// so per-tool consent prompts would defeat the purpose of autonomous delegation.
// All tool calls are still logged to stdout via callToolsInBatch.
export const SUBAGENT_TOOLS = {
    execute_terminal_command: [execute_terminal_command_schema, execute_terminal_command, false],
    patch_file: [patch_file_schema, patch_file, false],
    read_file_chunk: [read_file_chunk_schema, read_file_chunk, false],
    get_project_tree: [get_project_tree_schema, get_project_tree, false],
    search_web: [search_web_schema, search_web, false],
    fetch_url: [fetch_url_schema, fetch_url, false],
    ask_user_preferences: [ask_user_preferences_schema, ask_user_preferences, false],
    write_or_create_file: [write_or_create_file_schema, write_or_create_file, false],
    multi_file_search_string: [multi_file_search_string_schema, multi_file_search_string, false],
};

// MANAGER_TOOLS — full tool set including delegation.
// Main agent / orchestrator uses this set.
export const MANAGER_TOOLS = {
    ...WORKER_TOOLS,
    delegate_sub_agent: [delegate_sub_agent_schema, delegate_sub_agent, false],
};
