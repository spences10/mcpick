# MCPick Roadmap

## Vision

MCPick aims to be a comprehensive CLI tool for managing Claude Code
configurations, focusing on features that are tedious or error-prone
to configure manually.

## Current State (v0.0.4)

- ✅ MCP server toggle management
- ✅ Server registry with add/import
- ✅ Backup and restore
- ✅ Safe configuration editing (only touches `mcpServers` section)

## Proposed Features

### 1. Settings Validation

**Priority:** HIGH (Quick Win) **Complexity:** Low **Impact:** Medium

Validate `.claude/settings.json` files using the
[claude-code-settings-schema](https://github.com/spences10/claude-code-settings-schema).

**Why this fits:**

- Leverages existing schema project
- Adds safety without complexity
- Helps users understand setting hierarchy
- Quick to implement

**See:**
[features/settings-validation.md](./features/settings-validation.md)

### 2. Permissions Management

**Priority:** HIGH (High Impact) **Complexity:** Medium **Impact:**
High

Interactive management of tool permissions (allow/deny/ask) with
preset configurations.

**Why this fits:**

- Similar UX to MCP server toggles
- Safety-critical like server management
- Currently hard to configure manually
- Solves real security concerns

**See:**
[features/permissions-management.md](./features/permissions-management.md)

### 3. Configuration Profiles

**Priority:** MEDIUM (Advanced) **Complexity:** High **Impact:** High

Save and restore complete configuration snapshots including
permissions, MCP servers, and hooks.

**Why this fits:**

- Natural extension of backup feature
- Solves context-switching problem
- Maintains focus on quick configuration changes

**See:**
[features/configuration-profiles.md](./features/configuration-profiles.md)

## Features That Don't Fit

The following features were considered but don't align with MCPick's
philosophy:

- **Hooks Management** - Too complex for CLI, better suited for text
  editor
- **StatusLine Configuration** - Too niche, low demand
- **Environment Variables** - Shell is the better place for this
- **Model Selection** - Simple enough to edit manually
- **Launch Feature** - Removed in v0.0.4 due to technical limitations

## Implementation Timeline

### Phase 1: Foundation (v0.1.0)

- Settings Validation
- Documentation improvements
- Bug fixes from user feedback

### Phase 2: Safety Features (v0.2.0)

- Permissions Management
- Permission presets (Safe Mode, Dev Mode, Review Mode)
- Enhanced validation with auto-fix suggestions

### Phase 3: Workflows (v0.3.0)

- Configuration Profiles
- Profile templates for common workflows
- Import/export profiles

## Design Principles

All features should follow these principles:

1. **Focused Scope** - Do one thing well, don't try to manage
   everything
2. **Interactive CLI** - Terminal UI with clear feedback
3. **Safety First** - Non-destructive operations, backups, validation
4. **Simple UX** - Checkbox toggles, clear prompts, no complex
   concepts
5. **Real Problems** - Solve configuration pain points that are
   tedious manually

## Contributing

See individual feature documents for technical details and
implementation notes. PRs welcome for any roadmap features!
