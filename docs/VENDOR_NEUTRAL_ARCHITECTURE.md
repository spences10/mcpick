# Vendor-neutral MCPick architecture

## Goal

MCPick manages MCP server configuration across multiple MCP clients
without making any one client config format the product model. Claude
Code remains a first-class client, and Claude-specific features stay
isolated behind Claude-specific commands.

## Core model

- `PortableMcpServer` is MCPick's canonical server shape.
- `McpClientAdapter` hides client-specific config paths, scopes, field
  names, and enable/disable conventions.
- `normalize_mcp_server` preserves unknown client-specific options in
  `clientOptions` instead of discarding them.
- Generic JSON adapters can read and toggle servers by writing
  `disabled` flags, or `enabled` flags for clients such as OpenCode.

## Current client coverage

| MCP Client        | Scope coverage       | Config shape                                                        |
| ----------------- | -------------------- | ------------------------------------------------------------------- |
| Claude Code       | local, project, user | `mcpServers` in `~/.claude.json` and `.mcp.json`                    |
| Gemini CLI        | project, user        | `mcpServers` in `.gemini/settings.json` / `~/.gemini/settings.json` |
| VS Code / Copilot | project              | `servers` in `.vscode/mcp.json`                                     |
| Cursor            | project, user        | `mcpServers` in `.cursor/mcp.json` / `~/.cursor/mcp.json`           |
| Windsurf          | user                 | `mcpServers` in `~/.codeium/windsurf/mcp_config.json`               |
| OpenCode          | project, user        | `mcp` in `opencode.json` / `~/.config/opencode/opencode.json`       |
| Pi MCP Adapter    | project, user        | `mcpServers` in shared `.mcp.json` plus Pi override mcp.json files  |

Pi itself has no built-in MCP support. MCPick follows the
pi-mcp-adapter layout:

1. `~/.config/mcp/mcp.json` — shared global MCP config
2. `~/.pi/agent/mcp.json` — Pi global override
3. `.mcp.json` — shared project MCP config
4. `.pi/mcp.json` — Pi project override

## Command layout

Vendor-neutral MCP commands:

```bash
mcpick clients
mcpick clients --json
mcpick list --client gemini-cli --scope project
mcpick list --client vscode --scope project
mcpick list --client opencode --scope project
mcpick list --client pi --scope user
```

Claude Code remains the default for legacy server registry workflows:

```bash
mcpick list
mcpick enable <server>
mcpick disable <server>
mcpick add ...
mcpick add-json ...
```

Portable skills are delegated to the external `skills` CLI:

```bash
mcpick skills list --agent pi --json
mcpick skills add spences10/skills --agent pi --skill svelte-runes --yes
```

Claude-specific extension commands stay grouped by feature:

```bash
mcpick plugins ...
mcpick hooks ...
mcpick marketplace ...
mcpick cache ...
```

## Secret safety

MCP configs frequently contain credentials in `env` and `headers`.
MCPick redacts structured output and delegated CLI stdout/stderr
before printing. This protects LLM-facing CLI output, but it does not
solve the underlying client-side issue: many MCP clients still require
secrets to exist in config files or process environment.

## Next modules to deepen

1. **Safe Apply Module** — diff portable desired state against a
   client config, backup, write, and verify across clients.
2. **Portable Registry Module** — migrate `src/core/registry.ts` away
   from Claude-shaped `mcpServers`.
3. **Profile Module** — profiles now save as portable `version: 2`
   server snapshots and can apply through client adapters; keep
   deepening migration and preview UX.
4. **Claude Extension Module** — continue isolating plugins, hooks,
   marketplaces, and cache as Claude-specific functionality.
