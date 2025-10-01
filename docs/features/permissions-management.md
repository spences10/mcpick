# Permissions Management Feature

## Overview

Interactive CLI tool for managing Claude Code tool permissions with
preset configurations for common workflows.

## Problem Statement

Claude Code's permission system is powerful but difficult to configure
manually:

- Patterns like `Bash(git:*)` and `Read(src/**)` are hard to remember
- No easy way to switch between "safe" and "permissive" modes
- Difficult to visualize what tools are allowed/denied
- Easy to make mistakes that compromise security or break workflows

## Solution

Add an interactive permissions manager to MCPick with:

1. **Visual permission editor** - Checkbox interface for common tools
2. **Permission presets** - One-click profiles for common scenarios
3. **Custom rule management** - Add/edit/remove specific patterns
4. **Validation** - Ensure rules don't conflict

## User Interface Mockup

### Main Menu Addition

```
┌  MCPick - MCP Server Configuration Manager
│
◆  What would you like to do?
│  ○ Edit config (Toggle MCP servers on/off)
│  ○ Backup config
│  ○ Add MCP server
│  ○ Restore from backup
│  ● Manage permissions (Configure tool access)  ← NEW
│  ○ Exit
└
```

### Permissions Editor

```
┌  Permissions Management
│
◇  Current Settings: Custom configuration
│
◆  Quick Presets:
│  ○ Safe Mode (Deny all writes, ask for commands)
│  ○ Development Mode (Allow most tools, ask for destructive ops)
│  ○ Review Mode (Read-only, deny all modifications)
│  ● Custom (current)
│
◆  Tool Permissions:
│
│  Bash (Command Execution)
│  ○ Allow all commands
│  ● Ask before executing
│  ○ Deny all commands
│  └─ Custom rules: ✓ Allow: git:*  ✓ Deny: rm:*
│
│  Read (File Reading)
│  ● Allow all files
│  ○ Ask before reading
│  ○ Deny all reads
│  └─ Custom rules: ✓ Deny: .env  ✓ Deny: **/*.key
│
│  Write (File Writing)
│  ○ Allow all files
│  ● Ask before writing
│  ○ Deny all writes
│  └─ Custom rules: ✓ Allow: src/**  ✓ Deny: dist/**
│
│  Edit (File Editing)
│  ○ Allow all files
│  ● Ask before editing
│  ○ Deny all edits
│
│  WebFetch (Web Requests)
│  ○ Allow all URLs
│  ● Ask before fetching
│  ○ Deny all requests
│
│  WebSearch (Web Searches)
│  ● Allow all searches
│  ○ Ask before searching
│  ○ Deny all searches
│
◆  Actions:
│  ► Add custom rule
│  ► Edit custom rules
│  ► Save changes
│  ► Cancel
└
```

### Custom Rule Editor

```
┌  Add Custom Permission Rule
│
◆  Tool: Bash
│
◆  Permission:
│  ● Allow
│  ○ Ask
│  ○ Deny
│
◆  Pattern: git:*
│  (Examples: git:*, npm run:*, python:*)
│
◆  Description (optional):
│  Allow all git commands
│
◆  Add rule?
└
```

## Permission Presets

### Safe Mode

Perfect for code reviews or working in unfamiliar codebases.

```json
{
	"permissions": {
		"allow": ["Read(*)", "WebSearch(*)"],
		"ask": ["Bash(git:*)", "WebFetch(*)"],
		"deny": ["Write(*)", "Edit(*)", "Bash(*)"]
	}
}
```

### Development Mode

Balanced permissions for active development.

```json
{
	"permissions": {
		"allow": [
			"Read(*)",
			"WebSearch(*)",
			"WebFetch(*)",
			"Bash(git:*)",
			"Bash(npm:*)",
			"Bash(pnpm:*)"
		],
		"ask": ["Write(*)", "Edit(*)", "Bash(*)"],
		"deny": [
			"Bash(rm:*)",
			"Bash(sudo:*)",
			"Write(.env)",
			"Edit(.env)"
		]
	}
}
```

### Review Mode

Read-only access for code reviews.

```json
{
	"permissions": {
		"allow": [
			"Read(*)",
			"WebSearch(*)",
			"Bash(git diff:*)",
			"Bash(git log:*)",
			"Bash(git show:*)"
		],
		"deny": ["Write(*)", "Edit(*)", "Bash(*)", "WebFetch(*)"]
	}
}
```

## Technical Implementation

### Data Structures

```typescript
interface PermissionRule {
	tool: ToolType;
	action: 'allow' | 'ask' | 'deny';
	pattern: string;
	description?: string;
}

type ToolType =
	| 'Bash'
	| 'Read'
	| 'Write'
	| 'Edit'
	| 'WebFetch'
	| 'WebSearch';

interface PermissionPreset {
	name: string;
	description: string;
	permissions: {
		allow?: string[];
		ask?: string[];
		deny?: string[];
	};
}
```

### File Operations

Permissions live in `.claude/settings.json`:

```typescript
async function readPermissions(): Promise<Permissions> {
	const settings = await readClaudeSettings();
	return settings.permissions || {};
}

async function writePermissions(
	permissions: Permissions,
): Promise<void> {
	const settings = await readClaudeSettings();
	settings.permissions = permissions;
	await writeClaudeSettings(settings);
}
```

### Validation

```typescript
function validatePermissions(
	permissions: Permissions,
): ValidationResult {
	// Check for conflicts (same pattern in allow and deny)
	// Validate pattern syntax
	// Warn about overly broad patterns like Bash(*)
	// Suggest safer alternatives
}
```

### Pattern Helpers

```typescript
const COMMON_PATTERNS = {
	bash: {
		git: 'git:*',
		npm: 'npm:*',
		allSafe: '(git|npm|pnpm|yarn):*',
		dangerous: '(rm|sudo|chmod):*',
	},
	read: {
		allFiles: '*',
		sourceOnly: 'src/**',
		noSecrets: '!(.env|**/*.key|**/*.pem)',
	},
	write: {
		allFiles: '*',
		sourceOnly: 'src/**',
		testOnly: '**/*.test.*',
	},
};
```

## Settings File Location

The feature should detect and update the appropriate settings file:

1. Check for `.claude/settings.json` (project-level)
2. Fall back to `~/.claude/settings.json` (user-level)
3. Prompt user to choose if both exist

## Open Questions

1. **Merge Strategy**: How to handle existing custom rules when
   applying a preset?
   - Option A: Replace all rules (simple but destructive)
   - Option B: Merge rules (complex but preserves custom rules)
   - Proposed: Ask user, default to replace with backup

2. **Pattern Validation**: Should we validate patterns against real
   files?
   - Pros: Catch typos early
   - Cons: Requires file system scanning
   - Proposed: Basic syntax validation only

3. **Rule Ordering**: Do rule orders matter for Claude Code?
   - Research needed: Test if Claude Code respects rule order
   - If yes: Add drag-to-reorder functionality

4. **Visual Feedback**: Should we show what files/commands match
   patterns?
   - Could be helpful but adds complexity
   - Proposed: Phase 2 feature

## Implementation Phases

### Phase 1: Basic Editor

- Menu integration
- Simple tool toggles (allow/ask/deny)
- Apply changes to settings file

### Phase 2: Presets

- Add Safe/Dev/Review presets
- Preset selection UI
- Backup before applying preset

### Phase 3: Custom Rules

- Add/edit/remove custom patterns
- Pattern validation
- Rule conflict detection

### Phase 4: Advanced

- Pattern testing ("show me what matches")
- Import/export permission sets
- Workspace-specific recommendations

## Success Metrics

- **Adoption**: % of MCPick users who use permissions feature
- **Safety**: Reduction in accidental destructive operations
- **Ease of use**: Time to configure permissions (should be <2 min)
- **Flexibility**: Can handle 90% of common use cases without custom
  rules

## Related Features

- **Settings Validation**: Can validate permission patterns
- **Configuration Profiles**: Can include permissions in profiles
