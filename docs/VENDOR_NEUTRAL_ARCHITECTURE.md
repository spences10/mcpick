# Vendor-neutral MCPick architecture

## Goal

Make MCPick useful for MCP configuration across multiple MCP Clients
while preserving the existing Claude Code features behind
Claude-specific modules.

## Current deepening move

The new `client-config` Module creates one seam for reading MCP Client
config:

- `PortableMcpServer` is the canonical shape used by MCPick.
- `McpClientAdapter` hides client-specific config paths and JSON
  shapes.
- `normalize_mcp_server` preserves unknown client-specific options in
  `clientOptions` instead of discarding them.

This is intentionally read-first. Writes should go through a later
safe apply Module that can diff, backup, write, and verify across
clients.

## Initial MCP Client coverage

| MCP Client        | Scope coverage       | Config shape                                                        |
| ----------------- | -------------------- | ------------------------------------------------------------------- |
| Claude Code       | local, project, user | `mcpServers` in `~/.claude.json` and `.mcp.json`                    |
| Gemini CLI        | project, user        | `mcpServers` in `.gemini/settings.json` / `~/.gemini/settings.json` |
| VS Code / Copilot | project              | `servers` in `.vscode/mcp.json`                                     |
| Cursor            | project, user        | `mcpServers` in `.cursor/mcp.json` / `~/.cursor/mcp.json`           |
| Windsurf          | user                 | `mcpServers` in `~/.codeium/windsurf/mcp_config.json`               |
| OpenCode          | project, user        | `mcp` in `opencode.json` / `~/.config/opencode/opencode.json`       |
| Pi MCP Adapter    | project, user        | `mcpServers` in shared `.mcp.json` plus Pi override mcp.json files  |

Pi itself intentionally has no built-in MCP support, but
`pi-mcp-adapter` has settled on this config layout:

1. `~/.config/mcp/mcp.json` — shared global MCP config
2. `~/.pi/agent/mcp.json` — Pi global override
3. `.mcp.json` — shared project MCP config
4. `.pi/mcp.json` — Pi project override

## Commands added/extended

```bash
mcpick clients
mcpick clients --json
mcpick list --client gemini-cli --scope project
mcpick list --client vscode --scope project
mcpick list --client opencode --scope project
mcpick list --client pi --scope user
```

Existing Claude Code behavior remains the default:

```bash
mcpick list
```

## Next modules to deepen

1. **Safe Apply Module** — diff portable desired state against a
   client config, backup, write, and verify.
2. **Portable Registry Module** — migrate `src/core/registry.ts` away
   from Claude-shaped `mcpServers`.
3. **Claude Extension Module** — isolate plugins, hooks, skills,
   marketplaces, and cache as Claude-specific functionality.
4. **Profile Module** — make profiles portable first, then
   adapter-specific when applying.
