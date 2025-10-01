# McPick

A CLI tool for dynamically managing MCP server configurations in
Claude Code. Enable and disable MCP servers on-demand to optimize
context usage and performance.

## Installation

### One-time Usage

```bash
pnpm dlx mcpick
# or
npx mcpick
```

### Global Installation

```bash
pnpm install -g mcpick
# or
npm install -g mcpick
```

## The Problem

Using the Claude Code `/doctor` command you may see something like
this if you have many MCP servers configured:

```bash
 Context Usage Warnings
 └ ⚠ Large MCP tools context (~66,687 tokens > 25,000)
   └ MCP servers:
     └ mcp-omnisearch-testing: 20 tools (~10,494 tokens)
     └ mcp-omnisearch: 20 tools (~10,454 tokens)
     └ mcp-sqlite-tools-testing: 19 tools (~9,910 tokens)
     └ mcp-sqlite-tools: 19 tools (~9,872 tokens)
     └ playwright: 21 tools (~9,804 tokens)
     └ (7 more servers)
```

Claude Code loads **all** MCP servers from your `.claude.json` file at
startup, regardless of whether you need them for your current task.
This can lead to:

- 🐌 Slower Claude Code startup times
- 💾 High context token usage
- 🧠 Cognitive overload from too many available tools

## The Solution

McPick provides an intuitive CLI menu to:

- ✅ **Toggle servers on/off** - Enable only the MCP servers you need
  for your current task
- 📁 **Manage server registry** - Keep a database of all your
  available MCP servers
- 🔄 **Safe configuration** - Only modifies the `mcpServers` section,
  preserving other Claude Code settings
- 💾 **Backup & restore** - Create focused backups of your MCP server
  configurations

## Features

### Interactive Menu

```bash
┌  McPick - MCP Server Configuration Manager
│
◆  What would you like to do?
│  ● Edit config (Toggle MCP servers on/off)
│  ○ Backup config
│  ○ Add MCP server
│  ○ Restore from backup
│  ○ Exit
└
```

### Smart Server Management

- **Auto-discovery**: Automatically imports servers from your existing
  `.claude.json`
- **Registry sync**: Maintains a registry of available servers for
  quick selection
- **Selective enabling**: Choose exactly which servers to enable via
  multiselect
- **Configuration safety**: Preserves all non-MCP settings in your
  Claude Code config

### Backup System

- **Focused backups**: Only backs up MCP server configurations (not
  the entire 30k+ line config)
- **Automatic cleanup**: Keeps last 10 backups to prevent storage
  bloat
- **Easy restoration**: Restore from any previous backup with a simple
  menu

### Typical Workflow

1. **Before a coding session**: Run MCPick and enable only relevant
   servers (e.g., just database tools for DB work)
2. **Launch Claude Code**: Run `claude` to start with your configured
   servers
3. **Switch contexts**: Re-run MCPick to enable different servers for
   different tasks

### Adding New Servers

1. Select "Add MCP server"
2. Provide server details:
   - Name (e.g., "mcp-sqlite-tools")
   - Command (e.g., "npx")
   - Arguments (e.g., "-y", "mcp-sqlite-tools")
   - Description (optional)
   - Environment variables (optional)

## Configuration

MCPick works with the standard Claude Code configuration format:

```json
{
	"mcpServers": {
		"server-name": {
			"command": "npx",
			"args": ["-y", "mcp-server-package"],
			"env": {
				"API_KEY": "your-key"
			}
		}
	}
}
```

### File Locations

- **Claude Config**: `~/.claude.json` (your main Claude Code
  configuration)
- **MCPick Registry**: `~/.claude/mcpick/servers.json` (MCPick's
  server database)
- **Backups**: `~/.claude/mcpick/backups/` (MCP configuration backups)

## Safety Features

- **Non-destructive**: Only modifies the `mcpServers` section of your
  Claude Code config
- **Backup integration**: Automatically creates backups before major
  changes
- **Validation**: Ensures all server configurations are valid before
  writing
- **Error handling**: Graceful failure modes with helpful error
  messages

## Future Features

McPick is actively being developed with new features planned. See the
[roadmap](./docs/ROADMAP.md) for details on:

- **Settings Validation** - Validate your Claude Code settings files
  using the
  [claude-code-settings-schema](https://github.com/spences10/claude-code-settings-schema)
- **Permissions Management** - Interactive tool permission
  configuration with presets (Safe Mode, Dev Mode, Review Mode)
- **Configuration Profiles** - Save and switch between complete
  configuration snapshots for different workflows

Have ideas for other features?
[Open an issue](https://github.com/spences10/mcpick/issues) or check
out the [contribution guide](./docs/ROADMAP.md)!

## Requirements

- Node.js 22+
- Claude Code installed and configured
- pnpm (for building from source)
