# McPick

A CLI tool for managing MCP servers, plugins, and plugin caches in
Claude Code. Toggle servers and plugins on/off, manage stale plugin
caches, and optimise context usage and performance.

## Installation

### One-time Usage (recommended)

```bash
pnpx mcpick
# or
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

McPick provides an intuitive CLI menu and non-interactive subcommands
to:

- ✅ **Toggle servers on/off** - Enable only the MCP servers you need
  for your current task
- 🔌 **Toggle plugins on/off** - Enable or disable Claude Code
  marketplace plugins
- 🗑️ **Manage plugin cache** - Detect stale plugins, clear caches,
  clean orphaned versions, refresh marketplaces
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
│  ● Enable / Disable MCP servers (Toggle MCP servers on/off)
│  ○ Enable / Disable plugins (Toggle Claude Code plugins on/off)
│  ○ Manage plugin cache (View, clear, or refresh plugin caches)
│  ○ Backup config
│  ○ Add MCP server
│  ○ Restore from backup
│  ○ Load profile
│  ○ Save profile
│  ○ Exit
└
```

### Scope Support

MCPick supports the three MCP server scopes used by Claude Code:

| Scope       | Description                          | Storage Location                              |
| ----------- | ------------------------------------ | --------------------------------------------- |
| **Local**   | Project-specific servers (default)   | `~/.claude.json` → `projects[cwd].mcpServers` |
| **Project** | Shared via `.mcp.json` in repository | `.mcp.json` in project root                   |
| **User**    | Global servers for all projects      | `~/.claude.json` → `mcpServers`               |

When you select "Enable / Disable MCP servers", MCPick will:

1. Ask which scope you want to edit
2. Show servers already enabled for that scope (pre-checked)
3. Use `claude mcp add/remove` CLI commands for Local and Project
   scopes

This integration ensures your changes are correctly applied to the
right configuration location.

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

### Profiles

Load predefined sets of MCP servers instantly:

```bash
# Apply a profile
mcpick --profile database
mcpick -p database

# Save current config as a profile
mcpick --save-profile mysetup
mcpick -s mysetup

# List available profiles
mcpick --list-profiles
mcpick -l
```

Profiles are stored in `~/.claude/mcpick/profiles/`. You can also
create them manually:

```json
// ~/.claude/mcpick/profiles/database.json
{
	"mcp-sqlite-tools": {
		"type": "stdio",
		"command": "npx",
		"args": ["-y", "mcp-sqlite-tools"]
	}
}
```

Or use full format with `mcpServers` wrapper:

```json
{
  "mcpServers": {
    "server-name": { ... }
  }
}
```

### Plugin Cache Management

Claude Code caches marketplace plugins at `~/.claude/plugins/cache/`.
When marketplace authors update plugins, your cached versions can go
stale. McPick detects this and lets you fix it.

#### Interactive

Select "Manage plugin cache" from the main menu to:

- **View cache status** - See all cached plugins with staleness
  indicators (version mismatch, commits behind, orphaned versions)
- **Clear plugin caches** - Refreshes the marketplace and clears
  selected caches so they rebuild with the latest version
- **Clean orphaned versions** - Remove old version directories marked
  as orphaned
- **Refresh marketplaces** - Git pull all marketplace clones to get
  latest plugin listings

#### CLI Subcommands

```bash
# Show cache status for all plugins
npx mcpick cache status
npx mcpick cache status --json

# Clear a specific plugin cache (refreshes marketplace first)
npx mcpick cache clear plugin-name@marketplace
npx mcpick cache clear --all

# Remove orphaned version directories
npx mcpick cache clean-orphaned

# Refresh all marketplace clones
npx mcpick cache refresh
```

### Plugin Management

Toggle Claude Code marketplace plugins on and off:

```bash
# List all plugins and their status
npx mcpick plugins list
npx mcpick plugins list --json

# Enable/disable a plugin
npx mcpick plugins enable plugin-name@marketplace
npx mcpick plugins disable plugin-name@marketplace
```

### CLI Subcommands

McPick supports both an interactive menu (default) and non-interactive
CLI subcommands for scripting and LLM tool use:

```bash
# MCP server management
npx mcpick list                    # List servers
npx mcpick enable <server>         # Enable a server
npx mcpick disable <server>        # Disable a server
npx mcpick add --name <n> ...      # Add a server
npx mcpick remove <server>         # Remove a server

# Backups and profiles
npx mcpick backup                  # Create backup
npx mcpick restore [file]          # Restore from backup
npx mcpick profile list            # List profiles
npx mcpick profile load <name>     # Load a profile
npx mcpick profile save <name>     # Save current config

# Plugin management
npx mcpick plugins list            # List plugins
npx mcpick plugins enable <key>    # Enable plugin
npx mcpick plugins disable <key>   # Disable plugin

# Cache management
npx mcpick cache status            # Show staleness info
npx mcpick cache clear [key]       # Clear plugin cache
npx mcpick cache clean-orphaned    # Remove orphaned dirs
npx mcpick cache refresh           # Git pull marketplaces
```

All subcommands support `--json` for machine-readable output.

### Typical Workflow

1. **Before a coding session**: Run `mcpick -p <profile>` or use the
   interactive menu to enable relevant servers
2. **Launch Claude Code**: Run `claude` to start with your configured
   servers
3. **Switch contexts**: Run `mcpick -p <other-profile>` to quickly
   switch server sets

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
- **Project Config**: `.mcp.json` (project-specific shared config,
  committed to git)
- **MCPick Registry**: `~/.claude/mcpick/servers.json` (MCPick's
  server database)
- **Backups**: `~/.claude/mcpick/backups/` (MCP configuration backups)
- **Profiles**: `~/.claude/mcpick/profiles/` (predefined server sets)
- **Plugin Cache**: `~/.claude/plugins/cache/` (cached plugin files)
- **Installed Plugins**: `~/.claude/plugins/installed_plugins.json`
  (plugin install registry)
- **Marketplaces**: `~/.claude/plugins/marketplaces/` (marketplace git
  clones)

#### MCP Server Storage by Scope

| Scope   | Location                                                     | Use Case                           |
| ------- | ------------------------------------------------------------ | ---------------------------------- |
| Local   | `~/.claude.json` → `projects["/path/to/project"].mcpServers` | Personal project config            |
| Project | `.mcp.json` in project root                                  | Shared team config (commit to git) |
| User    | `~/.claude.json` → `mcpServers`                              | Global servers for all projects    |

> **Note**: MCPick automatically detects servers in parent
> directories. If you have local servers configured at
> `/Users/you/projects` and run MCPick from
> `/Users/you/projects/myapp`, it will find and display them.

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

Have ideas for other features?
[Open an issue](https://github.com/spences10/mcpick/issues) or check
out the [contribution guide](./docs/ROADMAP.md)!

## Requirements

- Node.js 22+
- Claude Code installed and configured
- pnpm (for building from source)
