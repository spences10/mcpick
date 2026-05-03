# MCPick

[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

Vendor-neutral MCP configuration manager with first-class Claude Code
support.

MCPick helps humans and LLM agents inspect, toggle, and back up MCP
server configuration across multiple AI clients. Claude Code-specific
plugins, hooks, marketplaces, and cache commands remain available, but
they are no longer the core product model.

## Install

```bash
npm install -g mcpick
# or run without installing
npx mcpick --help
```

Requirements:

- Node.js 22+
- Claude Code is required only for Claude Code-specific commands
- The external `skills` CLI is used through `npx -y skills@latest` for
  portable skills commands

## Agent-first CLI

In non-TTY environments, MCPick shows help instead of launching the
interactive TUI. This makes it safer for prompts like:

> “Use mcpick to work out how to enable this MCP server.”

Start with:

```bash
npx mcpick --help
npx mcpick clients
npx mcpick list --json
```

MCPick redacts known secret patterns before printing output. MCP
configs often contain env vars and authorization headers, so `env` and
`headers` values are shown as `***` in JSON output.

## MCP clients

Supported client adapters:

| Client                | Scopes               | Command examples                                  |
| --------------------- | -------------------- | ------------------------------------------------- |
| Claude Code           | local, project, user | `mcpick list`, `mcpick enable <server>`           |
| Gemini CLI            | project, user        | `mcpick list --client gemini-cli --scope project` |
| VS Code / Copilot     | project              | `mcpick list --client vscode --scope project`     |
| Cursor                | project, user        | `mcpick list --client cursor --scope user`        |
| Windsurf              | user                 | `mcpick list --client windsurf --scope user`      |
| OpenCode              | project, user        | `mcpick list --client opencode --scope project`   |
| Pi via pi-mcp-adapter | project, user        | `mcpick list --client pi --scope user`            |

Show known config locations:

```bash
npx mcpick clients
npx mcpick clients --json
```

## MCP server commands

```bash
# List Claude Code registry/status
npx mcpick list
npx mcpick list --json

# List another client
npx mcpick list --client pi --scope user --json
npx mcpick list --client opencode --scope project

# Claude Code enable/disable
npx mcpick enable <server> --scope local
npx mcpick disable <server> --scope local

# Add/remove Claude Code server definitions
npx mcpick add --name <server> --command npx --args "-y,package-name"
npx mcpick add-json <name> '{"command":"npx","args":["-y","package-name"]}'
npx mcpick remove <server>
```

For secret-backed servers, prefer environment variable references and
secret-safe loading tools. MCPick redacts printed values, but MCP
client config files may still store secrets in plain text because that
is how many clients currently load MCP credentials.

## Portable skills

MCPick delegates portable SKILL.md management to the external `skills`
CLI.

```bash
# List installed skills for a client
npx mcpick skills list --agent pi --json

# See available skills from a source without installing
npx mcpick skills add spences10/skills --list

# Install one skill
npx mcpick skills add spences10/skills --agent pi --skill svelte-runes --yes

# Install all skills for a client globally
npx mcpick skills add spences10/skills --agent opencode --skill '*' --global --yes

# Update/remove
npx mcpick skills update --global --yes
npx mcpick skills remove svelte-runes --agent pi --yes
```

## Claude Code-specific tools

These commands wrap Claude Code concepts and are intentionally
client-specific:

```bash
# Plugins
npx mcpick plugins list
npx mcpick plugins install <name>@<marketplace>
npx mcpick plugins enable <name>@<marketplace>
npx mcpick plugins disable <name>@<marketplace>

# Marketplaces
npx mcpick marketplace list
npx mcpick marketplace add <source>
npx mcpick marketplace update
npx mcpick marketplace remove <name>

# Hooks and plugin cache
npx mcpick hooks list
npx mcpick cache status
npx mcpick cache refresh
```

## Profiles and backups

Profiles are portable MCP server snapshots. Claude Code plugin state
is preserved as optional Claude-specific profile metadata.

```bash
# Legacy Claude Code shortcuts still work
npx mcpick --profile database
npx mcpick --save-profile mysetup
npx mcpick --list-profiles

# Save/load profiles for a specific MCP client
npx mcpick profile save work --client vscode --scope project
npx mcpick profile load work --client opencode --scope project --dry-run
npx mcpick profile load work --client pi --scope user

npx mcpick backup
npx mcpick restore [file]

# Safe-write rollback backups created before config mutations
npx mcpick rollback --list
npx mcpick rollback [file]
```

## Interactive TUI

Running `npx mcpick` in a terminal launches the human-facing menu:

```text
MCPick - MCP Configuration Manager

What would you like to do?
  Enable / Disable MCP servers
  Skills
  Client-specific tools
  Load profile
  Save profile
  Backup config
  Restore from backup
  Exit
```

The primary TUI flow is client-first: choose a client, then toggle its
MCP servers. Claude Code plugins, hooks, marketplaces, and cache live
under “Client-specific tools”.

## Config locations

MCPick reads the standard locations used by each client adapter.
Common paths include:

| Path                     | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `~/.claude.json`         | Claude Code local/user MCP config               |
| `.mcp.json`              | Shared project MCP config                       |
| `.gemini/settings.json`  | Gemini CLI project config                       |
| `.vscode/mcp.json`       | VS Code / Copilot project config                |
| `.cursor/mcp.json`       | Cursor project config                           |
| `opencode.json`          | OpenCode project config                         |
| `~/.config/mcp/mcp.json` | Shared global MCP config used by pi-mcp-adapter |
| `.pi/mcp.json`           | Pi project override                             |

MCPick-owned state lives under `~/.claude/mcpick/` for historical
compatibility.

## Development

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

See `docs/VENDOR_NEUTRAL_ARCHITECTURE.md` for architecture notes.
