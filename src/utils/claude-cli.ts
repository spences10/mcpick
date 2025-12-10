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
	// Replace single quotes with escaped version
	return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Build the claude mcp add command for a server
 */
function build_add_command(server: McpServer, scope: McpScope): string {
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
		// Environment variables
		if (server.env) {
			for (const [key, value] of Object.entries(server.env)) {
				parts.push('-e', `${key}=${shell_escape(value)}`);
			}
		}

		// Command and args (after --)
		if ('command' in server && server.command) {
			parts.push('--');
			parts.push(server.command);
			if (server.args && server.args.length > 0) {
				parts.push(...server.args.map((arg) => shell_escape(arg)));
			}
		}
	} else {
		// HTTP or SSE transport
		if ('url' in server && server.url) {
			parts.push(server.url);
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
export async function remove_mcp_via_cli(name: string): Promise<CliResult> {
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
