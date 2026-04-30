# Agent Guidelines — Avoid Errors & Bugs

## 1. Always run from project root

```powershell
cd K:\Khanhs\Study\Projects\2026\Deepseek_Chatbot\chatbot
```

Working-directory mistakes are the #1 source of `ModuleNotFoundError`.

## 2. Use `python -m pytest`, not bare `pytest`

```powershell
# CORRECT
python -m pytest tests/test_estimate_tokens.py -v

# WRONG — may pick up a different Python/pytest
pytest tests/test_estimate_tokens.py -v
```

## 3. File encoding — always UTF-8

When creating/editing files, always use `-Encoding UTF8`:

```powershell
Set-Content -Path some_file.py -Encoding UTF8 -Value '...'
```

**Never** use em dashes (`—`), smart quotes, or other non-ASCII characters in Python source files unless you also add `# -*- coding: utf-8 -*-` at the top. Prefer plain ASCII (`--`, `"`, `'`).

## 4. Do NOT read or expose `.env`

The `.env` file contains API keys. Never `cat`/`Get-Content` it, never include it in responses, never commit it.

## 5. Beware of stale `.pyc` caches

If imports behave weirdly after code changes, clear the cache:

```powershell
Remove-Item -Recurse -Force __pycache__ -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force tests\__pycache__ -ErrorAction SilentlyContinue
```

## 6. Test after every code change

```powershell
python -m pytest tests/test_estimate_tokens.py -v
```

All 33 tests must stay green. If any fail, fix before proceeding.

## 7. Known fragile imports in `mainAPI.py`

The following imports are unused/broken and should not be touched unless explicitly asked:

```python
from sympy import content      # sympy has no `content` — unused
from urllib import response     # unused
from xml.parsers.expat import model  # unused
```

They do not affect `helper.py` or the tests. Do not remove them without asking — `mainAPI.py` may be intentionally dirty WIP.

## 8. PowerShell ≠ Bash

| Task | PowerShell |
|---|---|
| List files | `Get-ChildItem` (not `ls` for scripts) |
| Write file | `Set-Content -Path ... -Encoding UTF8` |
| Read file | `Get-Content ...` |
| Remove dir | `Remove-Item -Recurse -Force ...` |
| Redirect stderr | `2>&1` at end of command |
| Line continuation | backtick `` ` `` (not `\`) |

## 9. Use `assertAlmostEqual` for float token estimates

Token math involves floating division. Never use `assertEqual` on raw `_estimate_*` results — use `assertAlmostEqual`. For `estimateTokens` results (which are `int`), `assertEqual` is fine.

## 10. Token multiplier values

- **Tests**: use `1.6`
- **Production** (`mainAPI.py` `HYPERPARAMETERS`): uses `1.5`

This difference is intentional — tests use 1.6 to catch regressions in multiplier propagation. Do not "align" them.
