import { get_encoding } from "tiktoken";
import readline from "readline";

// ---------------------------------------------------------------------------
// Tokenizer setup
// ---------------------------------------------------------------------------
let ENCODER;
try {
  ENCODER = get_encoding("cl100k_base");
} catch (e) {
  console.log(
    `Error loading tokenizer: ${e.message}. Token estimation will be less accurate.`
  );
  ENCODER = null;
}

// ---------------------------------------------------------------------------
// Console input helper (shared with modelTool.js)
// ---------------------------------------------------------------------------
export function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------
export async function startChat() {
  console.log("Choose a model to interact with:");
  console.log("1. deepseek-v4-flash");
  console.log("2. deepseek-v4-pro");

  const model_choice = await ask("Enter your choice (1 or 2): ");

  if (model_choice === "1") {
    return "deepseek-v4-flash";
  } else if (model_choice === "2") {
    return "deepseek-v4-pro";
  } else {
    console.log("Invalid choice. Using deepseek-v4-flash by default.");
    return "deepseek-v4-flash";
  }
}

// ---------------------------------------------------------------------------
// Reasoning / thinking toggle
// ---------------------------------------------------------------------------
export async function thinkingToggle() {
  console.log("Choose reasoning content option:");
  console.log("1. Disabled");
  console.log("2. Enabled");

  const choice = await ask("Enter your choice (1 or 2): ");

  if (choice === "1") {
    return { thinking: { type: "disabled" } };
  } else if (choice === "2") {
    return { thinking: { type: "enabled" } };
  } else {
    console.log("Invalid choice. Disabled reasoning content by default.");
    return { thinking: { type: "disabled" } };
  }
}

// ---------------------------------------------------------------------------
// Token estimation helpers
// ---------------------------------------------------------------------------
function _estimate_text_tokens(content, token_multiplier) {
  if (!content) {
    return 0;
  }

  if (ENCODER) {
    if (Array.isArray(content)) {
      const flat = content.map((item) => String(item)).join("");
      return ENCODER.encode(flat).length;
    } else if (typeof content === "string") {
      return ENCODER.encode(content).length;
    } else {
      return ENCODER.encode(String(content)).length;
    }
  }

  // Fallback: heuristic estimation if tokenizer is unavailable
  if (Array.isArray(content)) {
    const flat = content.map((item) => String(item)).join("");
    return (flat.length / 4) * token_multiplier;
  }

  if (typeof content === "string") {
    if (content.length > 10000) {
      return (content.length / 4) * token_multiplier;
    } else {
      const words = content.split(/\s+/).filter(Boolean);
      return words.length * token_multiplier;
    }
  }

  return (String(content).length / 4) * token_multiplier;
}

function _estimate_tool_call_tokens(tool_call, token_multiplier) {
  if (!tool_call || typeof tool_call !== "object") {
    return (String(tool_call).length / 4) * token_multiplier;
  }

  let tokens = 0;

  // Tool-call identifier (e.g. "call_abc123")
  const tc_id = tool_call.id || "";
  tokens += _estimate_text_tokens(tc_id, token_multiplier);

  const func = tool_call.function || {};
  if (typeof func === "object") {
    // Function name
    const func_name = func.name || "";
    tokens += _estimate_text_tokens(func_name, token_multiplier);

    // Arguments (JSON string) -- always use character-based for precision
    const func_args = func.arguments || "";
    if (typeof func_args === "string" && func_args) {
      tokens += (func_args.length / 4) * token_multiplier;
    }
  }

  // Structural overhead: ~12 tokens for the JSON keys / braces / commas
  tokens += 12;

  return tokens;
}

// ---------------------------------------------------------------------------
// Main public API
// ---------------------------------------------------------------------------
export function estimateTokens(
  messages,
  reasoning_history = "",
  token_multiplier = 1.6
) {
  let input_tokens = 0;
  let output_tokens = 0;

  for (const message of messages) {
    const role = message.role || null;
    const content = message.content || null;

    // ---- content tokens ----
    const content_tokens = _estimate_text_tokens(content, token_multiplier);

    if (role === "assistant") {
      // Assistant content is both output and future context
      output_tokens += content_tokens;
      input_tokens += content_tokens;
    } else if (role === "tool") {
      // Tool / subprocess results become model input
      input_tokens += content_tokens;

      // Also count the tool_call_id and name metadata fields
      const tool_call_id = message.tool_call_id || null;
      const tool_name = message.name || null;
      if (tool_call_id) {
        input_tokens += _estimate_text_tokens(
          String(tool_call_id),
          token_multiplier
        );
      }
      if (tool_name) {
        input_tokens += _estimate_text_tokens(
          String(tool_name),
          token_multiplier
        );
      }
    } else {
      // system, user, and any other roles
      input_tokens += content_tokens;
    }

    // ---- tool_calls tokens (assistant messages only) ----
    const tool_calls = message.tool_calls || null;
    if (tool_calls && Array.isArray(tool_calls)) {
      for (const tc of tool_calls) {
        const tc_tokens = _estimate_tool_call_tokens(tc, token_multiplier);
        output_tokens += tc_tokens;
        input_tokens += tc_tokens; // tool-call definitions are also part of context
      }
    }
  }

  // ---- reasoning / thinking history ----
  if (reasoning_history && typeof reasoning_history === "string") {
    const reasoning_tokens = _estimate_text_tokens(
      reasoning_history,
      token_multiplier
    );
    output_tokens += reasoning_tokens;
  }

  return {
    input_tokens: Math.floor(input_tokens),
    output_tokens: Math.floor(output_tokens),
    total_tokens: Math.floor(input_tokens + output_tokens),
  };
}
