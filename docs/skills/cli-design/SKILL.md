# SKILL.md

## Metadata

- **Name:** CLI Application Design
- **Description:** Command-line interface design covering argument parsing conventions (POSIX/GNU), exit codes, stdout/stderr discipline, progress indication, configuration file paths (XDG), color output standards, shell completion, structured output modes, and pager integration.
- **Tags:** CLI, command-line, terminal, POSIX, GNU, stdout, stderr, exit-codes, shell-completion, XDG
- **Version:** 1.0.0

---

## When to Use

- **USE WHEN:** Designing a new CLI tool, adding or modifying CLI commands, implementing output formatting, handling terminal vs. piped output, designing configuration file loading, or adding shell completion or interactive progress indicators.
- **DO NOT USE FOR:** Designing web APIs (see API Design skill), GUI/desktop application design (see UI/UX skill), or internal library interfaces that are not user-facing command-line tools.

---

## Constraints & Rules

- **Exit codes must follow the sysexits convention:** `0` for success, `1` for general error, `2` for misuse (invalid flags, missing arguments). For more granularity, use sysexits.h values (`EX_USAGE`=64, `EX_DATAERR`=65, `EX_NOINPUT`=66, `EX_PROTOCOL`=76, `EX_TEMPFAIL`=75). A CLI that always exits with code 1 for every failure is un-scriptable — scripts depend on exit codes to make decisions.
- **stdout is for data, stderr is for human communication:** Pipelines consume stdout; progress bars, logs, warnings, and errors must go to stderr. A CLI that writes "Processing file 3 of 10..." to stdout breaks when piped (`|`), because the progress message becomes part of the data stream. The only thing on stdout should be the output the user requested.
- **Color and formatting must respect `NO_COLOR` and `CI` environment variables:**
  - If `NO_COLOR` is set (any value), suppress all ANSI color codes (per no-color.org).
  - If `CI` is set (any value), suppress interactive progress indicators (spinners, progress bars) — use non-interactive output (plain text, logs).
  - When output is piped (`stdout.isTTY === false`), suppress colors and progress indicators automatically — the data stream should be clean.
- **Configuration file paths must follow the XDG Base Directory specification:** Config files go to `$XDG_CONFIG_HOME` (default `~/.config/<app>/`), data files to `$XDG_DATA_HOME` (default `~/.local/share/<app>/`), cache files to `$XDG_CACHE_HOME` (default `~/.cache/<app>/`). Storing config or data in the application's install directory violates the filesystem hierarchy and breaks per-user isolation.
- **CLI flags must follow POSIX/GNU conventions:** Short flags (`-v`) for common options, long flags (`--verbose`) for all options, `--` to stop flag parsing, `-` for stdin as input file. Non-standard flag parsing (custom syntax, positional-sensitive options) breaks user expectations and shell completion.

---

## Core Principles

- **Principle of least surprise:** Users bring expectations from other CLIs (git, docker, npm, curl). Follow established conventions: `--help`, `--version`, `--verbose`, `--quiet`, `--output` for file output. Every deviation from convention increases the learning cost and error rate.
- **Silence is success, errors are visible:** A successful CLI command should produce no output unless the user explicitly requests it (`--verbose`, `--json`). Chatty success output distracts from what matters. Errors, however, must be clear, specific, and suggest corrective action.
- **Support structured output for programmatic consumption:** A `--json` flag (or `--format=json`) enables the CLI to be consumed by other tools, automation scripts, and CI pipelines. Default output is human-readable tables/lists; structured output is opt-in. The JSON schema should be documented and stable across versions.
- **Commands should be composable:** A CLI consisting of `cli subcommand action --flag` (noun-verb hierarchy) is more discoverable and composable than flat scripts. Subcommands should have clear responsibility boundaries — one task per subcommand, composable via pipes and shell scripts.
- **Progress must be non-blocking and dismissible:** Long-running operations should show progress (spinner, progress bar), but the user must be able to suppress it (`--quiet`, `CI=true`) and the progress must never interfere with piped output. Use terminal cursor control only when `stdout.isTTY`.

---

## Workflow

- **Command structure design phase — factors to consider:**
  - What is the noun-verb hierarchy? (e.g., `git remote add`, `docker container run`, `npm install` — the noun is the resource, the verb is the action)
  - What commands are most frequent? (they should require the fewest keystrokes — aliases or shorter subcommand paths for frequent operations)
  - Is there a need for `--help` output to be structured? (consider man pages for detailed reference, and concise `--help` for quick lookup)

- **Output formatting phase — factors to consider:**
  - Is the output human-readable or machine-readable? (default: human-readable tables/spaced lists; `--json` or `--format` for programmatic use)
  - Is the output being piped? (detect `!process.stdout.isTTY` and suppress colors, progress, and non-data output)
  - Are there multiple output formats to support? (json, yaml, table, plain — each serves different consumers; evaluate by the expected usage patterns)

- **Configuration loading phase — factors to consider:**
  - What is the configuration hierarchy? (CLI flags (highest) → environment variables → config file → defaults (lowest) — each level overrides the previous)
  - Where does the config file live? (XDG `$XDG_CONFIG_HOME/<app>/` with fallback to `~/.config/<app>/` — never the project directory unless explicitly specified via `--config`)
  - Is the config file format appropriate? (JSON for programmatic generation, YAML/TOML for human readability — evaluate by who will be writing configs most often)

---

## Anti-patterns

- **Progress output to stdout:** Writing `[=====>] 50%` or "Processing..." to stdout instead of stderr. The overlooked factor: when the CLI is piped, progress text corrupts the data stream — stderr is the correct channel for human-oriented output.
- **Skipping exit codes:** Returning 0 for all outcomes, or returning 1 for all failures. The overlooked factor: scripts depend on exit codes to branch behavior — a "file not found" error and a "network timeout" error should produce different exit codes so scripts can handle them differently.
- **Config files checked into the project directory:** A `.cliconfig.json` in the project root that contains user-specific settings. The overlooked factor: project-checked config files cannot vary per user, cannot stay in sync across machines, and get committed to version control — use XDG paths for user config.
- **Color-only status indicators:** Using red/green color to indicate success/failure without also adding text labels or symbols (✔/✘). The overlooked factor: colorblind users (~8% of male population), non-terminal output, and `NO_COLOR` environments all lose the color-only signal.
- **Inconsistent flag naming:** `--verbose` in one command and `--debug` in another for the same behavior, or `--port` in one place and `-p` meaning something different elsewhere. The overlooked factor: inconsistent flags create user friction and bug reports that are avoidable with a global flag convention guide.

---

## Decision Framework (Conflict Resolution)

| Priority | Principle | Rule | Example |
|----------|-----------|------|---------|
| **1** | **Data integrity in pipelines** | stdout must contain only the requested data — never status text, progress, or warnings. | Progress bars go to stderr; JSON output goes to stdout. |
| **2** | **Convention over invention** | Follow POSIX/GNU/Docker/git conventions. Users should not need to learn a new paradigm. | `--help`, `--version`, `-v`, `--verbose`, `--quiet`, `--output`. |
| **3** | **Scriptability** | Every CLI interaction must be reproducible in a non-interactive context. | `CI=true` suppresses prompts; `--json` enables programmatic consumption; exit codes are distinct per error type. |
| **4** | **Discoverability** | `--help` output must be useful without external documentation. Group related flags. | Group flags: "Output options", "Configuration", "Networking". |
| **5** | **Aesthetics** | Visual polish (colors, tables, alignment) enhances usability only after priorities 1–4 are satisfied. | Align columns in table output, but never at the cost of scriptability. |

---

## Self-Check Checklist

- [ ] Exit codes: 0 for success, 1 for general error, 2 for misuse — distinct codes for distinct failure modes
- [ ] stdout = data only; stderr = progress, warnings, errors — verified with pipe test (`cli | cat`)
- [ ] `NO_COLOR` respected (all ANSI colors suppressed when set); `CI` respected (no spinners/progress bars)
- [ ] Automatically suppress colors and progress when stdout is not a TTY
- [ ] `--json` (or `--format=json`) supported for structured output on data-producing commands
- [ ] Config file follows XDG Base Directory (`~/.config/<app>/`) — no config in project directory
- [ ] `--help` output is structured, grouped, and useful without external docs
- [ ] `--` supported to stop flag parsing
- [ ] Short and long flags consistent across all subcommands (same flag = same behavior everywhere)
