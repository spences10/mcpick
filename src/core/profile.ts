import { access, readFile, readdir } from 'node:fs/promises';
import { ClaudeConfig } from '../types.js';
import {
	ensure_directory_exists,
	get_profile_path,
	get_profiles_dir,
} from '../utils/paths.js';
import { safe_json_write } from '../utils/safe-apply.js';
import { read_claude_config, write_claude_config } from './config.js';
import {
	read_claude_settings,
	write_claude_settings,
} from './settings.js';
import { validate_claude_config } from './validation.js';

export interface ProfileInfo {
	name: string;
	path: string;
	serverCount: number;
	pluginCount: number;
}

export interface ProfileData {
	config: ClaudeConfig;
	enabledPlugins?: Record<string, boolean>;
}

export interface ProfileApplyResult {
	profile: string;
	serverCount: number;
	pluginCount: number;
}

export interface ProfileSaveResult {
	profile: string;
	serverCount: number;
	pluginCount: number;
}

export async function load_profile(
	name: string,
): Promise<ProfileData> {
	const profile_path = get_profile_path(name);

	try {
		await access(profile_path);
		const content = await readFile(profile_path, 'utf-8');
		const parsed = JSON.parse(content);

		// Profile can be either full format or just mcpServers object
		let config: ClaudeConfig;
		if (parsed.mcpServers) {
			config = validate_claude_config(parsed);
		} else if (!parsed.enabledPlugins) {
			// Bare servers object (legacy)
			config = validate_claude_config({ mcpServers: parsed });
		} else {
			config = validate_claude_config({
				mcpServers: parsed.mcpServers || {},
			});
		}

		return {
			config,
			enabledPlugins: parsed.enabledPlugins,
		};
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

export async function apply_profile_to_claude(
	name: string,
): Promise<ProfileApplyResult> {
	const profile = await load_profile(name);
	await write_claude_config(profile.config);

	const serverCount = Object.keys(
		profile.config.mcpServers || {},
	).length;
	let pluginCount = 0;

	if (profile.enabledPlugins) {
		await write_claude_settings({
			enabledPlugins: profile.enabledPlugins,
		});
		pluginCount = Object.keys(profile.enabledPlugins).length;
	}

	return { profile: name, serverCount, pluginCount };
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
				const plugins = parsed.enabledPlugins || {};
				profiles.push({
					name: file.replace('.json', ''),
					path,
					serverCount: Object.keys(servers).length,
					pluginCount: Object.keys(plugins).length,
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

export async function save_profile(
	name: string,
): Promise<{ serverCount: number; pluginCount: number }> {
	const config = await read_claude_config();
	const settings = await read_claude_settings();
	const servers = config.mcpServers || {};
	const plugins = settings.enabledPlugins || {};
	const server_count = Object.keys(servers).length;
	const plugin_count = Object.keys(plugins).length;

	if (server_count === 0 && plugin_count === 0) {
		throw new Error('No MCP servers or plugins configured to save');
	}

	const profiles_dir = get_profiles_dir();
	await ensure_directory_exists(profiles_dir);

	const profile_data: Record<string, unknown> = {
		mcpServers: servers,
	};
	if (plugin_count > 0) {
		profile_data.enabledPlugins = plugins;
	}

	const profile_path = get_profile_path(name);
	await safe_json_write(profile_path, profile_data, 2);

	return { serverCount: server_count, pluginCount: plugin_count };
}

export async function save_current_claude_profile(
	name: string,
): Promise<ProfileSaveResult> {
	const counts = await save_profile(name);
	return {
		profile: name,
		serverCount: counts.serverCount,
		pluginCount: counts.pluginCount,
	};
}
