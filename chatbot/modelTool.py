import subprocess

# =============================================================================
# Tool 1: execute_terminal_command
# =============================================================================

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
            result = subprocess.run(
                ["powershell", "-Command", command], 
                capture_output=True, 
                text=True,
                timeout=15 
            )
            output = result.stdout if result.stdout else result.stderr
            
            if not output:
                output = "Command executed successfully with no output."
            
            print(f"\033[92m[Execution Result]:\033[0m\n{output}")    
            return output
            
        except subprocess.TimeoutExpired:
            error_msg = "Error: Command execution timed out after 15 seconds. Process terminated."
            print(f"\033[91m{error_msg}\033[0m")
            return error_msg
            
        except Exception as e:
            error_msg = f"Error executing command: {str(e)}"
            print(f"\033[91m{error_msg}\033[0m")
            return error_msg
    else:
        denial_msg = "User denied execution of the command."
        print(f"\033[91m{denial_msg}\033[0m")
        return denial_msg


# =============================================================================
# Tool 2: patch_file -- Targeted file editing
# =============================================================================

patch_file_schema = {
    "type": "function",
    "function": {
        "name": "patch_file",
        "description": (
            "Performs a targeted edit on a file by searching for a string and replacing it. "
            "If the search_string is found exactly once, it is replaced with replace_string. "
            "If found multiple times, the tool reports the line numbers and asks for a more "
            "specific search string. Use this instead of rewriting entire files for small changes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Absolute or relative path to the file to edit."
                },
                "search_string": {
                    "type": "string",
                    "description": "The exact string to search for in the file. Must match exactly once."
                },
                "replace_string": {
                    "type": "string",
                    "description": "The string to replace the search_string with."
                }
            },
            "required": ["file_path", "search_string", "replace_string"]
        }
    }
}

def patch_file(file_path: str, search_string: str, replace_string: str) -> str:
    """
    Searches for search_string in the file at file_path. If exactly one match is found,
    replaces it with replace_string. If zero or multiple matches are found, reports the
    issue and returns without modifying the file.
    """
    print(f"\n\033[93m[Tool Execution Alert] patch_file requested:\033[0m")
    print(f"  File: {file_path}")
    print(f"  Search: {repr(search_string)}")
    print(f"  Replace: {repr(replace_string)}")
    
    consent = input("\033[96mDo you approve this edit? (y/n): \033[0m").strip().lower()
    
    if consent != 'y':
        denial_msg = "User denied the patch_file edit."
        print(f"\033[91m{denial_msg}\033[0m")
        return denial_msg
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
    except FileNotFoundError:
        error_msg = f"Error: File not found at '{file_path}'."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    except Exception as e:
        error_msg = f"Error reading file '{file_path}': {str(e)}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
    occurrences = original_content.count(search_string)
    
    if occurrences == 0:
        error_msg = (
            f"Error: search_string not found in '{file_path}'. "
            f"No changes were made. Verify the search string and try again."
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
    if occurrences > 1:
        # Find and report all line numbers where the string appears
        lines = original_content.split('\n')
        line_numbers = []
        for i, line in enumerate(lines, start=1):
            if search_string in line:
                line_numbers.append(i)
        
        error_msg = (
            f"Error: search_string found {occurrences} times in '{file_path}' "
            f"(lines: {line_numbers}). Please provide a more specific search_string "
            f"that matches exactly once. No changes were made."
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
    # Exactly one match -- perform the replacement
    new_content = original_content.replace(search_string, replace_string, 1)
    
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        success_msg = (
            f"Successfully patched '{file_path}'. "
            f"Replaced 1 occurrence of the search string."
        )
        print(f"\033[92m{success_msg}\033[0m")
        return success_msg
    except Exception as e:
        error_msg = f"Error writing to file '{file_path}': {str(e)}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg


# =============================================================================
# Tool 3: read_file_chunk -- Chunked file reader
# =============================================================================

read_file_chunk_schema = {
    "type": "function",
    "function": {
        "name": "read_file_chunk",
        "description": (
            "Reads a range of lines from a file. Use this to inspect specific sections "
            "of large files without loading the entire file into context. Returns the "
            "requested lines with line numbers prefixed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Absolute or relative path to the file to read."
                },
                "start_line": {
                    "type": "integer",
                    "description": "The first line number to read (1-indexed, inclusive)."
                },
                "end_line": {
                    "type": "integer",
                    "description": "The last line number to read (1-indexed, inclusive)."
                }
            },
            "required": ["file_path", "start_line", "end_line"]
        }
    }
}

def read_file_chunk(file_path: str, start_line: int, end_line: int) -> str:
    """
    Reads lines start_line through end_line (inclusive, 1-indexed) from file_path.
    Returns the content with line numbers prefixed.
    """
    print(f"\n\033[93m[Tool Execution Alert] read_file_chunk requested:\033[0m")
    print(f"  File: {file_path}")
    print(f"  Lines: {start_line} - {end_line}")
    
    # File reading is non-destructive -- no consent needed, but we still inform the user
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
    except FileNotFoundError:
        error_msg = f"Error: File not found at '{file_path}'."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    except Exception as e:
        error_msg = f"Error reading file '{file_path}': {str(e)}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
    total_lines = len(all_lines)
    
    # Validate line range
    if start_line < 1:
        start_line = 1
    if end_line > total_lines:
        end_line = total_lines
    if start_line > total_lines:
        error_msg = (
            f"Error: start_line ({start_line}) exceeds total lines in file ({total_lines}). "
            f"No content returned."
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    if start_line > end_line:
        error_msg = (
            f"Error: start_line ({start_line}) is greater than end_line ({end_line}). "
            f"No content returned."
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
    # Extract the requested chunk (convert from 1-indexed to 0-indexed)
    chunk_lines = all_lines[start_line - 1 : end_line]
    
    # Format output with line numbers
    output_lines = []
    for i, line in enumerate(chunk_lines, start=start_line):
        # Remove trailing newline from file line, then add our own formatting
        output_lines.append(f"{i:>6}| {line.rstrip('\n\r')}")
    
    result = '\n'.join(output_lines)
    
    # Add a summary header
    summary = (
        f"--- {file_path} : lines {start_line}-{end_line} of {total_lines} ---\n"
        f"{result}\n"
        f"--- end of chunk ---"
    )
    
    print(f"\033[92m[File Chunk]:\033[0m\n{summary}")
    return summary
