# Agent Guidelines — Tool Usage & Conventions

## 1. Path conventions

All tool paths are relative to the `chatbot/` directory (the project root). The
runtime automatically sets the working directory correctly. Prefer relative paths
(`helper.py`, `docs/agents.md`) over absolute paths.

## 2. Tool consent model

Three tools require explicit user consent (`y/n` prompt) before executing:

| Tool | Why |
|---|---|
| `execute_terminal_command` | Arbitrary shell execution |
| `patch_file` | Mutates source files |
| `fetch_url` | Makes network requests |

The other three (`read_file_chunk`, `get_project_tree`, `search_web`) run
immediately and are read-only / non-destructive.

When approving terminal commands: the user's shell is **Windows PowerShell**.
Use `Remove-Item`, `Get-ChildItem`, `Set-Content`, etc. — not Unix commands.

## 3. File encoding — always UTF-8

When creating/editing files via terminal, always use `-Encoding UTF8`:

```powershell
Set-Content -Path some_file.py -Encoding UTF8 -Value '...'
```

Avoid em dashes, smart quotes, and other non-ASCII characters in source files.
Prefer plain ASCII: `--`, `"`, `'`.

## 4. Do NOT read or expose `.env`

The `.env` file contains API keys. Never read it, log it, or include it in
responses. It is git-ignored.

## 5. Stale `.pyc` caches

If imports misbehave after code changes, clear bytecode caches:

```powershell
Remove-Item -Recurse -Force __pycache__ -ErrorAction SilentlyContinue
```

## 6. PowerShell quick reference

| Task | PowerShell |
|---|---|
| List files | `Get-ChildItem` |
| Write file | `Set-Content -Path ... -Encoding UTF8` |
| Read file | `Get-Content ...` |
| Remove dir | `Remove-Item -Recurse -Force ...` |
| Redirect stderr | `2>&1` at end of command |
| Line continuation | backtick `` ` `` (not `\`) |
| Environment var | `$env:VAR_NAME` |
