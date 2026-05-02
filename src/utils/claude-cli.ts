import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { McpScope, McpServer } from '../types.js';
import { redact_text } from './redact.js';

const exec_file_async = promisify(execFile);

export interface CliResult {
	success: boolean;
	error?: string;
}

/**
 * Check if Claude CLI is available
 */
export async function check_claude_cli(): Promise<boolean> {
	try {
		await exec_file_async('claude', ['--version']);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate environment variable key.
 * Must start with letter or underscore, contain only alphanumeric and underscores.
 */
export function is_valid_env_key(key: string): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * Build args array for claude mcp add command.
 * Returns raw args — no shell escaping needed since we use execFile.
 */
export function build_add_args(
	server: McpServer,
	scope: McpScope,
): string[] {
	const args: string[] = ['mcp', 'add'];

	args.push(server.name);

	const transport = server.type || 'stdio';
	if (transport !== 'stdio') {
		args.push('--transport', transport);
	}

	args.push('--scope', scope);

	if (transport === 'stdio') {
		if (server.env) {
			for (const [key, value] of Object.entries(server.env)) {
				if (is_valid_env_key(key)) {
					args.push('-e', `${key}=${value}`);
				}
			}
		}

		if ('command' in server && server.command) {
			args.push('--');
			args.push(server.command);
			if (server.args && server.args.length > 0) {
				args.push(...server.args);
			}
		}
	} else {
		if ('url' in server && server.url) {
			args.push(server.url);
		}

		if ('headers' in server && server.headers) {
			for (const [key, value] of Object.entries(server.headers)) {
				args.push('-H', `${key}: ${value}`);
			}
		}
	}

	return args;
}

/**
 * Run a claude CLI command using execFile (no shell).
 * This avoids all shell escaping issues on every platform.
 */
async function run_claude(
	args: string[],
): Promise<{ stdout: string; stderr: string }> {
	const result = await exec_file_async('claude', args);
	return {
		stdout: redact_text(result.stdout),
		stderr: redact_text(result.stderr),
	};
}

function get_redacted_error_message(error: unknown): string {
	return redact_text(
		error instanceof Error ? error.message : 'Unknown error',
	);
}

/**
 * Add an MCP server using Claude CLI
 */
export async function add_mcp_via_cli(
	server: McpServer,
	scope: McpScope,
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await run_claude(build_add_args(server, scope));
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
		return {
			success: false,
			error: `Failed to add server via CLI: ${message}`,
		};
	}
}

/**
 * Remove an MCP server using Claude CLI
 */
export function build_remove_args(
	name: string,
	scope?: McpScope,
): string[] {
	return scope
		? ['mcp', 'remove', name, '--scope', scope]
		: ['mcp', 'remove', name];
}

export async function remove_mcp_via_cli(
	name: string,
	scope?: McpScope,
): Promise<CliResult> {
	const cli_available = await check_claude_cli();
	if (!cli_available) {
		return {
			success: false,
			error: 'Claude CLI not found. Please install Claude Code CLI.',
		};
	}

	try {
		await run_claude(build_remove_args(name, scope));
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		await run_claude(['plugin', 'install', key, '--scope', scope]);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		await run_claude(['plugin', 'uninstall', key, '--scope', scope]);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		await run_claude(['plugin', 'update', key, '--scope', scope]);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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

type GitHubSourceKind = 'https' | 'ssh' | 'shorthand';

export interface GitHubRepoRef {
	owner: string;
	repo: string;
	kind: GitHubSourceKind;
}

const GITHUB_OWNER_PATTERN =
	'[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?';
const GITHUB_REPO_PATTERN = '[A-Za-z0-9._-]+';

/**
 * Extract GitHub owner/repo from various source formats.
 * Returns null if not a recognizable GitHub reference.
 */
export function parse_github_repo(
	source: string,
): GitHubRepoRef | null {
	const trimmed = source.trim();

	try {
		const url = new URL(trimmed);
		if (url.hostname !== 'github.com') return null;

		const [owner, raw_repo, ...rest] = url.pathname
			.split('/')
			.filter(Boolean);
		if (!owner || !raw_repo || rest.length > 0) return null;

		const repo = raw_repo.replace(/\.git$/, '');
		if (!is_valid_github_repo(owner, repo)) return null;
		return { owner, repo, kind: 'https' };
	} catch {
		// Not a URL; try SSH and shorthand forms below.
	}

	const ssh_match = trimmed.match(
		new RegExp(
			`^git@github\\.com:(${GITHUB_OWNER_PATTERN})/(${GITHUB_REPO_PATTERN})(?:\\.git)?$`,
		),
	);
	if (ssh_match) {
		return {
			owner: ssh_match[1],
			repo: ssh_match[2].replace(/\.git$/, ''),
			kind: 'ssh',
		};
	}

	const shorthand_match = trimmed.match(
		new RegExp(
			`^(${GITHUB_OWNER_PATTERN})/(${GITHUB_REPO_PATTERN})$`,
		),
	);
	if (shorthand_match) {
		return {
			owner: shorthand_match[1],
			repo: shorthand_match[2],
			kind: 'shorthand',
		};
	}

	return null;
}

function is_valid_github_repo(owner: string, repo: string): boolean {
	return (
		new RegExp(`^${GITHUB_OWNER_PATTERN}$`).test(owner) &&
		new RegExp(`^${GITHUB_REPO_PATTERN}$`).test(repo)
	);
}

export function build_marketplace_add_args(source: string): string[] {
	return ['plugin', 'marketplace', 'add', source];
}

function get_github_repo_id(ref: GitHubRepoRef): string {
	return `${ref.owner}/${ref.repo}`;
}

function get_github_clone_urls(ref: GitHubRepoRef): string[] {
	const repo_id = get_github_repo_id(ref);
	const https_url = `https://github.com/${repo_id}.git`;
	const ssh_url = `git@github.com:${repo_id}.git`;

	if (ref.kind === 'https') return [https_url];
	if (ref.kind === 'ssh') return [ssh_url];
	return [https_url, ssh_url];
}

function get_process_error_output(error: unknown): string {
	const process_error = error as {
		message?: string;
		stdout?: string | Buffer;
		stderr?: string | Buffer;
	};
	return redact_text(
		[
			process_error.message,
			process_error.stderr?.toString(),
			process_error.stdout?.toString(),
		]
			.filter(Boolean)
			.join('\n'),
	);
}

async function can_access_with_git(
	url: string,
): Promise<string | null> {
	try {
		await exec_file_async(
			'git',
			['ls-remote', '--exit-code', url, 'HEAD'],
			{
				env: {
					...process.env,
					GIT_TERMINAL_PROMPT: '0',
					GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
				},
				timeout: 15_000,
			},
		);
		return null;
	} catch (error) {
		return get_process_error_output(error);
	}
}

async function can_view_with_gh(
	repo_id: string,
): Promise<boolean | null> {
	try {
		await exec_file_async(
			'gh',
			['repo', 'view', repo_id, '--json', 'nameWithOwner'],
			{ timeout: 15_000 },
		);
		return true;
	} catch (error) {
		const message = get_process_error_output(error).toLowerCase();
		if (
			message.includes('could not resolve') ||
			message.includes('not found') ||
			message.includes('repository not found')
		) {
			return false;
		}
		return null;
	}
}

async function get_github_api_status(
	repo_id: string,
): Promise<number | null> {
	try {
		const response = await fetch(
			`https://api.github.com/repos/${repo_id}`,
			{
				method: 'GET',
				headers: { Accept: 'application/vnd.github.v3+json' },
			},
		);
		return response.status;
	} catch {
		return null;
	}
}

/**
 * Validate that a GitHub repository can be accessed by git without cloning it.
 * Returns an error message if validation fails, null if OK.
 */
async function validate_github_repo(
	ref: GitHubRepoRef,
): Promise<string | null> {
	const repo_id = get_github_repo_id(ref);
	const git_errors: string[] = [];

	for (const url of get_github_clone_urls(ref)) {
		const git_error = await can_access_with_git(url);
		if (!git_error) return null;
		git_errors.push(git_error);
	}

	const gh_visible = await can_view_with_gh(repo_id);
	if (gh_visible === false) {
		return `Repository '${repo_id}' not found or not accessible with your GitHub account.`;
	}

	const api_status = await get_github_api_status(repo_id);
	if (api_status === 404 && gh_visible !== true) {
		return `Repository '${repo_id}' not found or private/inaccessible. Check the name, sign in with 'gh auth login', or use an SSH URL with access.`;
	}
	if (api_status === 403 && gh_visible !== true) {
		return `Unable to validate '${repo_id}' because GitHub API access was denied or rate-limited. Git access also failed; check your credentials.`;
	}

	return format_git_access_error(ref, git_errors.join('\n'));
}

function format_git_access_error(
	ref: GitHubRepoRef,
	message: string,
): string {
	const repo_id = get_github_repo_id(ref);
	const lower = message.toLowerCase();

	if (
		ref.kind === 'shorthand' &&
		(lower.includes('could not read username') ||
			lower.includes('authentication failed')) &&
		(lower.includes('permission denied (publickey)') ||
			lower.includes('ssh authentication'))
	) {
		return `Repository '${repo_id}' exists, but Git cannot access it over HTTPS or SSH. Run 'gh auth login' and 'gh auth setup-git', or configure an SSH key with GitHub.`;
	}

	if (
		ref.kind === 'https' ||
		lower.includes('https authentication failed') ||
		lower.includes('could not read username') ||
		lower.includes('authentication failed')
	) {
		return `Repository '${repo_id}' exists, but HTTPS Git authentication failed. Run 'gh auth login' and 'gh auth setup-git', configure a Git credential helper, or use git@github.com:${repo_id}.git.`;
	}

	if (
		ref.kind === 'ssh' ||
		lower.includes('permission denied (publickey)') ||
		lower.includes('ssh authentication')
	) {
		return `SSH authentication failed for '${repo_id}'. Configure an SSH key with GitHub or use https://github.com/${repo_id}.git with a configured Git credential helper.`;
	}

	return `Unable to access GitHub repository '${repo_id}' with git. Check that the repository exists and that your HTTPS or SSH credentials can clone it.`;
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

	// Validate GitHub repo existence, access, and clone credentials before Claude tries to clone.
	const gh = parse_github_repo(source);
	if (gh) {
		const validation_error = await validate_github_repo(gh);
		if (validation_error) {
			return { success: false, error: validation_error };
		}
	}

	try {
		await run_claude(build_marketplace_add_args(source));
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);

		const lower_message = message.toLowerCase();
		if (gh) {
			if (
				lower_message.includes('https authentication failed') ||
				lower_message.includes('could not read username') ||
				lower_message.includes('authentication failed')
			) {
				return {
					success: false,
					error: format_git_access_error(gh, message),
				};
			}
			if (
				message.includes('SSH') ||
				message.includes('Permission denied (publickey)')
			) {
				return {
					success: false,
					error: format_git_access_error(gh, message),
				};
			}
		}

		if (
			lower_message.includes('not found') ||
			lower_message.includes('does not exist')
		) {
			return {
				success: false,
				error: gh
					? `Repository '${get_github_repo_id(gh)}' not found or not accessible with your GitHub account.`
					: `Repository '${source}' not found. Check the name and your access permissions.`,
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
		await run_claude(['plugin', 'marketplace', 'remove', name]);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		const args = ['plugin', 'marketplace', 'update'];
		if (name) args.push(name);
		await run_claude(args);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		const { stdout } = await run_claude([
			'plugin',
			'marketplace',
			'list',
		]);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		const { stdout } = await run_claude(['plugin', 'validate', path]);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		const { stdout } = await run_claude(['mcp', 'get', name]);
		return { success: true, stdout: stdout.trim() };
	} catch (error) {
		const message = get_redacted_error_message(error);
		return {
			success: false,
			error: `Failed to get server details: ${message}`,
		};
	}
}

/**
 * Add an MCP server from raw JSON via Claude CLI
 */
export function build_add_json_args(
	name: string,
	json: string,
	scope: McpScope = 'local',
): string[] {
	return ['mcp', 'add-json', name, json, '--scope', scope];
}

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
		await run_claude(build_add_json_args(name, json, scope));
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
		await run_claude(['mcp', 'reset-project-choices']);
		return { success: true };
	} catch (error) {
		const message = get_redacted_error_message(error);
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
