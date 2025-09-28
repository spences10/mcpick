import {
	access,
	readdir,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { BackupInfo, McpServer, ServerRegistry } from '../types.js';
import {
	ensure_directory_exists,
	get_backups_dir,
	get_mcpick_dir,
	get_server_registry_path,
} from '../utils/paths.js';
import { validate_server_registry } from './validation.js';

export async function read_server_registry(): Promise<ServerRegistry> {
	const registry_path = get_server_registry_path();

	try {
		await access(registry_path);
		const registry_content = await readFile(registry_path, 'utf-8');
		const parsed_registry = JSON.parse(registry_content);
		return validate_server_registry(parsed_registry);
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			await ensure_directory_exists(get_mcpick_dir());
			const default_registry: ServerRegistry = { servers: [] };
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
	const registry_content = JSON.stringify(registry, null, 2);
	await writeFile(registry_path, registry_content, 'utf-8');
}

export async function add_server_to_registry(
	server: McpServer,
): Promise<void> {
	const registry = await read_server_registry();

	const existing_index = registry.servers.findIndex(
		(s) => s.name === server.name,
	);
	if (existing_index >= 0) {
		registry.servers[existing_index] = server;
	} else {
		registry.servers.push(server);
	}

	await write_server_registry(registry);
}

export async function get_all_available_servers(): Promise<
	McpServer[]
> {
	const registry = await read_server_registry();
	return registry.servers;
}

export async function sync_servers_to_registry(
	servers: McpServer[],
): Promise<void> {
	const registry = await read_server_registry();

	servers.forEach((server) => {
		const existing_index = registry.servers.findIndex(
			(s) => s.name === server.name,
		);
		if (existing_index >= 0) {
			registry.servers[existing_index] = server;
		} else {
			registry.servers.push(server);
		}
	});

	await write_server_registry(registry);
}

export async function list_backups(): Promise<BackupInfo[]> {
	const backups_dir = get_backups_dir();

	try {
		await access(backups_dir);
		const files = await readdir(backups_dir);

		const backup_files = files
			.filter(
				(file) =>
					file.startsWith('mcp-servers-') && file.endsWith('.json'),
			)
			.map((file) => {
				const timestamp_match = file.match(
					/mcp-servers-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json/,
				);
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
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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
}
