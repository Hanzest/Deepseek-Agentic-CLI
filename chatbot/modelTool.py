import subprocess

# Define the tool schema for the OpenAI API
terminal_tool_schema = {
    "type": "function",
    "function": {
        "name": "execute_terminal_command",
        "description": "Executes a shell/bash command on the user's terminal. Use this to interact with the system.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash/shell command to execute."
                }
            },
            "required": ["command"]
        }
    }
}

def execute_terminal_command(command: str) -> str:
    """
    Executes a terminal command after requesting explicit user consent.
    Returns the stdout/stderr string.
    """
    print(f"\n\033[93m[Tool Execution Alert] The model wishes to run the following command:\033[0m")
    print(f"> {command}")
    
    consent = input("\033[96mDo you approve this execution? (y/n): \033[0m").strip().lower()
    
    if consent == 'y':
        try:
            # Capture output and errors natively
            result = subprocess.run(["powershell", "-Command", command], capture_output=True, text=True)
            output = result.stdout if result.stdout else result.stderr
            
            if not output:
                output = "Command executed successfully with no output."
            
            print(f"\033[92m[Execution Result]:\033[0m\n{output}")    
            return output
        except Exception as e:
            error_msg = f"Error executing command: {str(e)}"
            print(f"\033[91m{error_msg}\033[0m")
            return error_msg
    else:
        denial_msg = "User denied execution of the command."
        print(f"\033[91m{denial_msg}\033[0m")
        return denial_msg