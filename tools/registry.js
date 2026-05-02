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

// ---------------------------------------------------------------------------
// Central tool registry: name -> [schema, handler, needsConsent]
// ---------------------------------------------------------------------------
import { callToolsInBatch } from "./callToolsInBatch.js";

export { callToolsInBatch };

// Each entry: [schema, wrappedHandler, needsConsent]
export const TOOL_REGISTRY = {
    execute_terminal_command: [execute_terminal_command_schema, execute_terminal_command, true],
    patch_file: [patch_file_schema, patch_file, true],
    read_file_chunk: [read_file_chunk_schema, read_file_chunk, false],
    get_project_tree: [get_project_tree_schema, get_project_tree, false],
    search_web: [search_web_schema, search_web, false],
    fetch_url: [fetch_url_schema, fetch_url, true],
    ask_user_preferences: [ask_user_preferences_schema, ask_user_preferences, false],
};
