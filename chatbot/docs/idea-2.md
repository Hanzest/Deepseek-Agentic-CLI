### 1. Web Search and Markdown Scraper (`search_web` & `fetch_url`)
When the model encounters an error with a modern library, its internal training data might be outdated. Trying to run `Invoke-WebRequest` in PowerShell returns raw HTML, which is bloated with tags and scripts, completely destroying the context window.
*   **The Tool:** Integrate a lightweight search API (like DuckDuckGo, Tavily, or Serper) and a URL fetcher that uses `BeautifulSoup` to strip HTML and return clean, readable Markdown.
*   **Why it improves quality:** It gives the agent a clean, token-efficient way to read up-to-date documentation, GitHub issues, or StackOverflow answers without getting confused by DOM elements.

### 2. Semantic Directory Mapper (`get_project_tree`)
Finding files via native terminal commands can be noisy, especially in projects with `node_modules`, `venv`, or `.git` folders.
*   **The Tool:** A custom Python script that walks the directory structure but strictly ignores files and folders listed in the `.gitignore`. 
*   **Why it improves speed:** The model gets a clean, hierarchical map of the actual source code immediately, allowing it to navigate the project without wasting turns executing and reading messy terminal outputs.

Implementing just the targeted file editor and chunked reader will transform the CLI from a simple terminal wrapper into a highly capable, context-aware coding assistant. 

Which of these functional areas—file manipulation or web retrieval—do you feel is the most critical bottleneck for your workflow right now?