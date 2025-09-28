import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function get_claude_config_path(): string {
	return join(homedir(), '.claude.json');
}

export function get_mcpick_dir(): string {
	return join(homedir(), '.claude', 'mcpick');
}

export function get_server_registry_path(): string {
	return join(get_mcpick_dir(), 'servers.json');
}

export function get_backups_dir(): string {
	return join(get_mcpick_dir(), 'backups');
}

export function get_backup_filename(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hour = String(now.getHours()).padStart(2, '0');
	const minute = String(now.getMinutes()).padStart(2, '0');
	const second = String(now.getSeconds()).padStart(2, '0');

	return `mcp-servers-${year}-${month}-${day}-${hour}${minute}${second}.json`;
}

export async function ensure_directory_exists(
	dir_path: string,
): Promise<void> {
	try {
		await access(dir_path);
	} catch {
		await mkdir(dir_path, { recursive: true });
	}
}
