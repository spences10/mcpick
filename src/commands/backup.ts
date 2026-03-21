import { note } from '@clack/prompts';
import { readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { read_claude_config } from '../core/config.js';
import { read_claude_settings } from '../core/settings.js';
import {
	ensure_directory_exists,
	get_backup_filename,
	get_backups_dir,
	get_plugin_backup_filename,
} from '../utils/paths.js';

const MAX_BACKUPS = 10;

export async function backup_config(): Promise<void> {
	try {
		const current_config = await read_claude_config();
		const current_settings = await read_claude_settings();
		const backups_dir = get_backups_dir();

		await ensure_directory_exists(backups_dir);

		// Backup MCP servers
		const mcp_filename = get_backup_filename();
		const mcp_path = join(backups_dir, mcp_filename);
		const mcp_backup = {
			mcpServers: current_config.mcpServers || {},
		};
		await writeFile(
			mcp_path,
			JSON.stringify(mcp_backup, null, 2),
			'utf-8',
		);

		// Backup plugins
		const plugins = current_settings.enabledPlugins || {};
		const plugin_count = Object.keys(plugins).length;
		let plugin_msg = '';

		if (plugin_count > 0) {
			const plugin_filename = get_plugin_backup_filename();
			const plugin_path = join(backups_dir, plugin_filename);
			const plugin_backup = { enabledPlugins: plugins };
			await writeFile(
				plugin_path,
				JSON.stringify(plugin_backup, null, 2),
				'utf-8',
			);
			plugin_msg = `\nPlugins backup: ${plugin_path}\n(${plugin_count} plugins backed up)`;
		}

		await cleanup_old_backups('mcp-servers-');
		await cleanup_old_backups('plugins-');

		const server_count = Object.keys(
			current_config.mcpServers || {},
		).length;
		note(
			`MCP servers backup: ${mcp_path}\n(${server_count} servers backed up)${plugin_msg}`,
		);
	} catch (error) {
		throw new Error(
			`Failed to create backup: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

async function cleanup_old_backups(prefix: string): Promise<void> {
	try {
		const backups_dir = get_backups_dir();
		const files = await readdir(backups_dir);

		const backup_files = files
			.filter(
				(file) => file.startsWith(prefix) && file.endsWith('.json'),
			)
			.sort()
			.reverse();

		if (backup_files.length > MAX_BACKUPS) {
			const files_to_delete = backup_files.slice(MAX_BACKUPS);
			for (const file of files_to_delete) {
				await unlink(join(backups_dir, file));
			}
		}
	} catch {
		// Cleanup is best-effort
	}
}
