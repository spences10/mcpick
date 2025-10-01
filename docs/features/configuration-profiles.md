# Configuration Profiles Feature

## Overview

Save and restore complete Claude Code configuration snapshots
(permissions + MCP servers + hooks + other settings) for quick context
switching between different workflows.

## Problem Statement

Developers work in different contexts that require different
configurations:

- **Code Review**: Need read-only access, no modifications
- **Active Development**: Full tooling, permissive permissions
- **Production Deploy**: Only deployment tools, strict permissions
- **Testing**: Test databases, mock servers, allow test file changes

Currently, switching between these contexts requires:

- Manual editing of multiple settings
- Risk of forgetting to switch back
- No easy way to share team configurations
- Difficult to maintain consistency

## Solution

Add profile management to MCPick:

1. **Save profiles** - Capture current configuration as named profile
2. **Load profiles** - Switch to profile with one command
3. **Profile templates** - Pre-built profiles for common workflows
4. **Import/Export** - Share profiles with team
5. **Smart switching** - Suggest profiles based on context

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
│  ● Configuration profiles  ← NEW
│  ○ Exit
└
```

### Profiles Menu

```
┌  Configuration Profiles
│
◇  Current Profile: Full Development (modified)
│
◆  What would you like to do?
│  ● Load profile
│  ○ Save current as profile
│  ○ Create from template
│  ○ Delete profile
│  ○ Import profile
│  ○ Export profile
│  ○ Back to main menu
└
```

### Load Profile

```
┌  Load Configuration Profile
│
◆  Select profile to load:
│
│  My Profiles:
│  ● Full Development
│     12 MCP servers • Permissive permissions • 3 hooks
│     Last used: 2 hours ago
│
│  ○ Safe Code Review
│     2 MCP servers • Read-only permissions • No hooks
│     Last used: Yesterday
│
│  ○ Production Deploy
│     3 MCP servers • Strict permissions • Deploy hooks
│     Last used: 3 days ago
│
│  Templates:
│  ○ Quick Start (Basic development setup)
│  ○ Database Work (DB tools + query servers)
│  ○ API Development (HTTP tools + API servers)
│
◇  Profile Details: Full Development
│
   MCP Servers (12 enabled):
   ✓ mcp-sqlite-tools
   ✓ mcp-omnisearch
   ✓ playwright
   ... and 9 more
│
   Permissions:
   • Bash: Ask (except git:*)
   • Read: Allow all
   • Write/Edit: Ask
   • WebFetch/Search: Allow
│
   Hooks:
   • PostToolUse: prettier on edits
   • PostToolUse: eslint on saves
   • Notification: team chat alerts
│
◆  Load this profile?
│  ⚠ Current configuration has unsaved changes
│
│  ► Load (discard changes)
│  ► Save current first, then load
│  ► Cancel
└
```

### Save Profile

```
┌  Save Configuration Profile
│
◆  Profile name:
│  Full Development_
│
◆  Description (optional):
│  Complete dev setup with all tools and permissive permissions
│
◆  Include in profile:
│  ✓ MCP Servers (12 enabled)
│  ✓ Permissions (custom rules)
│  ✓ Hooks (3 configured)
│  ○ Environment variables (2 vars)
│  ○ Model preference
│  ○ Status line config
│
◆  Tags (optional):
│  development, full-stack, daily_
│
◇  This profile will be saved to:
   ~/.claude/mcpick/profiles/full-development.json
│
◆  Save profile?
└
```

### Create from Template

```
┌  Create Profile from Template
│
◆  Select a template:
│
│  ● Quick Start
│     Basic development setup
│     • 3 essential MCP servers
│     • Balanced permissions
│     • No hooks
│
│  ○ Database Work
│     Focus on database operations
│     • SQLite, PostgreSQL MCP servers
│     • File write restricted to migrations
│     • Schema validation hooks
│
│  ○ API Development
│     REST API and HTTP tooling
│     • HTTP client MCP servers
│     • WebFetch allowed
│     • API test hooks
│
│  ○ Code Review
│     Read-only configuration
│     • Documentation MCP servers only
│     • All write operations denied
│     • Git read-only commands allowed
│
│  ○ Frontend Development
│     UI/UX focused setup
│     • Browser automation (Playwright)
│     • Component preview servers
│     • Style formatter hooks
│
◆  Customize after creation?
└
```

### Import Profile

```
┌  Import Configuration Profile
│
◆  Import from:
│  ● File (JSON)
│  ○ URL
│  ○ Clipboard
│
◆  File path:
│  /home/user/downloads/team-review-profile.json_
│
◇  Validating profile...
│
✓  Profile is valid
│
   Name: Team Code Review
   Description: Standard code review setup for team
   Created by: team-lead@company.com
   Created: 2025-01-15
│
   Contents:
   • 2 MCP servers
   • Read-only permissions
   • Git diff/log hooks
│
◆  Import this profile?
│  ► Import as "Team Code Review"
│  ► Import and rename
│  ► Cancel
└
```

## Profile Format

Profiles are stored as JSON files in `~/.claude/mcpick/profiles/`:

```json
{
	"version": "1.0",
	"metadata": {
		"name": "Full Development",
		"description": "Complete dev setup with all tools",
		"tags": ["development", "full-stack"],
		"created": "2025-01-20T10:30:00Z",
		"lastModified": "2025-01-20T10:30:00Z",
		"author": "user@example.com"
	},
	"settings": {
		"mcpServers": {
			"mcp-sqlite-tools": {
				"command": "npx",
				"args": ["-y", "mcp-sqlite-tools"]
			},
			"mcp-omnisearch": {
				"command": "npx",
				"args": ["-y", "mcp-omnisearch"]
			}
		},
		"permissions": {
			"allow": ["Read(*)", "Bash(git:*)"],
			"ask": ["Write(*)", "Edit(*)"],
			"deny": ["Bash(rm:*)", "Bash(sudo:*)"]
		},
		"hooks": {
			"PostToolUse": [
				{
					"matcher": "Edit|Write",
					"hooks": [
						{
							"type": "command",
							"command": "prettier --write",
							"timeout": 30
						}
					]
				}
			]
		},
		"env": {
			"NODE_ENV": "development"
		},
		"model": "claude-sonnet-4-5"
	}
}
```

## Technical Implementation

### Data Structures

```typescript
interface Profile {
	version: string;
	metadata: ProfileMetadata;
	settings: ProfileSettings;
}

interface ProfileMetadata {
	name: string;
	description?: string;
	tags?: string[];
	created: string; // ISO date
	lastModified: string;
	author?: string;
	lastUsed?: string;
}

interface ProfileSettings {
	mcpServers?: Record<string, McpServerBase>;
	permissions?: Permissions;
	hooks?: HookConfig;
	env?: Record<string, string>;
	model?: string;
	statusLine?: StatusLineConfig;
}
```

### Profile Management

```typescript
class ProfileManager {
	private profilesDir = path.join(
		os.homedir(),
		'.claude',
		'mcpick',
		'profiles',
	);

	async listProfiles(): Promise<Profile[]> {
		const files = await fs.readdir(this.profilesDir);
		return Promise.all(
			files
				.filter((f) => f.endsWith('.json'))
				.map((f) => this.loadProfile(path.join(this.profilesDir, f))),
		);
	}

	async saveProfile(profile: Profile): Promise<void> {
		profile.metadata.lastModified = new Date().toISOString();
		const filename = this.sanitizeFilename(profile.metadata.name);
		await fs.writeJSON(
			path.join(this.profilesDir, filename),
			profile,
			{
				spaces: 2,
			},
		);
	}

	async loadProfile(path: string): Promise<Profile> {
		return fs.readJSON(path);
	}

	async deleteProfile(name: string): Promise<void> {
		const filename = this.sanitizeFilename(name);
		await fs.remove(path.join(this.profilesDir, filename));
	}

	async applyProfile(profile: Profile): Promise<void> {
		const settings = await readClaudeSettings();

		// Merge profile settings into current settings
		Object.assign(settings, profile.settings);

		await writeClaudeSettings(settings);

		// Update lastUsed
		profile.metadata.lastUsed = new Date().toISOString();
		await this.saveProfile(profile);
	}
}
```

### Current State Capture

```typescript
async function captureCurrentState(): Promise<ProfileSettings> {
	const settings = await readClaudeSettings();

	return {
		mcpServers: settings.mcpServers || {},
		permissions: settings.permissions || {},
		hooks: settings.hooks || {},
		env: settings.env || {},
		model: settings.model,
		statusLine: settings.statusLine,
	};
}
```

### Profile Templates

```typescript
const TEMPLATES: Record<string, Profile> = {
	'quick-start': {
		version: '1.0',
		metadata: {
			name: 'Quick Start',
			description: 'Basic development setup',
			tags: ['template', 'beginner'],
			created: new Date().toISOString(),
			lastModified: new Date().toISOString(),
		},
		settings: {
			mcpServers: {
				'mcp-filesystem': {
					command: 'npx',
					args: ['-y', 'mcp-filesystem'],
				},
				'mcp-git': {
					command: 'npx',
					args: ['-y', 'mcp-git'],
				},
			},
			permissions: {
				allow: ['Read(*)', 'Bash(git:*)'],
				ask: ['Write(*)', 'Edit(*)'],
			},
		},
	},
	// More templates...
};
```

### Profile Validation

```typescript
async function validateProfile(
	profile: Profile,
): Promise<ValidationResult> {
	const errors: string[] = [];

	// Check required fields
	if (!profile.version) errors.push('Missing version');
	if (!profile.metadata?.name) errors.push('Missing profile name');

	// Validate settings structure
	if (profile.settings) {
		const settingsValid = await validateSettings(profile.settings);
		if (!settingsValid.valid) {
			errors.push(...settingsValid.errors.map((e) => e.message));
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}
```

### Smart Context Detection

```typescript
async function suggestProfile(): Promise<string | null> {
	const cwd = process.cwd();
	const packageJson = await readPackageJson(cwd);

	// Frontend project
	if (
		packageJson?.dependencies?.['react'] ||
		packageJson?.dependencies?.['vue']
	) {
		return 'frontend-development';
	}

	// API project
	if (
		packageJson?.dependencies?.['express'] ||
		packageJson?.dependencies?.['fastify']
	) {
		return 'api-development';
	}

	// Check git status
	const gitStatus = await getGitStatus();
	if (gitStatus.branch.includes('review')) {
		return 'code-review';
	}

	return null;
}
```

## Profile Storage

Profiles stored in: `~/.claude/mcpick/profiles/`

```
~/.claude/
└── mcpick/
    ├── profiles/
    │   ├── full-development.json
    │   ├── safe-code-review.json
    │   ├── production-deploy.json
    │   └── templates/
    │       ├── quick-start.json
    │       ├── database-work.json
    │       └── api-development.json
    ├── backups/
    └── servers.json
```

## Implementation Phases

### Phase 1: Basic Profiles

- Save/load profiles
- Profile storage and management
- Simple menu integration

### Phase 2: Templates

- Pre-built templates
- Template customization
- Import/export

### Phase 3: Smart Features

- Context detection
- Profile suggestions
- Diff between profiles

### Phase 4: Team Features

- Shared profile repository
- Profile versioning
- Team profile sync

## Use Case Examples

### Example 1: Code Review

```bash
# Morning: Start code review
$ mcpick profiles load "Code Review"
✓ Loaded Code Review profile
  • 2 MCP servers enabled
  • Read-only permissions active
  • Ready for safe code review

# Review code, make notes...

# Afternoon: Back to development
$ mcpick profiles load "Full Development"
✓ Loaded Full Development profile
  • 12 MCP servers enabled
  • Development permissions active
```

### Example 2: Team Onboarding

```bash
# New team member receives team-standard.json
$ mcpick profiles import team-standard.json
✓ Imported "Team Standard" profile

$ mcpick profiles load "Team Standard"
✓ Loaded Team Standard profile
  • Company-approved MCP servers
  • Team permission policies
  • Standard hooks configured
```

### Example 3: Context Switching

```bash
# Working on frontend
$ cd ~/projects/webapp
$ mcpick profiles load "Frontend Development"

# Switch to API work
$ cd ~/projects/api
$ mcpick profiles suggest
💡 Detected API project, suggest loading "API Development"?
$ mcpick profiles load "API Development"
```

## Success Metrics

- **Time Saved**: Reduce config switching time from 5-10 min to <30
  sec
- **Adoption**: 70%+ of users create at least 2 profiles
- **Sharing**: 40%+ of teams share profiles
- **Consistency**: Reduce misconfiguration errors by 80%

## Related Features

- **Settings Validation**: Validate profiles before save/load
- **Permissions Management**: Include in profiles
- **Backup System**: Automatic backup before profile switch

## Open Questions

1. **Merge Strategy**: What happens if user has unsaved changes?
   - Proposed: Prompt to save as new profile or discard

2. **Partial Profiles**: Should profiles support partial
   configurations?
   - Proposed: Yes, allow profiles to only set specific sections

3. **Auto-Switch**: Should MCPick auto-switch based on directory?
   - Proposed: Opt-in feature, disabled by default

4. **Conflicts**: How to handle profiles with conflicting settings?
   - Proposed: Last-loaded wins, show warnings

5. **Versioning**: How to handle profile format changes?
   - Proposed: Version field, migration system
