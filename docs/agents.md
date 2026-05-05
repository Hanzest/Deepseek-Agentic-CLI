# Agent Guidelines — Tool Usage & Conventions

## 1. Path conventions

All tool paths are relative to the project root (the top-level `Deepseek_Chatbot/`
directory). The runtime automatically sets the working directory correctly via
`os.chdir(_SCRIPT_DIR)` in `mainAPI.py`. Prefer relative paths (`helper.py`,
`docs/agents.md`) over absolute paths.

## 2. Tool consent model

Consent is tiered by tool and content:

| Tool | Consent Rule |
|---|---|
| `fetch_url` | Always requires explicit `y/n` consent |
| `execute_terminal_command` | **Auto-approved** normally; requires `y/n` consent only if the command references `.env` |
| `patch_file` | **Auto-approved** normally; requires `y/n` consent only if the target file is `.env` |
| `read_file_chunk` | Runs immediately (read-only); `.env` is **auto-blocked** |
| `get_project_tree`, `search_web` | Runs immediately (read-only / non-destructive) |

When approving terminal commands: the user's shell is **Windows PowerShell**.
Use `Remove-Item`, `Get-ChildItem`, `Set-Content`, etc. — not Unix commands.

## 3. File encoding — always UTF-8

When creating/editing files via terminal, always use `-Encoding UTF8`:

```powershell
Set-Content -Path some_file.py -Encoding UTF8 -Value '...'
```

Avoid em dashes, smart quotes, and other non-ASCII characters in source files.
Prefer plain ASCII: `--`, `"`, `'`.

## 4. `.env` file security policy

The `.env` file contains API keys and is git-ignored. Access is handled per
tool as follows:

| Tool | Policy |
|------|--------|
| `read_file_chunk` | **Auto-blocked** -- cannot read `.env` at all |
| `execute_terminal_command` | **Auto-approved** normally; requires explicit `y/n` consent if the command references `.env` |
| `patch_file` | **Auto-approved** normally; requires explicit `y/n` consent if the target file is `.env` |

Never log `.env` content or include it in responses to the user.

## 5. Stale `.pyc` caches

If imports misbehave after code changes, clear bytecode caches:

```powershell
Remove-Item -Recurse -Force __pycache__ -ErrorAction SilentlyContinue
```

## 6. PowerShell quick reference

| Task | PowerShell |
|---|---|
| List files | `Get-ChildItem` |
| Write file (single line) | `Set-Content -Path ... -Encoding UTF8 -Value '...'` |
| Write file (multi-line) | Use a variable: `$content = @'` newline `...` newline `'@` then `Set-Content -Path ... -Encoding UTF8 -Value $content` (PowerShell has **no heredoc**; do not use `cat > file << EOF`) |
| Read file | `Get-Content ...` |
| Remove dir | `Remove-Item -Recurse -Force ...` |
| Redirect stderr | `2>&1` at end of command |
| Line continuation | backtick `` ` `` (not `\`) |
| Environment var | `$env:VAR_NAME` |

## 7. Implementations style

- Do not write long dash, ---, ===, or ***, emojis, or long hyphens.

## 8. Plan Mode vs Agent Mode

The system starts in **Plan Mode** by default. The user can toggle modes at any time:

| Command | Effect |
|---------|--------|
| `/plan` | Switch to Plan Mode — file mutation (`patch_file`, `write_or_create_file`) and system execution (`execute_terminal_command`) are blocked. Writes to `artifacts/` folder are exempt. |
| `/agent` | Switch to Agent Mode — all tools are available. |

Sub-agents inherit the current mode from the manager. A sub-agent spawned in Plan Mode cannot bypass the gate.

The mode state lives in `lib/orchestrator.js` as `SessionContext.agentMode` (an object property, not a bare primitive).



