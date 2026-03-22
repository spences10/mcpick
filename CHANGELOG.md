# mcpick

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
