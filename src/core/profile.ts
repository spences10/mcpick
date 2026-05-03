import { access, readdir, readFile } from 'node:fs/promises';
import { ClaudeConfig, McpServerBase } from '../types.js';
import {
	ensure_directory_exists,
	get_profile_path,
	get_profiles_dir,
} from '../utils/paths.js';
import { safe_json_write } from '../utils/safe-apply.js';
import {
	get_client_adapter,
	McpClientScope,
	normalize_mcp_server,
	PortableMcpServer,
	replace_client_servers,
	resolve_client_location,
} from './client-config.js';
import {
	get_enabled_servers,
	read_claude_config,
	write_claude_config,
} from './config.js';
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

export interface PortableProfileData {
	version: 2;
	servers: PortableMcpServer[];
	plugins?: Record<string, boolean>;
	client_overrides?: Record<string, unknown>;
}

export interface ProfileApplyResult {
	profile: string;
	serverCount: number;
	pluginCount: number;
	client?: string;
	scope?: string;
	location?: string;
}

export interface ProfileSaveResult {
	profile: string;
	serverCount: number;
	pluginCount: number;
	client?: string;
	scope?: string;
	location?: string;
}

type JsonObject = Record<string, unknown>;

function is_object(value: unknown): value is JsonObject {
	return (
		!!value && typeof value === 'object' && !Array.isArray(value)
	);
}

function string_record(
	value: unknown,
): Record<string, string> | undefined {
	if (!is_object(value)) return undefined;
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'string') result[key] = item;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function boolean_record(
	value: unknown,
): Record<string, boolean> | undefined {
	if (!is_object(value)) return undefined;
	const result: Record<string, boolean> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'boolean') result[key] = item;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function string_array(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const result = value.filter(
		(item): item is string => typeof item === 'string',
	);
	return result.length > 0 ? result : undefined;
}

function parse_portable_server(
	value: unknown,
): PortableMcpServer | null {
	if (!is_object(value) || typeof value.name !== 'string')
		return null;
	const transport =
		value.transport === 'http' ||
		value.transport === 'sse' ||
		value.transport === 'stdio'
			? value.transport
			: 'stdio';
	const client_options = is_object(value.client_options)
		? value.client_options
		: undefined;

	return {
		name: value.name,
		transport,
		...(typeof value.command === 'string'
			? { command: value.command }
			: {}),
		...(string_array(value.args)
			? { args: string_array(value.args) }
			: {}),
		...(typeof value.url === 'string' ? { url: value.url } : {}),
		...(string_record(value.env)
			? { env: string_record(value.env) }
			: {}),
		...(string_record(value.headers)
			? { headers: string_record(value.headers) }
			: {}),
		...(typeof value.description === 'string'
			? { description: value.description }
			: {}),
		...(typeof value.disabled === 'boolean'
			? { disabled: value.disabled }
			: {}),
		...(client_options ? { client_options } : {}),
	};
}

async function read_profile_json(name: string): Promise<JsonObject> {
	const profile_path = get_profile_path(name);
	try {
		await access(profile_path);
		return JSON.parse(
			await readFile(profile_path, 'utf-8'),
		) as JsonObject;
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

function legacy_profile_to_claude_config(
	parsed: JsonObject,
): ClaudeConfig {
	if (parsed.mcpServers) {
		return validate_claude_config(parsed);
	}
	if (!parsed.enabledPlugins && !parsed.plugins) {
		return validate_claude_config({ mcpServers: parsed });
	}
	return validate_claude_config({
		mcpServers: parsed.mcpServers || {},
	});
}

function claude_config_to_portable(
	config: ClaudeConfig,
): PortableMcpServer[] {
	return Object.entries(config.mcpServers || {}).map(
		([name, server]) =>
			normalize_mcp_server(name, server as JsonObject),
	);
}

function portable_to_claude_config(
	servers: PortableMcpServer[],
): ClaudeConfig {
	const mcpServers: Record<string, McpServerBase> = {};
	for (const server of servers) {
		const config: JsonObject = {};
		if (server.transport !== 'stdio') config.type = server.transport;
		if (server.command) config.command = server.command;
		if (server.args) config.args = server.args;
		if (server.url) config.url = server.url;
		if (server.env) config.env = server.env;
		if (server.headers) config.headers = server.headers;
		if (server.description) config.description = server.description;
		mcpServers[server.name] = config as McpServerBase;
	}
	return validate_claude_config({ mcpServers });
}

export async function load_portable_profile(
	name: string,
): Promise<PortableProfileData> {
	const parsed = await read_profile_json(name);
	const plugins =
		boolean_record(parsed.plugins) ??
		boolean_record(parsed.enabledPlugins);

	if (Array.isArray(parsed.servers)) {
		return {
			version: 2,
			servers: parsed.servers
				.map(parse_portable_server)
				.filter((server): server is PortableMcpServer => !!server),
			...(plugins ? { plugins } : {}),
			...(is_object(parsed.client_overrides)
				? { client_overrides: parsed.client_overrides }
				: {}),
		};
	}

	const config = legacy_profile_to_claude_config(parsed);
	return {
		version: 2,
		servers: claude_config_to_portable(config),
		...(plugins ? { plugins } : {}),
	};
}

export async function load_profile(
	name: string,
): Promise<ProfileData> {
	const profile = await load_portable_profile(name);
	return {
		config: portable_to_claude_config(profile.servers),
		enabledPlugins: profile.plugins,
	};
}

export async function apply_profile_to_claude(
	name: string,
): Promise<ProfileApplyResult> {
	const profile = await load_portable_profile(name);
	await write_claude_config(
		portable_to_claude_config(profile.servers),
	);

	let pluginCount = 0;
	if (profile.plugins) {
		await write_claude_settings({ enabledPlugins: profile.plugins });
		pluginCount = Object.keys(profile.plugins).length;
	}

	return {
		profile: name,
		serverCount: profile.servers.length,
		pluginCount,
		client: 'claude-code',
		scope: 'user',
	};
}

export async function apply_profile_to_client(input: {
	name: string;
	client: string;
	scope?: McpClientScope;
	location?: string;
}): Promise<ProfileApplyResult> {
	const adapter = get_client_adapter(input.client);
	if (!adapter) throw new Error(`Invalid client: ${input.client}`);
	const location = resolve_client_location(
		adapter,
		input.scope,
		input.location,
	);
	const profile = await load_portable_profile(input.name);
	await replace_client_servers(adapter, location, profile.servers);

	let pluginCount = 0;
	if (adapter.id === 'claude-code' && profile.plugins) {
		await write_claude_settings({ enabledPlugins: profile.plugins });
		pluginCount = Object.keys(profile.plugins).length;
	}

	return {
		profile: input.name,
		serverCount: profile.servers.length,
		pluginCount,
		client: adapter.id,
		scope: location.scope,
		location: location.path,
	};
}

export async function list_profiles(): Promise<ProfileInfo[]> {
	const profiles_dir = get_profiles_dir();

	try {
		await access(profiles_dir);
		const files = (await readdir(profiles_dir)).filter((file) =>
			file.endsWith('.json'),
		);
		const profiles: ProfileInfo[] = [];

		for (const file of files) {
			try {
				const name = file.replace(/\.json$/, '');
				const path = get_profile_path(file);
				const parsed = JSON.parse(await readFile(path, 'utf-8'));
				const servers = Array.isArray(parsed.servers)
					? parsed.servers
					: parsed.mcpServers || parsed;
				const plugins = parsed.plugins || parsed.enabledPlugins || {};
				profiles.push({
					name,
					path,
					serverCount: Array.isArray(servers)
						? servers.length
						: Object.keys(servers).length,
					pluginCount: Object.keys(plugins).length,
				});
			} catch {
				// Skip invalid profiles.
			}
		}

		return profiles;
	} catch {
		return [];
	}
}

async function save_portable_profile(
	name: string,
	servers: PortableMcpServer[],
	plugins?: Record<string, boolean>,
): Promise<void> {
	const profiles_dir = get_profiles_dir();
	await ensure_directory_exists(profiles_dir);
	const profile_data: PortableProfileData = {
		version: 2,
		servers,
		...(plugins && Object.keys(plugins).length > 0
			? { plugins }
			: {}),
	};
	await safe_json_write(
		get_profile_path(name),
		profile_data as unknown as Record<string, unknown>,
		2,
	);
}

export async function save_profile(
	name: string,
): Promise<{ serverCount: number; pluginCount: number }> {
	const config = await read_claude_config();
	const settings = await read_claude_settings();
	const servers = get_enabled_servers(config).map((server) =>
		normalize_mcp_server(
			server.name,
			server as unknown as JsonObject,
		),
	);
	const plugins = settings.enabledPlugins || {};

	if (servers.length === 0 && Object.keys(plugins).length === 0) {
		throw new Error('No MCP servers or plugins configured to save');
	}

	await save_portable_profile(name, servers, plugins);
	return {
		serverCount: servers.length,
		pluginCount: Object.keys(plugins).length,
	};
}

export async function save_profile_for_client(input: {
	name: string;
	client: string;
	scope?: McpClientScope;
	location?: string;
}): Promise<ProfileSaveResult> {
	const adapter = get_client_adapter(input.client);
	if (!adapter) throw new Error(`Invalid client: ${input.client}`);
	const location = resolve_client_location(
		adapter,
		input.scope,
		input.location,
	);
	const servers = await adapter.readLocation(location);
	let plugins: Record<string, boolean> | undefined;
	if (adapter.id === 'claude-code') {
		plugins = (await read_claude_settings()).enabledPlugins;
	}
	if (servers.length === 0 && !plugins) {
		throw new Error('No MCP servers or plugins configured to save');
	}

	await save_portable_profile(input.name, servers, plugins);
	return {
		profile: input.name,
		serverCount: servers.length,
		pluginCount: Object.keys(plugins || {}).length,
		client: adapter.id,
		scope: location.scope,
		location: location.path,
	};
}

export async function save_current_claude_profile(
	name: string,
): Promise<ProfileSaveResult> {
	const counts = await save_profile(name);
	return {
		profile: name,
		serverCount: counts.serverCount,
		pluginCount: counts.pluginCount,
		client: 'claude-code',
		scope: 'user',
	};
}
