import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { McpScope, McpServer } from '../types.js';

const execAsync = promisify(exec);

export interface CliResult {
	success: boolean;
	error?: string;
}

/**
 * Check if Claude CLI is available
 */
export async function check_claude_cli(): Promise<boolean> {
	try {
		await execAsync('claude --version');
		return true;
	} catch {
		return false;
	}
}

/**
 * Escape a string for shell usage
 */
function shell_escape(str: string): string {
	if (process.platform === 'win32') {
		// Windows cmd.exe does not support single-quote delimiters.
		// Use double quotes and escape internal double quotes.
		return `"${str.replace(/"/g, '\\"')}"`;
	}
	// Unix: replace single quotes with escaped version
	return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Validate environment variable key
 * Must start with letter or underscore, contain only alphanumeric and underscores
 */
function is_valid_env_key(key: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Build the claude mcp add command for a server
 */
function build_add_command(
	server: McpServer,
	scope: McpScope,
): string {
	const parts: string[] = ['claude', 'mcp', 'add'];

	// Server name
	parts.push(shell_escape(server.name));

	// Transport type
	const transport = server.type || 'stdio';
	parts.push('--transport', transport);

	// Scope
	parts.push('--scope', scope);

	// Handle different transport types
	if (transport === 'stdio') {
		// Environment variables (skip invalid keys to prevent injection)
		if (server.env) {
			for (const [key, value] of Object.entries(server.env)) {
				if (is_valid_env_key(key)) {
					parts.push('-e', `${key}=${shell_escape(value)}`);
				}
			}
		}

		// Command and args (after --)
		if ('command' in server && server.command) {
			parts.push('--');
			parts.push(shell_escape(server.command));
			if (server.args && server.args.length > 0) {
				parts.push(...server.args.map((arg) => shell_escape(arg)));
			}
		}
	} else {
		// HTTP or SSE transport — URL must come before header flags
		if ('url' in server && server.url) {
			parts.push(shell_escape(server.url));
		}

		if ('headers' in server && server.headers) {
			for (const [key, value] of Object.entries(server.headers)) {
				parts.push('-H', shell_escape(`${key}: ${value}`));
			}
		}
	}

	return parts.join(' ');
}

/**
 * Add an MCP server using Claude CLI
 */
export async function add_mcp_via_cli(
	server: McpServer,
	scope: McpScope,
): Promise<CliResult> {
	// Check if CLI is available
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	const command = build_add_command(server, scope);

	try {
		await execAsync(command);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to add server via CLI: ${message}`,
		};
	}
}

/**
 * Remove an MCP server using Claude CLI
 */
export async function remove_mcp_via_cli(
	name: string,
): Promise<CliResult> {
	// Check if CLI is available
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(`claude mcp remove ${shell_escape(name)}`);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to remove server via CLI: ${message}`,
		};
	}
}

/**
 * Install a plugin via Claude CLI
 */
export async function install_plugin_via_cli(
	key: string,
	scope: 'user' | 'project' | 'local' = 'user',
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(
			`claude plugin install ${shell_escape(key)} --scope ${scope}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to install plugin: ${message}`,
		};
	}
}

/**
 * Uninstall a plugin via Claude CLI
 */
export async function uninstall_plugin_via_cli(
	key: string,
	scope: 'user' | 'project' | 'local' = 'user',
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(
			`claude plugin uninstall ${shell_escape(key)} --scope ${scope}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to uninstall plugin: ${message}`,
		};
	}
}

/**
 * Update a plugin via Claude CLI
 */
export async function update_plugin_via_cli(
	key: string,
	scope: 'user' | 'project' | 'local' = 'user',
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(
			`claude plugin update ${shell_escape(key)} --scope ${scope}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to update plugin: ${message}`,
		};
	}
}

// --- Marketplace operations ---

export interface CliResultWithOutput extends CliResult {
	stdout?: string;
}

/**
 * Add a marketplace via Claude CLI
 */
/**
 * Extract GitHub owner/repo from various source formats.
 * Returns null if not a recognizable GitHub reference.
 */
function parse_github_repo(
	source: string,
): { owner: string; repo: string } | null {
	// HTTPS URL: https://github.com/owner/repo[.git]
	const https_match = source.match(
		/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/,
	);
	if (https_match)
		return { owner: https_match[1], repo: https_match[2] };

	// SSH URL: git@github.com:owner/repo[.git]
	const ssh_match = source.match(
		/^git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/,
	);
	if (ssh_match) return { owner: ssh_match[1], repo: ssh_match[2] };

	// Shorthand: owner/repo (no slashes beyond the one separator)
	const shorthand_match = source.match(/^([^/\s]+)\/([^/\s]+)$/);
	if (shorthand_match)
		return { owner: shorthand_match[1], repo: shorthand_match[2] };

	return null;
}

/**
 * Validate that a GitHub repository exists and is accessible.
 * Returns an error message if validation fails, null if OK.
 */
async function validate_github_repo(
	owner: string,
	repo: string,
): Promise<string | null> {
	try {
		const response = await fetch(
			`https://api.github.com/repos/${owner}/${repo}`,
			{
				method: 'GET',
				headers: { Accept: 'application/vnd.github.v3+json' },
			},
		);

		if (response.status === 200) return null;
		if (response.status === 404) {
			return `Repository '${owner}/${repo}' not found on GitHub. Check the name or ensure it's not private.`;
		}
		if (response.status === 403) {
			return `Access denied for '${owner}/${repo}'. The repository may be private — configure a GitHub token or use SSH.`;
		}
		return `GitHub API returned status ${response.status} for '${owner}/${repo}'.`;
	} catch {
		// Network error — skip validation and let the CLI attempt the clone
		return null;
	}
}

export async function marketplace_add_via_cli(
	source: string,
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	// Validate GitHub repo exists before attempting clone
	// Only validate shorthand (owner/repo) — explicit URLs imply the user knows the repo
	const gh = parse_github_repo(source);
	const is_shorthand =
		gh && !source.startsWith('http') && !source.startsWith('git@');
	if (gh && is_shorthand) {
		const validation_error = await validate_github_repo(
			gh.owner,
			gh.repo,
		);
		if (validation_error) {
			return { success: false, error: validation_error };
		}
	}

	try {
		await execAsync(
			`claude plugin marketplace add ${shell_escape(source)}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';

		// Provide clearer error messages for common failures
		if (
			message.includes('SSH') ||
			message.includes('Permission denied (publickey)')
		) {
			return {
				success: false,
				error: `SSH authentication failed for '${source}'. Either:\n  - Configure SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh\n  - Use HTTPS URL instead: https://github.com/${gh ? `${gh.owner}/${gh.repo}` : source}`,
			};
		}
		if (
			message.includes('not found') ||
			message.includes('does not exist')
		) {
			return {
				success: false,
				error: `Repository '${source}' not found. Check the name and your access permissions.`,
			};
		}

		return {
			success: false,
			error: `Failed to add marketplace: ${message}`,
		};
	}
}

/**
 * Remove a marketplace via Claude CLI
 */
export async function marketplace_remove_via_cli(
	name: string,
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(
			`claude plugin marketplace remove ${shell_escape(name)}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to remove marketplace: ${message}`,
		};
	}
}

/**
 * Update marketplace(s) via Claude CLI
 */
export async function marketplace_update_via_cli(
	name?: string,
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		const cmd = name
			? `claude plugin marketplace update ${shell_escape(name)}`
			: 'claude plugin marketplace update';
		await execAsync(cmd);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to update marketplace: ${message}`,
		};
	}
}

/**
 * List marketplaces via Claude CLI
 */
export async function marketplace_list_via_cli(): Promise<CliResultWithOutput> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		const { stdout } = await execAsync(
			'claude plugin marketplace list',
		);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to list marketplaces: ${message}`,
		};
	}
}

/**
 * Get the scope description for display
 */
export function get_scope_description(scope: McpScope): string {
	switch (scope) {
		case 'local':
			return 'This project only (default)';
		case 'project':
			return 'Shared via .mcp.json (version controlled)';
		case 'user':
			return 'Global - all projects';
	}
}

/**
 * Validate a plugin or marketplace manifest via Claude CLI
 */
export async function validate_plugin_via_cli(
	path: string,
): Promise<CliResultWithOutput> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		const { stdout } = await execAsync(
			`claude plugin validate ${shell_escape(path)}`,
		);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Validation failed: ${message}`,
		};
	}
}

/**
 * Get details about an MCP server via Claude CLI
 */
export async function mcp_get_via_cli(
	name: string,
): Promise<CliResultWithOutput> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		const { stdout } = await execAsync(
			`claude mcp get ${shell_escape(name)}`,
		);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to get server details: ${message}`,
		};
	}
}

/**
 * Add an MCP server from raw JSON via Claude CLI
 */
export async function mcp_add_json_via_cli(
	name: string,
	json: string,
	scope: McpScope = 'local',
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync(
			`claude mcp add-json ${shell_escape(name)} ${shell_escape(json)} --scope ${scope}`,
		);
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to add server from JSON: ${message}`,
		};
	}
}

/**
 * Reset project-scoped MCP server choices via Claude CLI
 */
export async function mcp_reset_project_choices_via_cli(): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await execAsync('claude mcp reset-project-choices');
		return { success: true };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Unknown error';
		return {
			success: false,
			error: `Failed to reset project choices: ${message}`,
		};
	}
}

/**
 * Get scope options for select prompt
 */
export function get_scope_options() {
	return [
		{
			value: 'local' as McpScope,
			label: 'Local',
			hint: 'This project only (default)',
		},
		{
			value: 'project' as McpScope,
			label: 'Project',
			hint: 'Shared via .mcp.json (git)',
		},
		{
			value: 'user' as McpScope,
			label: 'User (Global)',
			hint: 'Available in all projects',
		},
	];
}
