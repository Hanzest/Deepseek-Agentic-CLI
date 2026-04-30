def startChat():
    print("Choose a model to interact with:")
    print("1. deepseek-v4-flash")
    print("2. deepseek-v4-pro")

    model_choice = input("Enter your choice (1 or 2): ")

    if model_choice == "1":
        model_name = "deepseek-v4-flash"
    elif model_choice == "2":
        model_name = "deepseek-v4-pro"
    else:
        print("Invalid choice. Using deepseek-v4-flash by default.")
        model_name = "deepseek-v4-flash"

    return model_name


def thinkingToggle():
    print("Choose reasoning content option:")
    print("1. Enable")
    print("2. Disable")

    choice = input("Enter your choice (1 or 2): ")

    if choice == "1":
        return {"thinking": {"type": "enabled"}}
    elif choice == "2":
        return {"thinking": {"type": "disabled"}}
    else:
        print("Invalid choice. Disabling reasoning content by default.")
        return {"thinking": {"type": "disabled"}}


# ---------------------------------------------------------------------------
# Token estimation helpers
# ---------------------------------------------------------------------------

def _estimate_text_tokens(content, token_multiplier):
    """
    Estimate token count for a single piece of content.

    Handles:
      - None / empty        -> 0
      - list  (multimodal)  -> flattened string, character-based / 4
      - str   (short)       -> word-count * multiplier
      - str   (large)       -> character-based / 4 (avoids MemoryError)
      - other               -> str() then character-based / 4
    """
    if not content:
        return 0

    if isinstance(content, list):
        # Multimodal content blocks – flatten to a single string
        flat = "".join(str(item) for item in content)
        return (len(flat) / 4) * token_multiplier

    if isinstance(content, str):
        if len(content) > 10000:
            # Character-based for massive strings (e.g. terminal / subprocess output)
            return (len(content) / 4) * token_multiplier
        else:
            # Word-based for normal conversational text
            return len(content.split()) * token_multiplier

    # Fallback for unexpected types
    return (len(str(content)) / 4) * token_multiplier


def _estimate_tool_call_tokens(tool_call, token_multiplier):
    """
    Estimate token count for a single tool-call definition dict.

    A tool-call dict typically has:
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "execute_terminal_command",
          "arguments": "{\"command\": \"dir\"}"
        }
      }

    We sum estimates for the id, function name, arguments JSON, and a small
    structural overhead for the surrounding JSON boilerplate.
    """
    if not isinstance(tool_call, dict):
        return (len(str(tool_call)) / 4) * token_multiplier

    tokens = 0

    # Tool-call identifier (e.g. "call_abc123")
    tc_id = tool_call.get("id", "")
    tokens += _estimate_text_tokens(tc_id, token_multiplier)

    func = tool_call.get("function", {})
    if isinstance(func, dict):
        # Function name
        func_name = func.get("name", "")
        tokens += _estimate_text_tokens(func_name, token_multiplier)

        # Arguments (JSON string) – always use character-based for precision
        func_args = func.get("arguments", "")
        if isinstance(func_args, str) and func_args:
            tokens += (len(func_args) / 4) * token_multiplier

    # Structural overhead: ~12 tokens for the JSON keys / braces / commas
    tokens += 12

    return tokens


# ---------------------------------------------------------------------------
# Main public API
# ---------------------------------------------------------------------------

def estimateTokens(messages, reasoning_history="", token_multiplier=1.6):
    """
    Calculate input and output token estimates for a list of messages.

    Accounts for:
      - Regular message content (text, multimodal lists, huge subprocess outputs)
      - Tool-call definitions on assistant messages (function name, args, id)
      - Tool-role messages that carry subprocess / tool execution results
      - Reasoning history (chain-of-thought, thinking blocks)
    """
    input_tokens = 0
    output_tokens = 0

    for message in messages:
        role = message.get("role") if isinstance(message, dict) else getattr(message, "role", None)
        content = message.get("content") if isinstance(message, dict) else getattr(message, "content", None)

        # ---- content tokens ----
        content_tokens = _estimate_text_tokens(content, token_multiplier)

        if role == "assistant":
            # Assistant content is both output and future context
            output_tokens += content_tokens
            input_tokens += content_tokens
        elif role == "tool":
            # Tool / subprocess results become model input
            input_tokens += content_tokens

            # Also count the tool_call_id and name metadata fields
            tool_call_id = message.get("tool_call_id") if isinstance(message, dict) else getattr(message, "tool_call_id", None)
            tool_name = message.get("name") if isinstance(message, dict) else getattr(message, "name", None)
            if tool_call_id:
                input_tokens += _estimate_text_tokens(str(tool_call_id), token_multiplier)
            if tool_name:
                input_tokens += _estimate_text_tokens(str(tool_name), token_multiplier)
        else:
            # system, user, and any other roles
            input_tokens += content_tokens

        # ---- tool_calls tokens (assistant messages only) ----
        tool_calls = message.get("tool_calls") if isinstance(message, dict) else getattr(message, "tool_calls", None)
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                tc_tokens = _estimate_tool_call_tokens(tc, token_multiplier)
                output_tokens += tc_tokens
                input_tokens += tc_tokens   # tool-call definitions are also part of context

    # ---- reasoning / thinking history ----
    if reasoning_history and isinstance(reasoning_history, str):
        reasoning_tokens = _estimate_text_tokens(reasoning_history, token_multiplier)
        output_tokens += reasoning_tokens

    return {
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "total_tokens": int(input_tokens + output_tokens),
    }
