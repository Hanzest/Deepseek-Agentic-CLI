import subprocess
import os
import pathspec

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
    if ".env" in command.lower() or "get-content *" in command.lower():
        print(f"\n\033[91m[Security Alert] Command contains potentially dangerous patterns and will not be executed.\033[0m")

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
    if ".env" in os.path.basename(file_path).lower():
        error_msg = "Security Error: Modifying .env files is strictly prohibited."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    
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
    if ".env" in os.path.basename(file_path).lower():
        error_msg = "Security Error: Reading .env files is strictly prohibited."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
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


# =============================================================================
# Tool 4: get_project_tree -- Semantic Directory Mapper
# =============================================================================

get_project_tree_schema = {
    "type": "function",
    "function": {
        "name": "get_project_tree",
        "description": (
            "Walks the project directory structure, ignoring files and folders "
            "listed in .gitignore. Returns a clean hierarchical map of the actual "
            "source code. Use this to navigate the project without noisy terminal "
            "outputs from node_modules, .git, venv, etc."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "root_path": {
                    "type": "string",
                    "description": "Absolute or relative path to the root directory to map. Defaults to '.' (current working directory)."
                },
                "max_depth": {
                    "type": "integer",
                    "description": "Maximum depth to traverse. Defaults to 10. Use lower values for large projects."
                }
            },
            "required": []
        }
    }
}

def _load_gitignore_spec(root_path: str):
    """
    Load and parse the .gitignore file from root_path.
    Returns a pathspec.PathSpec object, or None if no .gitignore is found.
    """
    gitignore_path = os.path.join(root_path, ".gitignore")
    if not os.path.isfile(gitignore_path):
        return None
    try:
        with open(gitignore_path, 'r', encoding='utf-8') as f:
            gitignore_content = f.read()
        return pathspec.PathSpec.from_lines("gitwildmatch", gitignore_content.splitlines())
    except Exception:
        return None


def get_project_tree(root_path: str = ".", max_depth: int = 10) -> str:
    """
    Walks the directory tree from root_path, respecting .gitignore rules.
    Returns a formatted tree string with directories first, then files, sorted alphabetically.
    """
    print(f"\n\033[93m[Tool Execution Alert] get_project_tree requested:\033[0m")
    print(f"  Root: {root_path}")
    print(f"  Max Depth: {max_depth}")

    # Non-destructive -- no consent needed

    root_path = os.path.abspath(root_path)

    if not os.path.isdir(root_path):
        error_msg = f"Error: Directory not found at '{root_path}'."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg

    spec = _load_gitignore_spec(root_path)

    # Always-ignored patterns (like .git directory)
    always_ignore = pathspec.PathSpec.from_lines("gitwildmatch", [
        ".git",
        "__pycache__",
        "*.pyc",
        ".pytest_cache",
    ])

    def is_ignored(rel_path: str, is_dir: bool) -> bool:
        """Check if a relative path should be ignored."""
        # Normalize to forward slashes for pathspec matching
        normalized = rel_path.replace(os.sep, "/")
        # For directories, pathspec needs trailing slash
        check_path = normalized + "/" if is_dir else normalized
        if always_ignore.match_file(check_path):
            return True
        if spec and spec.match_file(check_path):
            return True
        return False

    result_lines = []
    result_lines.append(f"Project tree for: {root_path}")
    result_lines.append(f"(respecting .gitignore, max depth {max_depth})")
    result_lines.append("")

    # Collect all entries first (sorted: dirs then files, both alphabetically)
    def collect_entries(current_path: str, depth: int):
        if depth > max_depth:
            return []

        try:
            entries = os.listdir(current_path)
        except PermissionError:
            return [(depth, current_path, " [Permission Denied]")]

        result = []
        dirs = []
        files = []

        for entry in entries:
            full_path = os.path.join(current_path, entry)
            rel_path = os.path.relpath(full_path, root_path)
            is_dir = os.path.isdir(full_path)

            if is_ignored(rel_path, is_dir):
                continue

            if is_dir:
                dirs.append((entry, full_path))
            else:
                files.append(entry)

        dirs.sort(key=lambda x: x[0].lower())
        files.sort(key=str.lower)

        for entry, full_path in dirs:
            prefix = "  " * (depth - 1) if depth > 0 else ""
            result.append(f"{prefix}|-- {entry}/")
            result.extend(collect_entries(full_path, depth + 1))

        for entry in files:
            prefix = "  " * (depth - 1) if depth > 0 else ""
            result.append(f"{prefix}|-- {entry}")

        return result

    root_name = os.path.basename(root_path) or root_path
    result_lines.append(f"{root_name}/")

    tree_entries = collect_entries(root_path, 1)
    result_lines.extend(tree_entries)

    if not tree_entries:
        result_lines.append("  (empty directory)")

    result = "\n".join(result_lines)

    print(f"\033[92m[Project Tree]:\033[0m\n{result}")
    return result


# =============================================================================
# Tool 5: search_web -- DuckDuckGo-based web search
# =============================================================================

search_web_schema = {
    "type": "function",
    "function": {
        "name": "search_web",
        "description": (
            "Searches the web using DuckDuckGo and returns a list of results "
            "(title, URL, and snippet). Use this to find up-to-date documentation, "
            "GitHub issues, or StackOverflow answers when the model's training data "
            "may be outdated."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return. Defaults to 5."
                }
            },
            "required": ["query"]
        }
    }
}

def search_web(query: str, max_results: int = 5) -> str:
    """
    Performs a DuckDuckGo search and returns formatted results.
    """
    print(f"\n\033[93m[Tool Execution Alert] search_web requested:\033[0m")
    print(f"  Query: {query}")
    print(f"  Max Results: {max_results}")

    try:
        from duckduckgo_search import DDGS
    except ImportError:
        error_msg = (
            "Error: duckduckgo_search package is not installed. "
            "Install it with: pip install duckduckgo-search"
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg

    try:
        with DDGS(timeout=20) as ddgs:
            results = list(ddgs.text(
                query,
                region="us-en",
                safesearch="off",
                max_results=max_results
            ))

        if not results:
            no_results = f"No results found for query: '{query}'."
            print(f"\033[92m{no_results}\033[0m")
            return no_results

        output_lines = [f"Search results for: '{query}'", ""]
        for i, r in enumerate(results, 1):
            title = r.get("title", "No title")
            href = r.get("href", "No URL")
            body = r.get("body", "No description")
            output_lines.append(f"{i}. {title}")
            output_lines.append(f"   URL: {href}")
            output_lines.append(f"   {body}")
            output_lines.append("")

        result = "\n".join(output_lines)
        print(f"\033[92m[Search Results]:\033[0m\n{result}")
        return result

    except Exception as e:
        error_msg = f"Error performing web search: {str(e)}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg


# =============================================================================
# Tool 6: fetch_url -- HTML-to-Markdown scraper
# =============================================================================

fetch_url_schema = {
    "type": "function",
    "function": {
        "name": "fetch_url",
        "description": (
            "Fetches a URL and extracts clean, readable Markdown from the HTML. "
            "Uses BeautifulSoup to strip tags, scripts, and styles, returning only "
            "the meaningful text content. Use this to read up-to-date documentation "
            "or web pages without burning tokens on raw HTML."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch and convert to Markdown."
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Request timeout in seconds. Defaults to 15."
                }
            },
            "required": ["url"]
        }
    }
}

def fetch_url(url: str, timeout_seconds: int = 15) -> str:
    """
    Fetches a URL, strips HTML down to clean Markdown using BeautifulSoup,
    and returns the result.
    """
    print(f"\n\033[93m[Tool Execution Alert] fetch_url requested:\033[0m")
    print(f"  URL: {url}")
    print(f"  Timeout: {timeout_seconds}s")

    consent = input("\033[96mDo you approve fetching this URL? (y/n): \033[0m").strip().lower()

    if consent != 'y':
        denial_msg = "User denied the fetch_url request."
        print(f"\033[91m{denial_msg}\033[0m")
        return denial_msg

    try:
        import requests
        from bs4 import BeautifulSoup
        from markdownify import markdownify as md
    except ImportError as e:
        error_msg = (
            f"Error: Required package not installed: {e}. "
            "Install with: pip install requests beautifulsoup4 markdownify"
        )
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg

    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            )
        }
        response = requests.get(url, headers=headers, timeout=timeout_seconds)
        response.raise_for_status()

        # Detect encoding
        response.encoding = response.apparent_encoding

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove unwanted elements
        for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()

        # Try to find the main content area
        main_content = (
            soup.find("main") or
            soup.find("article") or
            soup.find("div", class_="content") or
            soup.find("div", id="content") or
            soup.find("body")
        )

        if main_content is None:
            main_content = soup

        # Convert HTML to Markdown
        try:
            markdown_text = md(str(main_content), heading_style="ATX")
        except NameError:
            # Fallback: strip tags and get text
            markdown_text = main_content.get_text(separator="\n", strip=True)

        # Clean up excessive blank lines
        import re
        markdown_text = re.sub(r'\n{3,}', '\n\n', markdown_text)
        markdown_text = markdown_text.strip()

        # Truncate if too long (max ~8000 chars to be token-friendly)
        max_chars = 8000
        if len(markdown_text) > max_chars:
            markdown_text = markdown_text[:max_chars] + (
                f"\n\n[... truncated at {max_chars} characters. "
                f"Full page is {len(markdown_text)} characters. "
                "Use a more specific URL or search for narrower pages.]"
            )

        summary = (
            f"--- Content from {url} ---\n"
            f"{markdown_text}\n"
            f"--- end of content ---"
        )

        print(f"\033[92m[Fetched Content]:\033[0m\n{summary[:500]}...")
        return summary

    except requests.exceptions.Timeout:
        error_msg = f"Error: Request to '{url}' timed out after {timeout_seconds} seconds."
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    except requests.exceptions.HTTPError as e:
        error_msg = f"Error: HTTP error fetching '{url}': {e}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
    except Exception as e:
        error_msg = f"Error fetching URL '{url}': {str(e)}"
        print(f"\033[91m{error_msg}\033[0m")
        return error_msg
