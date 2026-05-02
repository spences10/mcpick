# mcpick

## 0.0.24

### Patch Changes

- 1d8cdd4: Add dry-run previews for config mutations with redacted
  structured diffs.
- 7059ba7: Refactor TUI profile and adapter flows to share CLI
  mutation services, clarifying Claude-specific behavior.

## 0.0.23

### Patch Changes

- 291b1d4: Add config rollback command, scoped Claude removals, author
  metadata, and rollback backup tests.
- 92a0d0e: Improve marketplace add validation, authentication checks,
  and error messages for GitHub repository access failures.
- 1d191a5: Add safer config writes, non-Claude client mutation
  commands, shell-free git execution, and adapter tests.

## 0.0.22

### Patch Changes

- 55a46c0: chore: remove outdated documentation and refresh README for
  vendor-neutral MCPick architecture and current CLI flows
- f30675a: Add vendor-neutral skills management, client-first TUI
  refactor, and safer redacted CLI output for agents.

## 0.0.21

### Patch Changes

- 47e40be: chore: reorder TUI menu and update README for agent-first
  usage

## 0.0.20

### Patch Changes

- 00ea930: chore: add unit tests and CI workflow with GitHub Actions
- 37a62e1: feat: auto-show help instead of TUI in non-TTY environments
  for LLM agents
- fc1db54: fix: replace exec with execFile to eliminate shell
  injection on all platforms

## 0.0.19

### Patch Changes

- 5ed618e: Migrate build tooling from tsc/prettier to vite-plus, fix
  all lint warnings
- 08997dc: feat: rewrite --help for LLM agents with workflow,
  concepts, and examples sections

## 0.0.18

### Patch Changes

- 58ff00f: Add clone command and skip redundant stdio transport flag
- 7f277da: redact env keys when listing
- b52fcbd: Show available CLI commands hint in TUI intro

## 0.0.17

### Patch Changes

- 54fe401: feat: plugin hook management with per-hook disable/enable
  and update guard

## 0.0.16

### Patch Changes

- b671135: fix: validate marketplace repos upfront, remove unsupported
  --scope flag
- fed8311: feat: TUI marketplace management, plugin browse, CLI parity
  commands

## 0.0.15

### Patch Changes

- 0170ea0: Add local dev workflow: mcpick dev + cache link/unlink
- 2161258: Fix marketplace refresh, cache clear, uninstall detection;
  add marketplace commands

## 0.0.14

### Patch Changes

- 0170ea0: Add local dev workflow: mcpick dev + cache link/unlink

## 0.0.13

### Patch Changes

- c985c28: Headers lost on disable/enable: pass -H flags in CLI, sync
  config→registry before disable

## 0.0.12

### Patch Changes

- b4f38d5: fix: discover externally-added servers and use atomic JSON
  writes

## 0.0.11

### Patch Changes

- 7ec3323: feat: add plugin install, uninstall, and update commands
  via Claude CLI
- 99b2bf3: feat: add plugin install, uninstall, and update to
  interactive menu
- 9b1c6d7: feat: add plugin support to backup, restore, and profiles

## 0.0.10

### Patch Changes

- ffe29b3: Add non-interactive CLI mode with citty for scripting and
  LLM usage
- fff6c0d: add plugin cache management with staleness detection and
  cleanup

## 0.0.9

### Patch Changes

- d4f4b5c: Add plugin toggle support - enable/disable Claude Code
  plugins from the mcpick menu

## 0.0.8

### Patch Changes

- 219d5fd: Add scope support for MCP server installation with Claude
  CLI integration and shell injection fixes

## 0.0.7

### Patch Changes

- fb70e88: add profiles feature

## 0.0.6

### Patch Changes

- 413ff07: Add CLAUDE_CONFIG_DIR support for custom config locations

## 0.0.5

### Patch Changes

- abc8715: fix: improve UI labels and add documentation about global
  MCP server configuration

## 0.0.4

### Patch Changes

- 25f7d07: chore: remove non-functional launch feature

## 0.0.3

### Patch Changes

- 158520e: fix: extract duplicated server details display logic into
  reusable function

## 0.0.2

### Patch Changes

- 6a3eec7: paste json server config
- a62953b: Removed estimated_tokens prompt and references, Enhanced
  add-server dialogue
- 491d543: make json first options for adding server
- 3242ff1: remove unused docs

## 0.0.1

### Patch Changes

- debe3ad: initial release
