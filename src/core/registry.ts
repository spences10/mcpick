import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	BackupInfo,
	McpServer,
	PortableMcpServer,
	ServerRegistry,
} from '../types.js';
import { atomic_json_write } from '../utils/atomic-write.js';
import {
	ensure_directory_exists,
	get_backups_dir,
	get_mcpick_dir,
	get_server_registry_path,
} from '../utils/paths.js';
import { normalize_mcp_server } from './client-config.js';
import {
	validate_mcp_server,
	validate_server_registry,
} from './validation.js';

type JsonObject = Record<string, unknown>;

function is_object(value: unknown): value is JsonObject {
	return (
		!!value && typeof value === 'object' && !Array.isArray(value)
	);
}

function portable_to_mcp_server(
	server: PortableMcpServer,
): McpServer {
	const data: Record<string, unknown> = {
		name: server.name,
		...(server.transport !== 'stdio'
			? { type: server.transport }
			: {}),
		...(server.command ? { command: server.command } : {}),
		...(server.args ? { args: server.args } : {}),
		...(server.url ? { url: server.url } : {}),
		...(server.env ? { env: server.env } : {}),
		...(server.headers ? { headers: server.headers } : {}),
		...(server.description
			? { description: server.description }
			: {}),
	};
	return validate_mcp_server(data);
}

function mcp_server_to_portable(
	server: McpServer,
): PortableMcpServer {
	const { name, ...config } = server;
	return normalize_mcp_server(name, config as JsonObject);
}

function parse_portable_registry(data: unknown): ServerRegistry {
	if (!is_object(data) || !Array.isArray(data.servers)) {
		throw new Error(
			'Invalid server registry: expected servers array',
		);
	}

	if (data.version === 3) {
		return validate_server_registry(data);
	}

	return validate_server_registry({
		version: 3,
		servers: data.servers.map((server) => {
			if (!is_object(server)) {
				throw new Error('Invalid server registry entry');
			}
			if (typeof server.transport === 'string') {
				if (typeof server.name !== 'string') {
					throw new Error('Invalid server registry entry');
				}
				return normalize_mcp_server(server.name, server);
			}
			const legacy = validate_mcp_server(server);
			return mcp_server_to_portable(legacy);
		}),
	});
}

export async function read_server_registry(): Promise<ServerRegistry> {
	const registry_path = get_server_registry_path();

	try {
		await access(registry_path);
		const registry_content = await readFile(registry_path, 'utf-8');
		const parsed_registry = JSON.parse(registry_content);
		const registry = parse_portable_registry(parsed_registry);
		if (parsed_registry.version !== 3) {
			await write_server_registry(registry);
		}
		return registry;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			await ensure_directory_exists(get_mcpick_dir());
			const default_registry: ServerRegistry = {
				version: 3,
				servers: [],
			};
			await write_server_registry(default_registry);
			return default_registry;
		}
		throw error;
	}
}

export async function write_server_registry(
	registry: ServerRegistry,
): Promise<void> {
	const registry_path = get_server_registry_path();
	await ensure_directory_exists(get_mcpick_dir());
	await atomic_json_write(
		registry_path,
		() => registry as unknown as Record<string, unknown>,
	);
}

export async function add_server_to_registry(
	server: McpServer,
): Promise<void> {
	const registry = await read_server_registry();
	const portable = mcp_server_to_portable(server);

	const existing_index = registry.servers.findIndex(
		(s) => s.name === server.name,
	);
	if (existing_index >= 0) {
		registry.servers[existing_index] = portable;
	} else {
		registry.servers.push(portable);
	}

	await write_server_registry(registry);
}

export async function get_all_available_servers(): Promise<
	McpServer[]
> {
	const { get_enabled_servers, read_claude_config } =
		await import('./config.js');
	const registry = await read_server_registry();
	const config = await read_claude_config();
	const config_servers = get_enabled_servers(config);

	// Merge: config is the live truth, so update registry entries with config data
	const config_by_name = new Map(
		config_servers.map((s) => [s.name, s]),
	);
	const known_names = new Set<string>();
	let registry_updated = false;

	for (let i = 0; i < registry.servers.length; i++) {
		const name = registry.servers[i].name;
		known_names.add(name);
		const config_server = config_by_name.get(name);
		if (config_server) {
			registry.servers[i] = mcp_server_to_portable(config_server);
			registry_updated = true;
		}
	}

	for (const server of config_servers) {
		if (!known_names.has(server.name)) {
			registry.servers.push(mcp_server_to_portable(server));
			registry_updated = true;
		}
	}

	// Persist updated data back to registry so it survives disable/enable cycles
	if (registry_updated) {
		await write_server_registry(registry);
	}

	return registry.servers.map(portable_to_mcp_server);
}

export async function sync_servers_to_registry(
	servers: McpServer[],
): Promise<void> {
	const registry = await read_server_registry();

	servers.forEach((server) => {
		const portable = mcp_server_to_portable(server);
		const existing_index = registry.servers.findIndex(
			(s) => s.name === server.name,
		);
		if (existing_index >= 0) {
			registry.servers[existing_index] = portable;
		} else {
			registry.servers.push(portable);
		}
	});

	await write_server_registry(registry);
}

function parse_backups(
	prefix: string,
	pattern: RegExp,
): () => Promise<BackupInfo[]> {
	return async () => {
		const backups_dir = get_backups_dir();

		try {
			await access(backups_dir);
			const files = await readdir(backups_dir);

			const backup_files = files
				.filter(
					(file) => file.startsWith(prefix) && file.endsWith('.json'),
				)
				.map((file) => {
					const timestamp_match = file.match(pattern);
					if (!timestamp_match) return null;

					const [, year, month, day, hour, minute, second] =
						timestamp_match;
					const timestamp = new Date(
						parseInt(year),
						parseInt(month) - 1,
						parseInt(day),
						parseInt(hour),
						parseInt(minute),
						parseInt(second),
					);

					return {
						filename: file,
						timestamp,
						path: join(backups_dir, file),
					};
				})
				.filter((backup): backup is BackupInfo => backup !== null)
				.sort(
					(a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
				);

			return backup_files;
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return [];
			}
			throw error;
		}
	};
}

export const list_backups = parse_backups(
	'mcp-servers-',
	/mcp-servers-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json/,
);

export const list_plugin_backups = parse_backups(
	'plugins-',
	/plugins-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json/,
);
