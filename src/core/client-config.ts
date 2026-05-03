import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
	McpClientId,
	McpClientScope,
	McpTransport,
	PortableMcpServer,
} from '../types.js';
import { get_claude_config_path } from '../utils/paths.js';
import {
	safe_json_write,
	type SafeJsonWriteResult,
} from '../utils/safe-apply.js';

export type {
	McpClientId,
	McpClientScope,
	McpTransport,
	PortableMcpServer,
};

export interface ClientConfigLocation {
	scope: McpClientScope;
	path: string;
	description: string;
}

export interface McpClientAdapter {
	id: McpClientId;
	label: string;
	locations: () => ClientConfigLocation[];
	read: (scope?: McpClientScope) => Promise<PortableMcpServer[]>;
	readLocation: (
		location: ClientConfigLocation,
	) => Promise<PortableMcpServer[]>;
	writeEnabled?: (
		location: ClientConfigLocation,
		enabled_names: string[],
	) => Promise<SafeJsonWriteResult>;
	write_server?: (
		location: ClientConfigLocation,
		server: PortableMcpServer,
	) => Promise<SafeJsonWriteResult>;
	write_server_config?: (
		location: ClientConfigLocation,
		name: string,
		config: JsonObject,
	) => Promise<SafeJsonWriteResult>;
	remove_server?: (
		location: ClientConfigLocation,
		name: string,
	) => Promise<SafeJsonWriteResult>;
	write_servers?: (
		location: ClientConfigLocation,
		servers: PortableMcpServer[],
	) => Promise<SafeJsonWriteResult>;
}

export interface ClientMutationResult {
	operation:
		| 'add'
		| 'remove'
		| 'enable'
		| 'disable'
		| 'set-enabled'
		| 'replace';
	client: McpClientId;
	scope: McpClientScope;
	location: string;
	servers: string[];
	enabledCount?: number;
	backup_path?: string;
}

type JsonObject = Record<string, unknown>;

const client_options_to_skip = new Set([
	'name',
	'type',
	'command',
	'args',
	'url',
	'httpUrl',
	'serverUrl',
	'env',
	'headers',
	'description',
	'disabled',
	'enabled',
	'environment',
]);

async function file_exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function read_json_file(
	path: string,
): Promise<JsonObject | null> {
	try {
		const content = await readFile(path, 'utf-8');
		return parse_json_or_jsonc(content) as JsonObject;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return null;
		}
		throw error;
	}
}

async function write_json_file(
	path: string,
	data: JsonObject,
): Promise<SafeJsonWriteResult> {
	return safe_json_write(path, data, 2);
}

function parse_json_or_jsonc(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		return JSON.parse(remove_jsonc_syntax(content));
	}
}

function remove_jsonc_syntax(content: string): string {
	let result = '';
	let in_string = false;
	let quote = '';
	let escaped = false;
	let in_line_comment = false;
	let in_block_comment = false;

	for (let index = 0; index < content.length; index++) {
		const char = content[index];
		const next = content[index + 1];

		if (in_line_comment) {
			if (char === '\n' || char === '\r') {
				in_line_comment = false;
				result += char;
			}
			continue;
		}

		if (in_block_comment) {
			if (char === '*' && next === '/') {
				in_block_comment = false;
				index++;
			}
			continue;
		}

		if (in_string) {
			result += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				in_string = false;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			in_string = true;
			quote = char;
			result += char;
			continue;
		}

		if (char === '/' && next === '/') {
			in_line_comment = true;
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			in_block_comment = true;
			index++;
			continue;
		}

		result += char;
	}

	return remove_trailing_commas(result);
}

function remove_trailing_commas(content: string): string {
	let result = '';
	let in_string = false;
	let quote = '';
	let escaped = false;

	for (let index = 0; index < content.length; index++) {
		const char = content[index];

		if (in_string) {
			result += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				in_string = false;
			}
			continue;
		}

		if (char === '"') {
			in_string = true;
			quote = char;
			result += char;
			continue;
		}

		if (char === ',') {
			let cursor = index + 1;
			while (/\s/.test(content[cursor] ?? '')) {
				cursor++;
			}
			if (content[cursor] === '}' || content[cursor] === ']') {
				continue;
			}
		}

		result += char;
	}

	return result;
}

function string_record(
	value: unknown,
): Record<string, string> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'string') {
			result[key] = item;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function string_array(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const values = value.filter(
		(item): item is string => typeof item === 'string',
	);
	return values.length > 0 ? values : undefined;
}

function infer_transport(config: JsonObject): McpTransport {
	if (
		config.type === 'http' ||
		config.type === 'remote' ||
		config.httpUrl ||
		config.serverUrl
	) {
		return 'http';
	}
	if (config.type === 'sse') {
		return 'sse';
	}
	if (config.url && !config.command) {
		// Cursor/Windsurf use url/serverUrl for remote servers without a type.
		return 'http';
	}
	return 'stdio';
}

export function normalize_mcp_server(
	name: string,
	config: JsonObject,
): PortableMcpServer {
	const transport = infer_transport(config);
	const url =
		typeof config.httpUrl === 'string'
			? config.httpUrl
			: typeof config.serverUrl === 'string'
				? config.serverUrl
				: typeof config.url === 'string'
					? config.url
					: undefined;
	const client_options: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(config)) {
		if (!client_options_to_skip.has(key)) {
			client_options[key] = value;
		}
	}

	const command_array = string_array(config.command);
	const command =
		typeof config.command === 'string'
			? config.command
			: command_array?.[0];
	const args = string_array(config.args) ?? command_array?.slice(1);
	const env =
		string_record(config.env) ?? string_record(config.environment);
	const disabled =
		typeof config.disabled === 'boolean'
			? config.disabled
			: typeof config.enabled === 'boolean'
				? !config.enabled
				: undefined;

	return {
		name,
		transport,
		...(command ? { command } : {}),
		...(args && args.length > 0 ? { args } : {}),
		...(url ? { url } : {}),
		...(env ? { env } : {}),
		...(string_record(config.headers)
			? { headers: string_record(config.headers) }
			: {}),
		...(typeof config.description === 'string'
			? { description: config.description }
			: {}),
		...(typeof disabled === 'boolean' ? { disabled } : {}),
		...(Object.keys(client_options).length > 0
			? { client_options }
			: {}),
	};
}

function get_server_record(
	data: JsonObject | null,
	key: 'mcpServers' | 'servers' | 'mcp',
): Record<string, JsonObject> {
	const servers = data?.[key];
	if (
		!servers ||
		typeof servers !== 'object' ||
		Array.isArray(servers)
	) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(servers as Record<string, unknown>).filter(
			(entry): entry is [string, JsonObject] => {
				const [, value] = entry;
				return (
					!!value &&
					typeof value === 'object' &&
					!Array.isArray(value)
				);
			},
		),
	);
}

function read_server_map(
	data: JsonObject | null,
	key: 'mcpServers' | 'servers' | 'mcp',
): PortableMcpServer[] {
	return Object.entries(get_server_record(data, key)).map(
		([name, config]) => normalize_mcp_server(name, config),
	);
}

function set_server_enabled(
	config: JsonObject,
	enabled: boolean,
	mode: 'disabled' | 'enabled',
): void {
	if (mode === 'enabled' || 'enabled' in config) {
		config.enabled = enabled;
		delete config.disabled;
		return;
	}
	config.disabled = !enabled;
}

function portable_to_json(
	server: PortableMcpServer,
	mode: 'disabled' | 'enabled',
): JsonObject {
	const result: JsonObject = { ...server.client_options };
	if (server.transport !== 'stdio') {
		result.type = server.transport;
	}
	if (server.command) result.command = server.command;
	if (server.args && server.args.length > 0)
		result.args = server.args;
	if (server.url) result.url = server.url;
	if (server.env) result.env = server.env;
	if (server.headers) result.headers = server.headers;
	if (server.description) result.description = server.description;
	if (typeof server.disabled === 'boolean') {
		set_server_enabled(result, !server.disabled, mode);
	}
	return result;
}

function portable_server_map(
	servers: PortableMcpServer[],
	mode: 'disabled' | 'enabled',
): Record<string, JsonObject> {
	return Object.fromEntries(
		servers.map((server) => [
			server.name,
			portable_to_json(server, mode),
		]),
	);
}

function create_json_adapter(options: {
	id: McpClientId;
	label: string;
	serverKey: 'mcpServers' | 'servers' | 'mcp';
	disabledMode?: 'disabled' | 'enabled';
	locations: () => ClientConfigLocation[];
}): McpClientAdapter {
	return {
		id: options.id,
		label: options.label,
		locations: options.locations,
		async read(scope) {
			const locations = scope
				? options
						.locations()
						.filter((location) => location.scope === scope)
				: options.locations();
			const result: PortableMcpServer[] = [];

			for (const location of locations) {
				for (const server of await this.readLocation(location)) {
					result.push(server);
				}
			}

			return result;
		},
		async readLocation(location) {
			return read_server_map(
				await read_json_file(location.path),
				options.serverKey,
			);
		},
		async writeEnabled(location, enabled_names) {
			const data = (await read_json_file(location.path)) ?? {};
			const servers = get_server_record(data, options.serverKey);
			const enabled = new Set(enabled_names);

			for (const [name, config] of Object.entries(servers)) {
				set_server_enabled(
					config,
					enabled.has(name),
					options.disabledMode ?? 'disabled',
				);
			}

			data[options.serverKey] = servers;
			return write_json_file(location.path, data);
		},
		async write_server(location, server) {
			const data = (await read_json_file(location.path)) ?? {};
			const servers = get_server_record(data, options.serverKey);
			servers[server.name] = portable_to_json(
				server,
				options.disabledMode ?? 'disabled',
			);
			data[options.serverKey] = servers;
			return write_json_file(location.path, data);
		},
		async write_server_config(location, name, config) {
			const data = (await read_json_file(location.path)) ?? {};
			const servers = get_server_record(data, options.serverKey);
			servers[name] = config;
			data[options.serverKey] = servers;
			return write_json_file(location.path, data);
		},
		async remove_server(location, name) {
			const data = (await read_json_file(location.path)) ?? {};
			const servers = get_server_record(data, options.serverKey);
			delete servers[name];
			data[options.serverKey] = servers;
			return write_json_file(location.path, data);
		},
		async write_servers(location, servers) {
			const data = (await read_json_file(location.path)) ?? {};
			data[options.serverKey] = portable_server_map(
				servers,
				options.disabledMode ?? 'disabled',
			);
			return write_json_file(location.path, data);
		},
	};
}

function project_path(path: string): string {
	return join(process.cwd(), path);
}

export const client_adapters: McpClientAdapter[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		locations: () => [
			{
				scope: 'local',
				path: get_claude_config_path(),
				description: '~/.claude.json projects[cwd].mcpServers',
			},
			{
				scope: 'project',
				path: project_path('.mcp.json'),
				description: '.mcp.json mcpServers',
			},
			{
				scope: 'user',
				path: get_claude_config_path(),
				description: '~/.claude.json mcpServers',
			},
		],
		async read(scope) {
			const locations = scope
				? this.locations().filter(
						(location) => location.scope === scope,
					)
				: this.locations();
			const result: PortableMcpServer[] = [];

			for (const location of locations) {
				result.push(...(await this.readLocation(location)));
			}

			return result;
		},
		async readLocation(location) {
			if (location.scope === 'project') {
				return read_server_map(
					await read_json_file(location.path),
					'mcpServers',
				);
			}

			const data = await read_json_file(get_claude_config_path());
			if (location.scope === 'user') {
				return read_server_map(data, 'mcpServers');
			}

			const projects = data?.projects;
			if (
				!projects ||
				typeof projects !== 'object' ||
				Array.isArray(projects)
			) {
				return [];
			}

			const project_config = (projects as JsonObject)[process.cwd()];
			if (
				!project_config ||
				typeof project_config !== 'object' ||
				Array.isArray(project_config)
			) {
				return [];
			}

			return read_server_map(
				project_config as JsonObject,
				'mcpServers',
			);
		},
		async write_servers(location, servers) {
			const data =
				(await read_json_file(location.path)) ??
				(location.scope === 'project' ? {} : { projects: {} });
			const mcp_servers = portable_server_map(servers, 'disabled');

			if (location.scope === 'project') {
				data.mcpServers = mcp_servers;
				return write_json_file(location.path, data);
			}

			if (location.scope === 'user') {
				data.mcpServers = mcp_servers;
				return write_json_file(get_claude_config_path(), data);
			}

			const projects =
				data.projects &&
				typeof data.projects === 'object' &&
				!Array.isArray(data.projects)
					? (data.projects as JsonObject)
					: {};
			const project_config =
				projects[process.cwd()] &&
				typeof projects[process.cwd()] === 'object' &&
				!Array.isArray(projects[process.cwd()])
					? (projects[process.cwd()] as JsonObject)
					: {};
			project_config.mcpServers = mcp_servers;
			projects[process.cwd()] = project_config;
			data.projects = projects;
			return write_json_file(get_claude_config_path(), data);
		},
	},
	create_json_adapter({
		id: 'gemini-cli',
		label: 'Gemini CLI',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.gemini/settings.json'),
				description: '.gemini/settings.json mcpServers',
			},
			{
				scope: 'user',
				path: join(homedir(), '.gemini/settings.json'),
				description: '~/.gemini/settings.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'vscode',
		label: 'VS Code / GitHub Copilot',
		serverKey: 'servers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.vscode/mcp.json'),
				description: '.vscode/mcp.json servers',
			},
		],
	}),
	create_json_adapter({
		id: 'cursor',
		label: 'Cursor',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.cursor/mcp.json'),
				description: '.cursor/mcp.json mcpServers',
			},
			{
				scope: 'user',
				path: join(homedir(), '.cursor/mcp.json'),
				description: '~/.cursor/mcp.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'windsurf',
		label: 'Windsurf',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'user',
				path: join(homedir(), '.codeium/windsurf/mcp_config.json'),
				description: '~/.codeium/windsurf/mcp_config.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'opencode',
		label: 'OpenCode',
		serverKey: 'mcp',
		disabledMode: 'enabled',
		locations: () => [
			{
				scope: 'project',
				path: project_path('opencode.json'),
				description: 'opencode.json mcp',
			},
			{
				scope: 'user',
				path: join(homedir(), '.config/opencode/opencode.json'),
				description: '~/.config/opencode/opencode.json mcp',
			},
		],
	}),
	create_json_adapter({
		id: 'pi',
		label: 'Pi MCP Adapter',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'user',
				path: join(homedir(), '.config/mcp/mcp.json'),
				description: '~/.config/mcp/mcp.json shared MCP config',
			},
			{
				scope: 'user',
				path: join(homedir(), '.pi/agent/mcp.json'),
				description: '~/.pi/agent/mcp.json Pi global override',
			},
			{
				scope: 'project',
				path: project_path('.mcp.json'),
				description: '.mcp.json shared project MCP config',
			},
			{
				scope: 'project',
				path: project_path('.pi/mcp.json'),
				description: '.pi/mcp.json Pi project override',
			},
		],
	}),
];

export function get_client_adapter(
	id: string,
): McpClientAdapter | null {
	return client_adapters.find((adapter) => adapter.id === id) ?? null;
}

function mutation_result(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	operation: ClientMutationResult['operation'],
	servers: string[],
	write_result: SafeJsonWriteResult,
	enabledCount?: number,
): ClientMutationResult {
	return {
		operation,
		client: adapter.id,
		scope: location.scope,
		location: write_result.path,
		servers,
		...(enabledCount !== undefined ? { enabledCount } : {}),
		...(write_result.backup_path
			? { backup_path: write_result.backup_path }
			: {}),
	};
}

export function resolve_client_location(
	adapter: McpClientAdapter,
	scope?: McpClientScope,
	path?: string,
): ClientConfigLocation {
	let locations = adapter.locations();

	if (path) {
		locations = locations.filter(
			(location) => location.path === path,
		);
	} else if (scope) {
		locations = locations.filter(
			(location) => location.scope === scope,
		);
	}

	if (locations.length === 1) return locations[0];

	if (locations.length === 0) {
		throw new Error(
			`No ${adapter.label} config location matches${scope ? ` scope '${scope}'` : ''}${path ? ` path '${path}'` : ''}.`,
		);
	}

	throw new Error(
		`${adapter.label} has multiple matching config locations. Pass --location with one of: ${locations
			.map((location) => location.path)
			.join(', ')}`,
	);
}

export async function add_client_server(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	server: PortableMcpServer,
): Promise<ClientMutationResult> {
	if (!adapter.write_server) {
		throw new Error(
			`${adapter.label} support cannot add servers yet.`,
		);
	}
	const write_result = await adapter.write_server(location, server);
	return mutation_result(
		adapter,
		location,
		'add',
		[server.name],
		write_result,
	);
}

export async function add_client_server_config(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	name: string,
	config: JsonObject,
): Promise<ClientMutationResult> {
	if (!adapter.write_server_config) {
		throw new Error(
			`${adapter.label} support cannot add servers yet.`,
		);
	}
	const write_result = await adapter.write_server_config(
		location,
		name,
		config,
	);
	return mutation_result(
		adapter,
		location,
		'add',
		[name],
		write_result,
	);
}

export async function remove_client_server(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	server_name: string,
): Promise<ClientMutationResult> {
	if (!adapter.remove_server) {
		throw new Error(
			`${adapter.label} support cannot remove servers yet.`,
		);
	}
	const write_result = await adapter.remove_server(
		location,
		server_name,
	);
	return mutation_result(
		adapter,
		location,
		'remove',
		[server_name],
		write_result,
	);
}

export async function set_client_enabled_servers(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	enabled_names: string[],
): Promise<ClientMutationResult> {
	if (!adapter.writeEnabled) {
		throw new Error(`${adapter.label} support is read-only.`);
	}

	const servers = await adapter.readLocation(location);
	const known_names = new Set(servers.map((server) => server.name));
	const unknown_names = enabled_names.filter(
		(name) => !known_names.has(name),
	);
	if (unknown_names.length > 0) {
		throw new Error(
			`Server '${unknown_names[0]}' not found at ${location.path}.`,
		);
	}

	const write_result = await adapter.writeEnabled(
		location,
		enabled_names,
	);
	return mutation_result(
		adapter,
		location,
		'set-enabled',
		enabled_names,
		write_result,
		enabled_names.length,
	);
}

export async function replace_client_servers(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	servers: PortableMcpServer[],
): Promise<ClientMutationResult> {
	if (!adapter.write_servers) {
		throw new Error(
			`${adapter.label} support cannot replace server profiles yet.`,
		);
	}
	const write_result = await adapter.write_servers(location, servers);
	return mutation_result(
		adapter,
		location,
		'replace',
		servers.map((server) => server.name),
		write_result,
		servers.filter((server) => server.disabled !== true).length,
	);
}

export async function set_client_server_enabled(
	adapter: McpClientAdapter,
	location: ClientConfigLocation,
	server_name: string,
	enabled: boolean,
): Promise<ClientMutationResult> {
	const servers = await adapter.readLocation(location);
	const server = servers.find(
		(candidate) => candidate.name === server_name,
	);
	if (!server) {
		throw new Error(
			`Server '${server_name}' not found at ${location.path}.`,
		);
	}

	const enabled_names = new Set(
		servers
			.filter((candidate) => candidate.disabled !== true)
			.map((candidate) => candidate.name),
	);
	if (enabled) {
		enabled_names.add(server.name);
	} else {
		enabled_names.delete(server.name);
	}

	const result = await set_client_enabled_servers(adapter, location, [
		...enabled_names,
	]);
	return {
		...result,
		operation: enabled ? 'enable' : 'disable',
		servers: [server_name],
	};
}

export async function list_client_locations(): Promise<
	Array<
		ClientConfigLocation & {
			client: McpClientId;
			label: string;
			exists: boolean;
		}
	>
> {
	const locations = await Promise.all(
		client_adapters.flatMap((adapter) =>
			adapter.locations().map(async (location) => ({
				client: adapter.id,
				label: adapter.label,
				...location,
				exists: await file_exists(location.path),
			})),
		),
	);
	return locations;
}
