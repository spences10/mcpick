import { access, readFile, writeFile } from 'node:fs/promises';
import { ClaudeConfig, McpServer, McpServerBase } from '../types.js';
import { get_claude_config_path } from '../utils/paths.js';
import { validate_claude_config } from './validation.js';

export async function read_claude_config(): Promise<ClaudeConfig> {
	const config_path = get_claude_config_path();

	try {
		await access(config_path);
		const config_content = await readFile(config_path, 'utf-8');
		const parsed_config = JSON.parse(config_content);
		return validate_claude_config(parsed_config);
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return { mcpServers: {} };
		}
		throw error;
	}
}

export async function write_claude_config(
	config: ClaudeConfig,
): Promise<void> {
	const config_path = get_claude_config_path();

	// Read the entire existing file to preserve all other sections
	let existing_config: any = {};
	try {
		const existing_content = await readFile(config_path, 'utf-8');
		existing_config = JSON.parse(existing_content);
	} catch (error) {
		// If file doesn't exist or is invalid, start with empty object
	}

	// Only update the mcpServers section, preserve everything else
	existing_config.mcpServers = config.mcpServers;

	const config_content = JSON.stringify(existing_config, null, 2);
	await writeFile(config_path, config_content, 'utf-8');
}

export function get_enabled_servers(
	config: ClaudeConfig,
): McpServer[] {
	if (!config.mcpServers) {
		return [];
	}

	return Object.entries(config.mcpServers).map(([name, server]) => ({
		...server,
		name,
	}));
}

export function create_config_from_servers(
	selected_servers: McpServer[],
): ClaudeConfig {
	const mcp_servers: { [key: string]: McpServerBase } = {};

	selected_servers.forEach((server) => {
		const { name, ...server_config } = server;
		mcp_servers[name] = server_config;
	});

	return { mcpServers: mcp_servers };
}
