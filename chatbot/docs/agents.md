# Agent Guidelines — Avoid Errors & Bugs

## 1. Always run from project root

```powershell
cd K:\Khanhs\Study\Projects\2026\Deepseek_Chatbot\chatbot
```

Working-directory mistakes are the #1 source of `ModuleNotFoundError`.

## 2. File encoding — always UTF-8

When creating/editing files, always use `-Encoding UTF8`:

```powershell
Set-Content -Path some_file.py -Encoding UTF8 -Value '...'
```

**Never** use em dashes (`—`), smart quotes, or other non-ASCII characters in Python source files unless you also add `# -*- coding: utf-8 -*-` at the top. Prefer plain ASCII (`--`, `"`, `'`).

## 3. Do NOT read or expose `.env`

The `.env` file contains API keys. Never `cat`/`Get-Content` it, never include it in responses, never commit it.

## 4. Beware of stale `.pyc` caches

If imports behave weirdly after code changes, clear the cache:

```powershell
Remove-Item -Recurse -Force __pycache__ -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force tests\__pycache__ -ErrorAction SilentlyContinue
```

## 5. PowerShell ≠ Bash

| Task | PowerShell |
|---|---|
| List files | `Get-ChildItem` (not `ls` for scripts) |
| Write file | `Set-Content -Path ... -Encoding UTF8` |
| Read file | `Get-Content ...` |
| Remove dir | `Remove-Item -Recurse -Force ...` |
| Redirect stderr | `2>&1` at end of command |
| Line continuation | backtick `` ` `` (not `\`) |
