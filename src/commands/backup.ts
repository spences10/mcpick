import { note } from '@clack/prompts';
import { copyFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
	ensure_directory_exists,
	get_backup_filename,
	get_backups_dir,
	get_claude_config_path,
} from '../utils/paths.js';

const MAX_BACKUPS = 10;

export async function backup_config(): Promise<void> {
	try {
		const config_path = get_claude_config_path();
		const backups_dir = get_backups_dir();

		await ensure_directory_exists(backups_dir);

		const backup_filename = get_backup_filename();
		const backup_path = join(backups_dir, backup_filename);

		await copyFile(config_path, backup_path);

		await cleanup_old_backups();

		note(`Configuration backed up to:\n${backup_path}`);
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			throw new Error('No .claude.json file found to backup');
		}
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
					file.startsWith('claude-') && file.endsWith('.json'),
			)
			.map((file) => {
				const timestamp_match = file.match(
					/claude-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json/,
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
