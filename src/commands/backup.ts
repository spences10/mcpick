import { note } from '@clack/prompts';
import { readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { read_claude_config } from '../core/config.js';
import {
	ensure_directory_exists,
	get_backup_filename,
	get_backups_dir,
} from '../utils/paths.js';

const MAX_BACKUPS = 10;

export async function backup_config(): Promise<void> {
	try {
		const current_config = await read_claude_config();
		const backups_dir = get_backups_dir();

		await ensure_directory_exists(backups_dir);

		const backup_filename = get_backup_filename();
		const backup_path = join(backups_dir, backup_filename);

		const mcp_backup = {
			mcpServers: current_config.mcpServers || {},
		};

		const backup_content = JSON.stringify(mcp_backup, null, 2);
		await writeFile(backup_path, backup_content, 'utf-8');

		await cleanup_old_backups();

		const server_count = Object.keys(
			current_config.mcpServers || {},
		).length;
		note(
			`MCP servers backup created:\n${backup_path}\n(${server_count} servers backed up)`,
		);
	} catch (error) {
		throw new Error(
			`Failed to create backup: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

async function cleanup_old_backups(): Promise<void> {
	try {
		const backups_dir = get_backups_dir();
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

				return { file, timestamp };
			})
			.filter(
				(backup): backup is { file: string; timestamp: Date } =>
					backup !== null,
			)
			.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

		if (backup_files.length > MAX_BACKUPS) {
			const files_to_delete = backup_files.slice(MAX_BACKUPS);

			for (const { file } of files_to_delete) {
				await unlink(join(backups_dir, file));
			}
		}
	} catch (error) {
		console.warn('Warning: Failed to cleanup old backups:', error);
	}
}
