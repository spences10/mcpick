import {
	access,
	readFile,
	readdir,
	writeFile,
} from 'node:fs/promises';
import { ClaudeConfig } from '../types.js';
import {
	ensure_directory_exists,
	get_profile_path,
	get_profiles_dir,
} from '../utils/paths.js';
import { read_claude_config } from './config.js';
import { validate_claude_config } from './validation.js';

export interface ProfileInfo {
	name: string;
	path: string;
	serverCount: number;
}

export async function load_profile(
	name: string,
): Promise<ClaudeConfig> {
	const profile_path = get_profile_path(name);

	try {
		await access(profile_path);
		const content = await readFile(profile_path, 'utf-8');
		const parsed = JSON.parse(content);

		// Profile can be either full ClaudeConfig format or just mcpServers object
		if (parsed.mcpServers) {
			return validate_claude_config(parsed);
		}

		// If it's just a servers object, wrap it
		return validate_claude_config({ mcpServers: parsed });
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			throw new Error(
				`Profile '${name}' not found at ${profile_path}`,
			);
		}
		throw error;
	}
}

export async function list_profiles(): Promise<ProfileInfo[]> {
	const profiles_dir = get_profiles_dir();

	try {
		await access(profiles_dir);
		const files = await readdir(profiles_dir);
		const json_files = files.filter((f) => f.endsWith('.json'));

		const profiles: ProfileInfo[] = [];
		for (const file of json_files) {
			try {
				const path = get_profile_path(file);
				const content = await readFile(path, 'utf-8');
				const parsed = JSON.parse(content);
				const servers = parsed.mcpServers || parsed;
				profiles.push({
					name: file.replace('.json', ''),
					path,
					serverCount: Object.keys(servers).length,
				});
			} catch {
				// Skip invalid profiles
			}
		}

		return profiles;
	} catch {
		return [];
	}
}

export async function save_profile(name: string): Promise<number> {
	const config = await read_claude_config();
	const servers = config.mcpServers || {};
	const server_count = Object.keys(servers).length;

	if (server_count === 0) {
		throw new Error('No MCP servers configured to save');
	}

	const profiles_dir = get_profiles_dir();
	await ensure_directory_exists(profiles_dir);

	const profile_path = get_profile_path(name);
	const content = JSON.stringify({ mcpServers: servers }, null, 2);
	await writeFile(profile_path, content, 'utf-8');

	return server_count;
}
