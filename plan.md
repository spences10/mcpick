# MCP Session Manager: Dynamic Tool Configuration for Claude Code

## The Problem

Claude Code loads ALL configured MCP servers at session startup,
consuming massive amounts of context tokens regardless of whether you
actually use those tools. Users report:

- **66,687 tokens consumed** by 20+ MCP tools before even starting
  work
- **25-30% of context window** used by unused tool definitions
- **No way to dynamically enable/disable** MCP servers during sessions
- **Session restart required** for any MCP configuration changes
- **Forced to choose** between comprehensive tool access and efficient
  resource usage

This creates a fundamental workflow problem: you either load
everything (wasting tokens) or manually edit JSON configs before each
session (time-consuming and error-prone).

## The Solution: Session-Specific MCP Configuration Manager

A CLI tool that manages your MCP server configurations dynamically by
manipulating the `.claude.json` file before Claude Code sessions
start.

### Core Concept

Instead of fighting Claude Code's static loading, work with it by
making configuration changes fast and intelligent:

1. **Store all available MCP servers** in a separate configuration
   repository
2. **Select servers per session** using an interactive interface
3. **Automatically update** `.claude.json` with only selected servers
4. **Launch Claude Code** with optimized configuration
5. **Save successful combinations** as reusable presets

### Key Features

**Interactive Server Selection**

- Checkbox interface showing all available MCP servers
- Real-time token usage estimates for each server
- Smart warnings when approaching context limits
- Tag-based filtering (e.g., "web-dev", "data-analysis", "automation")

**Preset Management**

- Save frequently used server combinations
- Load preset configurations instantly
- Project-specific presets (auto-detect based on directory)
- Share presets with team members

**Intelligent Recommendations**

- Suggest optimal server combinations for detected project types
- Learn from usage patterns to recommend relevant tools
- Context-aware suggestions based on file types in current directory

**Seamless Integration**

- One command to select servers and launch Claude Code
- Backup and restore previous configurations
- Zero impact on existing Claude Code functionality

### User Experience

```bash
# Interactive selection for this session
mcp-manager select

# Quick preset loading
mcp-manager start --preset "web-development"

# Enable specific servers by name
mcp-manager enable context7 github filesystem

# Save current successful combination
mcp-manager save-preset "data-pipeline" --current
```

### Benefits

- **95% token reduction** by loading only needed tools
- **No session restarts** for configuration changes
- **Faster startup times** with fewer servers to initialize
- **Better resource utilization** and longer conversation capacity
- **Experimentation-friendly** - try new tool combinations easily
- **Team collaboration** through shared preset configurations

### Storage Location

Extends existing Claude configuration structure:

- Available servers stored in `~/.claude/mcp-manager/`
- Presets and settings in `~/.claude/settings.json`
- No modification to Claude Code's core configuration patterns

This solution transforms the MCP configuration experience from a
static, all-or-nothing choice into a dynamic, session-optimized
workflow that maximizes both functionality and efficiency.
