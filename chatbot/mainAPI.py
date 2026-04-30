import os
import json
from helper import startChat, estimateTokens, thinkingToggle
from openai import OpenAI
from dotenv import load_dotenv

# Import the tool schema and execution function
from modelTool import terminal_tool_schema, execute_terminal_command

load_dotenv()

# Get from .env file
client = OpenAI(
    api_key=os.environ.get('MODEL_API_KEY'),
    base_url=os.environ.get('MODEL_BASE_URL')
)

HYPERPARAMETERS = {
    "token_limit": 32768,
    "token_multiplier": 1.5,
    "stream": True,
    "reasoning_effort": "high",
    "system_prompt": "You are a professional software engineer. "
    + "Ensure maintainability and readability in your responses. "
    + "Use tools when necesssary to provide accurate and efficient answers. "
    + "User is using Windows Powershell as their terminal.",
}

def printStreamResponse(response):
    """
    Print the response from the model in a streaming manner, showing reasoning content if enabled.
    Aggregates and returns reasoning content, standard content, and tool calls.
    """
    reasoning_content = ""  
    content = ""
    tool_calls = {} # Used to aggregate streaming tool call chunks
    
    firstThinking = False
    firstContent = False
    
    for chunk in response:
        delta = chunk.choices[0].delta
        
        # 1. Handle Reasoning Content
        if HYPERPARAMETERS["extra_body"] == {"thinking": {"type": "enabled"}} and getattr(delta, 'reasoning_content', None):
            if not firstThinking:
                print("\n[Reasoning Content]: ")
                firstThinking = True
            chunk_reasoning_content = delta.reasoning_content
            reasoning_content += chunk_reasoning_content
            print(chunk_reasoning_content, end='', flush=True)
            
        # 2. Handle Standard Content
        elif getattr(delta, 'content', None) and delta.content != "":
            if not firstContent:
                print("\n\n[Model Output]: ")
                firstContent = True
            chunk_content = delta.content
            content += chunk_content
            print(chunk_content, end='', flush=True)
            
        # 3. Handle Tool Calls
        elif getattr(delta, 'tool_calls', None):
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in tool_calls:
                    tool_calls[idx] = {
                        "id": tc.id, 
                        "type": "function", 
                        "function": {"name": tc.function.name, "arguments": ""}
                    }
                if tc.function.arguments:
                    tool_calls[idx]["function"]["arguments"] += tc.function.arguments
    
    print("\n")
    
    # Convert tool_calls dict to list for the OpenAI messages array
    tool_calls_list = list(tool_calls.values()) if tool_calls else None
    return reasoning_content, content, tool_calls_list

def callModel(model_name, token_limit, messages, stream, extra_body, reasoning_effort, tools=None):
    kwargs = {
        "model": model_name,
        "messages": messages,
        "max_tokens": token_limit,
        "stream": stream,
    }
    
    if tools:
        kwargs["tools"] = tools

    if extra_body != {"thinking": {"type": "disabled"}}:
        kwargs["extra_body"] = extra_body
        kwargs["reasoning_effort"] = reasoning_effort
    else:
        kwargs["extra_body"] = extra_body

    return client.chat.completions.create(**kwargs)

def multiTurnLoop(model_name):
    stop = False
    reasoning_history = ""
    messages = [{"role": "system", "content": HYPERPARAMETERS["system_prompt"]}]
    available_tools = [terminal_tool_schema]

    while not stop:
        # Optimization: Sliding Context Window
        # If the total tokens exceed 80% of the limit, remove older messages (keeping the system prompt)
        token_estimates = estimateTokens(messages, reasoning_history, HYPERPARAMETERS["token_multiplier"])
        while token_estimates["total_tokens"] > (HYPERPARAMETERS["token_limit"] * 0.8) and len(messages) > 3:
            messages.pop(1) # Remove the oldest user message
            messages.pop(1) # Remove the corresponding assistant message
            token_estimates = estimateTokens(messages, reasoning_history, HYPERPARAMETERS["token_multiplier"])
        print(f"System:\n-Input Tokens: {token_estimates['input_tokens']}.\n-Output Tokens: {token_estimates['output_tokens']}\n-Total Tokens: {token_estimates['total_tokens']}.")
        
        user_input = input("Enter your message (type 'exit' to quit):\n")
        if user_input.lower() == 'exit':
            stop = True
            continue
            
        messages.append({"role": "user", "content": user_input})
    
        # Inner loop to handle potential back-and-forth tool executions
        while True:
            # Calculate available tokens safely
            available_tokens = HYPERPARAMETERS["token_limit"] - token_estimates["total_tokens"]
            
            if available_tokens <= 0:
                print("\n\033[91m[Error] Context window exceeded. Please restart the conversation to continue.\033[0m")
                break # Breaks the inner loop to prevent the crash

            response = callModel(
                model_name=model_name,
                token_limit=HYPERPARAMETERS["token_limit"] - token_estimates["total_tokens"],
                messages=messages,
                stream=HYPERPARAMETERS["stream"],
                extra_body=HYPERPARAMETERS["extra_body"],
                reasoning_effort=HYPERPARAMETERS["reasoning_effort"],
                tools=available_tools
            )

            reasoning_content, content, tool_calls = printStreamResponse(response)
            
            # Optimization: Standardised Message History
            # Not passing reasoning_content into history
            assistant_message = {"role": "assistant"}
            if content: assistant_message["content"] = content
            if tool_calls: assistant_message["tool_calls"] = tool_calls
            messages.append(assistant_message)
            
            # Execute Tools if requested
            if tool_calls:
                for tc in tool_calls:
                    func_name = tc["function"]["name"]
                    func_args = json.loads(tc["function"]["arguments"])
                    
                    if func_name == "execute_terminal_command":
                        result = execute_terminal_command(func_args.get("command", ""))
                    else:
                        result = f"Error: Tool '{func_name}' not found."
                        
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "name": func_name,
                        "content": result
                    })
                # Loop back up to let the model respond to the tool execution results
                continue 
            else:
                # No tool calls made; break inner loop to wait for next user input
                break 

if __name__ == "__main__":
    model_name = startChat()
    extra_body = thinkingToggle()
    HYPERPARAMETERS["extra_body"] = extra_body
    multiTurnLoop(model_name)