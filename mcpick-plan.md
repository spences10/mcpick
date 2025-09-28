# MCPick Implementation Plan

## Overview

Build a minimal Node.js CLI tool using TypeScript and Clack prompts to
dynamically manage MCP server configurations for Claude Code sessions.

## The Problem

Claude Code loads ALL configured MCP servers at session startup,
consuming massive amounts of context tokens (66,687+ tokens reported)
regardless of whether you actually use those tools. Users need a way
to dynamically select which MCP servers to load per session.

## Architecture - Minimal Dependencies

**Only 2 Dependencies:**

```json
{
	"@clack/prompts": "^0.7.0",
	"valibot": "^0.25.0"
}
```

**Use Node.js Built-ins:**

- `fs/promises` for all file operations
- `path`, `os.homedir()` for path handling
- `child_process.spawn` to launch Claude Code
- `JSON.parse/stringify` for config files

## TypeScript Configuration

**tsconfig.json:**

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "node16",
		"strict": true,
		"outDir": "./dist",
		"sourceMap": true,
		"esModuleInterop": true,
		"allowSyntheticDefaultImports": true,
		"skipLibCheck": true
	},
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist"]
}
```

**package.json additions:**

- `"type": "module"` for ESM
- `"bin": { "mcpick": "./dist/index.js" }`
- `"engines": { "node": ">=22.0.0" }`

## User Flow - Pure Interactive

```bash
mcpick  # Single entry point - no CLI arguments
```

**Main Menu (Clack select):**

```
┌ What would you like to do?
│ ○ Edit config
│ ○ Backup config
│ ○ Add MCP server
│ ○ Restore from backup
│ ○ Launch Claude Code
└ ○ Exit
```

### Edit Config Flow:

1. Read `.claude.json` from current directory
2. Show multiselect with all servers (currently enabled ones checked)
3. User toggles servers on/off with spacebar
4. Save deselected servers to `~/.claude/mcpick/servers.json` registry
5. Update `.claude.json` with only selected servers
6. Show token count reduction

### Backup Config Flow:

1. Create timestamped backup of current `.claude.json`
2. Store in `~/.claude/mcpick/backups/`
3. Confirm backup location to user

### Add MCP Server Flow:

1. Text prompts for server details:
   - Name
   - Command
   - Arguments (array)
   - Description (optional)
2. Validate configuration with Valibot
3. Add to both `.claude.json` and servers registry

### Restore Flow:

1. List available backups with timestamps
2. User selects backup to restore
3. Confirm destructive operation
4. Restore `.claude.json` from backup

## File Structure

```
mcpick/
├── src/
│   ├── commands/
│   │   ├── edit-config.ts    # Toggle servers on/off
│   │   ├── backup.ts         # Create config backups
│   │   ├── add-server.ts     # Add new MCP server
│   │   ├── restore.ts        # Restore from backup
│   │   └── launch.ts         # Launch Claude Code
│   ├── core/
│   │   ├── config.ts         # .claude.json read/write operations
│   │   ├── registry.ts       # servers.json management
│   │   └── validation.ts     # Valibot schemas
│   ├── utils/
│   │   └── paths.ts          # Path resolution utilities
│   ├── types.ts              # TypeScript type definitions
│   └── index.ts              # Main entry point with menu
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration Storage

**Current directory: `.claude.json`**

- Standard Claude Code configuration file
- Only contains currently selected MCP servers

**~/.claude/mcpick/servers.json** - Registry of all available servers:

```json
{
	"servers": [
		{
			"name": "mcp-sqlite-tools",
			"command": "uvx",
			"args": ["mcp-sqlite-tools"],
			"description": "SQLite database tools",
			"estimatedTokens": 9872
		},
		{
			"name": "mcp-omnisearch",
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-omnisearch"],
			"description": "Web search capabilities",
			"estimatedTokens": 10454
		}
	]
}
```

**~/.claude/mcpick/backups/** - Timestamped backup files:

- Format: `claude-YYYY-MM-DD-HHMMSS.json`
- Keep last 10 backups automatically

## Error Handling Strategy

- **Valibot schemas** for all configuration validation
- **Try/catch blocks** with Clack `cancel()` for user-friendly error
  messages
- **File permission checks** before attempting operations
- **Create missing directories/files** with sensible defaults
- **Graceful handling** of malformed JSON files

## Token Estimation

- Static analysis of MCP server tool definitions
- Cache estimates in servers.json to avoid repeated calculations
- Display real-time totals during server selection
- Show before/after token counts

## Implementation Steps

1. **Project Setup**
   - Initialize Node.js/TypeScript project with minimal dependencies
   - Configure ESM, TypeScript, and build scripts

2. **Core Infrastructure**
   - Implement config file I/O using only Node.js built-ins
   - Create server registry management
   - Build backup/restore functionality

3. **Clack Interface**
   - Main interactive menu system
   - Multiselect for server toggling
   - Text prompts for server addition

4. **Config Management**
   - Edit existing configurations
   - Add new MCP servers
   - Backup and restore operations

5. **Polish & Testing**
   - Error handling and validation
   - User experience improvements
   - Documentation

## Benefits

- **95% token reduction** by loading only needed tools
- **Zero session restarts** for MCP configuration changes
- **Intuitive interface** with beautiful Clack prompts
- **Minimal dependencies** - only 2 external packages
- **Fast startup** with lightweight codebase
- **Backup safety** for configuration changes

This approach transforms MCP configuration from a static, manual
process into a dynamic, user-friendly workflow that maximizes both
functionality and efficiency.
