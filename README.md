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
- The GitHub CLI (`gh`, authenticated) is required for portable skills
  commands; [check-skills](https://github.com/spences10/check-skills)
  validates skills before install when available

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

## MCP server mode

`npx mcpick serve` runs MCPick itself as an MCP server over stdio, so
agents can manage MCP configuration through tool calls instead of
shelling out to the CLI. Tools:

- Read: `mcpick_list`, `mcpick_clients`, `mcpick_get`, `mcpick_doctor`
- Mutate: `mcpick_enable`, `mcpick_disable`, `mcpick_remove`,
  `mcpick_add`, `mcpick_add_json`

Read-only/destructive annotations are set so clients can make safe
decisions; secret warnings and `from_env` resolution behave the same
as the CLI. Client config example:

```json
{
	"mcpServers": {
		"mcpick": {
			"command": "npx",
			"args": ["-y", "mcpick", "serve"]
		}
	}
}
```

## MCP clients

Supported client adapters:

| Client                | Scopes               | Command examples                                  |
| --------------------- | -------------------- | ------------------------------------------------- |
| Claude Code           | local, project, user | `mcpick list`, `mcpick enable <server>`           |
| Claude Desktop        | user                 | `mcpick list --client claude-desktop`             |
| Codex CLI             | user                 | `mcpick list --client codex`                      |
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

MCPick warns when a value you write looks like a secret, redacts
printed output, and `npx mcpick doctor` flags plaintext secrets
already on disk. To keep secrets off the command line and out of LLM
conversation context, resolve them from the process environment:

```bash
pnpx nopeek run .env --only GITHUB_TOKEN -- npx mcpick add --name github --command npx --args "-y,@modelcontextprotocol/server-github" --from-env GITHUB_TOKEN --yes
```

MCP client config files may still store secrets in plain text because
that is how many clients currently load MCP credentials; prefer
`${VAR}` references where your client supports them.

## Validate your setup

`npx mcpick doctor` checks every known client config: JSON validity,
per-client schema shape, missing commands on PATH, duplicate servers
across scopes, plaintext secrets, and unpinned server packages. It
exits non-zero when it finds errors, so it works in CI:

```bash
npx mcpick doctor
npx mcpick doctor --client cursor --json
```

## Portable skills

MCPick installs portable SKILL.md packs through the GitHub CLI's
`gh skill` commands. Installs are staged in a temporary directory and
validated with check-skills before anything is written to your agent
directories, and each install records provenance (source repo, pinned
ref, target agents) shown in `skills list --json`.

```bash
# List installed skills for a client
npx mcpick skills list --agent pi --json

# Search GitHub, or see what a source offers without installing
npx mcpick skills search svelte
npx mcpick skills add spences10/skills --list
npx mcpick skills preview spences10/skills svelte-runes

# Install one skill, pinned for reproducibility
npx mcpick skills add spences10/skills --agent pi --skill svelte-runes --pin v1.2.0 --yes

# Install all skills from a repo at user scope
npx mcpick skills add spences10/skills --agent opencode --all --global --yes

# Check for updates, then apply them
npx mcpick skills update --dry-run --json
npx mcpick skills update
```

`skills remove` is not supported by the `gh skill` backend; it reports
the manual deletion paths instead.

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
npx mcpick profile load work --client opencode --scope project
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
  Validate configs (doctor)
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
under “Client-specific tools”. “Validate configs (doctor)” runs the
same read-only health checks as `mcpick doctor` (config parse errors,
schema-shape issues, missing commands, duplicate servers, plaintext
secrets, unpinned servers) and prints the report grouped by client.

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

MCPick-owned state lives under `$XDG_CONFIG_HOME/mcpick/`
(`~/.config/mcpick/` by default; override with `MCPICK_CONFIG_DIR`).
State previously kept in `~/.claude/mcpick/` is moved there
automatically on first run.

## Development

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

See `docs/VENDOR_NEUTRAL_ARCHITECTURE.md` for architecture notes.
