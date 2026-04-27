# McPick

Vendor-neutral MCP configuration manager with first-class Claude Code
support.

[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

Claude Code extension manager — MCP servers, plugins (skills, hooks,
agents), and marketplaces.

## Quick Start

Use mcpick inline in Claude Code sessions. Tell Claude:

```
Use npx mcpick to add the marketplace at spences10/claude-code-toolkit
```

```
Use npx mcpick to list my plugins and disable the ones I'm not using
```

```
Use npx mcpick to enable only the mcp-sqlite-tools server
```

McPick auto-detects non-TTY environments and shows structured help
instead of launching the interactive TUI — so LLM agents can read
`npx mcpick --help` and figure out the rest.

## Concepts

Marketplaces contain plugins. Plugins contain skills
(`/slash-commands`), hooks, agents, and MCP servers.

```
Marketplace → Plugin → Skills, Hooks, Agents, MCP Servers
```

## Common Workflows

### Install skills from a marketplace

```bash
# 1. Add the marketplace
npx mcpick marketplace add spences10/claude-code-toolkit

# 2. Install a plugin from it
npx mcpick plugins install my-plugin@claude-code-toolkit

# 3. Skills are now available as /slash-commands in Claude Code
```

Marketplace sources can be:

- `owner/repo` — GitHub shorthand
- `https://github.com/owner/repo` — full URL
- `./local-path` — local directory

### Toggle MCP servers

```bash
npx mcpick list                    # List Claude Code servers and status
npx mcpick clients                 # Show supported MCP clients/config locations
npx mcpick list --client gemini-cli --scope project
npx mcpick list --client opencode --scope project
npx mcpick list --client pi --scope user
npx mcpick list --client vscode --scope project
npx mcpick enable <server>        # Enable a server in Claude Code
npx mcpick disable <server>       # Disable a server in Claude Code
npx mcpick add --name <n> ...     # Add a new server to registry and Claude Code
npx mcpick remove <server>        # Remove a server
```

### Manage plugins

```bash
npx mcpick plugins list            # List plugins and status
npx mcpick plugins install <key>   # Install from marketplace
npx mcpick plugins uninstall <key> # Remove plugin
npx mcpick plugins update <key>    # Update to latest
npx mcpick plugins enable <key>    # Enable plugin
npx mcpick plugins disable <key>   # Disable plugin
```

### Manage marketplaces

```bash
npx mcpick marketplace list       # List configured marketplaces
npx mcpick marketplace add <src>  # Add a marketplace
npx mcpick marketplace remove <n> # Remove a marketplace
npx mcpick marketplace update     # Update all marketplaces
```

### Manage hooks

```bash
npx mcpick hooks list             # List all hooks
npx mcpick hooks add              # Add a settings hook
npx mcpick hooks remove           # Remove a hook
```

### Plugin cache

```bash
npx mcpick cache status           # Show staleness info
npx mcpick cache clear [key]      # Clear plugin cache
npx mcpick cache clean-orphaned   # Remove orphaned dirs
npx mcpick cache refresh          # Git pull marketplaces
```

### Profiles

Switch between server/plugin configurations instantly:

```bash
npx mcpick --profile database     # Apply a profile
npx mcpick --save-profile mysetup # Save current config
npx mcpick --list-profiles        # List profiles
```

### Backups

```bash
npx mcpick backup                 # Create timestamped backup
npx mcpick restore [file]         # Restore from backup
```

All commands support `--json` for machine-readable output.

## Interactive TUI

Running `npx mcpick` in a terminal (TTY) launches the interactive menu
for human use:

```
┌  MCPick - MCP Configuration Manager
│
◆  What would you like to do?
│  ● Enable / Disable MCP servers
│  ○ Manage plugins
│  ○ Manage marketplaces
│  ○ Manage hooks
│  ○ Manage plugin cache
│  ○ Backup config
│  ○ Add MCP server
│  ○ Restore from backup
│  ○ Load profile
│  ○ Save profile
│  ○ Exit
└
```

In non-TTY environments (LLM agents, piped output), mcpick
automatically shows `--help` instead.

## The Problem

MCP configuration is now spread across many AI development tools.
Claude Code, Gemini CLI, VS Code, Cursor, Windsurf, OpenCode, and Pi
via pi-mcp-adapter all expose MCP servers, but each has different
config paths, field names, scopes, and client-specific options. MCPick
keeps a portable view of MCP servers and uses client adapters for
vendor-specific config.

Pi itself has no built-in MCP support, but pi-mcp-adapter has settled
on shared MCP config files plus Pi override files. MCPick reads that
shape as the Pi client adapter.

Claude Code also loads **all** MCP servers at startup. With many
servers configured, `/doctor` shows:

```
 Context Usage Warnings
 └ ⚠ Large MCP tools context (~66,687 tokens > 25,000)
```

This means slower startup, wasted context tokens, and cognitive
overload from too many tools. McPick lets you inspect MCP clients and
toggle Claude Code servers so you only load what you need.

## Scope Support

| Scope       | Description                        | Storage Location                              |
| ----------- | ---------------------------------- | --------------------------------------------- |
| **Local**   | Project-specific servers (default) | `~/.claude.json` → `projects[cwd].mcpServers` |
| **Project** | Shared via `.mcp.json` in repo     | `.mcp.json` in project root                   |
| **User**    | Global servers for all projects    | `~/.claude.json` → `mcpServers`               |

## File Locations

| File                              | Purpose                        |
| --------------------------------- | ------------------------------ |
| `~/.claude.json`                  | Claude Code configuration      |
| `.mcp.json`                       | Project-specific shared config |
| `~/.claude/mcpick/servers.json`   | Server registry                |
| `~/.claude/mcpick/backups/`       | Configuration backups          |
| `~/.claude/mcpick/profiles/`      | Saved profiles                 |
| `~/.claude/plugins/cache/`        | Cached plugin files            |
| `~/.claude/plugins/marketplaces/` | Marketplace git clones         |

## Requirements

- Node.js 22+
- Claude Code installed and configured
