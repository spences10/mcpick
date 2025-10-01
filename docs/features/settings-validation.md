# Settings Validation Feature

## Overview

Validate Claude Code settings files using the
[claude-code-settings-schema](https://github.com/spences10/claude-code-settings-schema)
to catch configuration errors before they cause problems.

## Problem Statement

Claude Code settings are complex and error-prone:

- No built-in validation catches typos or invalid values
- Settings hierarchy (user → project → local) creates confusion
- Difficult to know which file a setting comes from
- Malformed JSON breaks Claude Code silently
- Hook syntax errors only discovered at runtime

## Solution

Add validation capabilities to MCPick:

1. **On-demand validation** - Run validation from menu
2. **Automatic validation** - Check before backups/edits
3. **Error reporting** - Show clear errors with locations
4. **Fix suggestions** - Recommend corrections for common issues
5. **Hierarchy viewer** - Show which file settings come from

## User Interface Mockup

### Menu Addition

```
┌  MCPick - MCP Server Configuration Manager
│
◆  What would you like to do?
│  ○ Edit config (Toggle MCP servers on/off)
│  ○ Backup config
│  ○ Add MCP server
│  ○ Restore from backup
│  ○ Manage permissions
│  ● Validate settings  ← NEW
│  ○ Exit
└
```

### Validation Report (All Valid)

```
┌  Settings Validation
│
◇  Scanning configuration files...
│
✓  ~/.claude/settings.json
   └ Valid JSON
   └ 3 settings configured
   └ No issues found
│
✓  .claude/settings.json (project)
   └ Valid JSON
   └ 5 settings configured (2 override user settings)
   └ No issues found
│
✓  .claude/settings.local.json (local)
   └ Valid JSON
   └ 2 settings configured
   └ No issues found
│
◇  All settings files are valid! ✓
└
```

### Validation Report (With Errors)

```
┌  Settings Validation
│
◇  Scanning configuration files...
│
⚠  ~/.claude/settings.json
   └ Valid JSON
   └ 3 settings configured
   └ 1 warning:
      • permissions.allow[0]: Pattern "Bash(*)" is too broad
        Suggestion: Use specific patterns like "Bash(git:*)"
│
✗  .claude/settings.json (project)
   └ Valid JSON
   └ 5 settings configured
   └ 2 errors:
      • hooks.PostToolUse[0].matcher: Invalid tool name "Edits"
        Did you mean "Edit"?
      • model: "claude-3-sonnet" is not a valid model identifier
        Valid options: claude-sonnet-4-5, claude-opus-4, claude-haiku-4
│
✓  .claude/settings.local.json (local)
   └ Valid JSON
   └ 2 settings configured
   └ No issues found
│
◆  Found 2 errors and 1 warning
│
◆  Actions:
│  ► Fix errors automatically
│  ► Show detailed report
│  ► Ignore and continue
│  ► Exit
└
```

### Detailed Error Report

```
┌  Validation Details
│
◆  Error 1 of 2
│
   File: .claude/settings.json
   Location: hooks.PostToolUse[0].matcher
   Error: Invalid tool name "Edits"
│
   Current value:
   {
     "matcher": "Edits|Write",
     "hooks": [...]
   }
│
   Suggested fix:
   {
     "matcher": "Edit|Write",
     "hooks": [...]
   }
│
◆  Apply this fix?
└
```

### Settings Hierarchy View

```
┌  Settings Hierarchy
│
◇  Showing effective settings with sources
│
┌─ mcpServers (active: 3 servers)
│  Source: .claude/settings.json (project)
│  Override: Yes (user had 5 servers)
│
├─ permissions.allow (12 rules)
│  Source: Multiple
│  ├─ ~/.claude/settings.json: 8 rules
│  └─ .claude/settings.local.json: 4 rules (added)
│
├─ hooks.PostToolUse (2 hooks)
│  Source: .claude/settings.json (project)
│
├─ model: "claude-sonnet-4-5"
│  Source: ~/.claude/settings.json (user)
│
└─ statusLine
   Source: .claude/settings.local.json (local)
   Override: Yes (project had different config)
│
◆  Actions:
│  ► Export merged settings
│  ► Show conflicts
│  ► Back to menu
└
```

## Technical Implementation

### Schema Integration

```typescript
import schema from '@spences10/claude-code-settings-schema';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
	allErrors: true,
	verbose: true,
});
addFormats(ajv);

const validateSettings = ajv.compile(schema);

async function validate(
	settings: unknown,
): Promise<ValidationResult> {
	const valid = validateSettings(settings);

	if (!valid) {
		return {
			valid: false,
			errors: validateSettings.errors?.map(formatError) || [],
		};
	}

	return {
		valid: true,
		errors: [],
		warnings: checkWarnings(settings),
	};
}
```

### Error Formatting

```typescript
interface ValidationError {
	path: string; // "hooks.PostToolUse[0].matcher"
	message: string;
	expected?: string;
	actual?: string;
	suggestion?: string;
	severity: 'error' | 'warning';
	fixable: boolean;
}

function formatError(ajvError: ErrorObject): ValidationError {
	return {
		path: ajvError.instancePath.slice(1).replace(/\//g, '.'),
		message: ajvError.message || 'Unknown error',
		expected: ajvError.params.type,
		actual: typeof ajvError.data,
		suggestion: generateSuggestion(ajvError),
		severity: 'error',
		fixable: canAutoFix(ajvError),
	};
}
```

### Warning Detection

Beyond schema validation, detect common issues:

```typescript
function checkWarnings(settings: any): ValidationError[] {
	const warnings: ValidationError[] = [];

	// Overly broad patterns
	if (settings.permissions?.allow?.includes('Bash(*)')) {
		warnings.push({
			path: 'permissions.allow',
			message:
				'Pattern "Bash(*)" allows ALL commands including dangerous ones',
			severity: 'warning',
			fixable: false,
			suggestion: 'Use specific patterns like "Bash(git:*)"',
		});
	}

	// Missing timeouts in hooks
	settings.hooks?.PostToolUse?.forEach((hook: any, i: number) => {
		if (!hook.timeout) {
			warnings.push({
				path: `hooks.PostToolUse[${i}].timeout`,
				message: 'Hook has no timeout (will wait indefinitely)',
				severity: 'warning',
				fixable: true,
				suggestion: 'Add "timeout": 30',
			});
		}
	});

	// Deprecated settings
	if ('ignorePatterns' in settings) {
		warnings.push({
			path: 'ignorePatterns',
			message:
				'ignorePatterns is deprecated, use permissions.deny instead',
			severity: 'warning',
			fixable: true,
			suggestion: 'Migrate to permissions.deny',
		});
	}

	return warnings;
}
```

### Auto-Fix Implementation

```typescript
interface Fix {
	path: string;
	oldValue: any;
	newValue: any;
	description: string;
}

function generateFixes(errors: ValidationError[]): Fix[] {
	return errors
		.filter((e) => e.fixable)
		.map((error) => {
			switch (error.path) {
				case 'hooks.PostToolUse[0].matcher':
					return {
						path: error.path,
						oldValue: 'Edits',
						newValue: 'Edit',
						description: 'Fix tool name typo',
					};
				// More fix patterns...
			}
		});
}

async function applyFixes(file: string, fixes: Fix[]): Promise<void> {
	const settings = await readJSON(file);

	for (const fix of fixes) {
		setByPath(settings, fix.path, fix.newValue);
	}

	await writeJSON(file, settings);
}
```

### File Discovery

```typescript
interface SettingsFile {
	path: string;
	type: 'user' | 'project' | 'local' | 'managed';
	exists: boolean;
	content?: any;
}

async function discoverSettingsFiles(): Promise<SettingsFile[]> {
	const files: SettingsFile[] = [
		{
			path: path.join(os.homedir(), '.claude', 'settings.json'),
			type: 'user',
			exists: await fileExists('~/.claude/settings.json'),
		},
		{
			path: path.join(process.cwd(), '.claude', 'settings.json'),
			type: 'project',
			exists: await fileExists('.claude/settings.json'),
		},
		{
			path: path.join(
				process.cwd(),
				'.claude',
				'settings.local.json',
			),
			type: 'local',
			exists: await fileExists('.claude/settings.local.json'),
		},
	];

	return files.filter((f) => f.exists);
}
```

### Hierarchy Resolution

```typescript
function mergeSettings(files: SettingsFile[]): any {
	// Merge order: user < project < local
	const merged = {};

	for (const file of files.sort(byPrecedence)) {
		deepMerge(merged, file.content);
	}

	return merged;
}

function trackSource(
	merged: any,
	files: SettingsFile[],
): SettingSource[] {
	// Track which file each setting came from
	const sources: SettingSource[] = [];

	for (const [key, value] of Object.entries(merged)) {
		const source = files.find((f) => key in f.content);
		sources.push({
			key,
			value,
			file: source?.path,
			type: source?.type,
		});
	}

	return sources;
}
```

## Validation Triggers

### Manual Validation

User selects "Validate settings" from menu.

### Automatic Validation

Run before:

- Creating backups
- Applying configuration changes
- Switching profiles

Show errors but allow user to proceed (don't block operations).

### CI Integration (Future)

```bash
mcpick validate --ci
# Exit code 0: all valid
# Exit code 1: errors found
```

## Implementation Phases

### Phase 1: Basic Validation

- Schema validation with Ajv
- Error reporting in terminal
- File discovery and JSON parsing

### Phase 2: Warnings & Suggestions

- Common pattern warnings
- Deprecation notices
- Suggestion generation

### Phase 3: Auto-Fix

- Interactive fix application
- Backup before fixing
- Dry-run mode

### Phase 4: Hierarchy Tools

- Settings source tracking
- Conflict detection
- Merged settings export

## Dependencies

```json
{
	"dependencies": {
		"ajv": "^8.12.0",
		"ajv-formats": "^2.1.1"
	},
	"devDependencies": {
		"@spences10/claude-code-settings-schema": "^1.0.0"
	}
}
```

## Success Metrics

- **Error Prevention**: Catch 90%+ of configuration errors before
  runtime
- **Time Saved**: Reduce time spent debugging config issues
- **Adoption**: Used before every backup/profile switch
- **Accuracy**: <1% false positives on validation

## Related Features

- **Permissions Management**: Validate permission patterns
- **Configuration Profiles**: Validate before saving profile
- **Backup System**: Validate before creating backup

## Open Questions

1. **Schema Updates**: How to handle schema version mismatches?
   - Proposed: Warn user, suggest updating schema package

2. **Custom Validation**: Should users be able to add custom
   validation rules?
   - Proposed: Phase 3+ feature

3. **Performance**: How to validate large settings files efficiently?
   - Proposed: Cache parsed files, only revalidate on change

4. **Error Priority**: How to prioritize which errors to show first?
   - Proposed: Show blocking errors first, then warnings
