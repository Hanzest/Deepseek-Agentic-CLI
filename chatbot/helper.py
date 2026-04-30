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

def estimateTokens(messages, reasoning_history="", token_multiplier=1.6):
    """
    Calculate input and output tokens safely.
    Handles dynamic content types, massive terminal strings, and raw objects.
    """
    input_tokens = 0
    output_tokens = 0

    for message in messages:
        # 1. Safely handle both Dictionaries and Raw Objects
        content = message.get("content") if isinstance(message, dict) else getattr(message, "content", None)
        role = message.get("role") if isinstance(message, dict) else getattr(message, "role", None)
        
        if content:
            token_count = 0
            
            # 2. Handle Multimodal/List content
            if isinstance(content, list):
                content_str = " ".join([str(item) for item in content])
                token_count = (len(content_str) / 4) * token_multiplier
                
            # 3. Handle Standard Strings safely (Prevent MemoryError on massive tool outputs)
            elif isinstance(content, str):
                if len(content) > 10000:
                    # Use fast character-based estimation for giant terminal outputs
                    token_count = (len(content) / 4) * token_multiplier
                else:
                    # Safe to use split() on smaller strings
                    token_count = len(content.split()) * token_multiplier
            
            # 4. Fallback for unexpected data types (e.g. dicts)
            else:
                token_count = (len(str(content)) / 4) * token_multiplier
                
            if role == "assistant":
                output_tokens += token_count
                input_tokens += token_count
            else:
                input_tokens += token_count
                
        # 5. Safely extract tool calls
        tool_calls = message.get("tool_calls") if isinstance(message, dict) else getattr(message, "tool_calls", None)
        if tool_calls:
            # Rough estimation: ~50 tokens overhead per tool call payload
            tool_tokens = 50 * len(tool_calls)
            output_tokens += tool_tokens
            input_tokens += tool_tokens

    if reasoning_history and isinstance(reasoning_history, str):
        output_tokens += len(reasoning_history.split()) * token_multiplier

    return {
        "input_tokens": int(input_tokens),
        "output_tokens": int(output_tokens),
        "total_tokens": int(input_tokens + output_tokens)
    }