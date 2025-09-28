import { confirm, note, select } from '@clack/prompts';
import { copyFile } from 'node:fs/promises';
import { list_backups } from '../core/registry.js';
import { get_claude_config_path } from '../utils/paths.js';

export async function restore_config(): Promise<void> {
	try {
		const backups = await list_backups();

		if (backups.length === 0) {
			note('No backups found.');
			return;
		}

		const backup_choices = backups.map((backup) => ({
			value: backup.path,
			label: `${
				backup.filename
			} (${backup.timestamp.toLocaleString()})`,
			hint: format_time_ago(backup.timestamp),
		}));

		const selected_backup_path = await select({
			message: 'Select backup to restore:',
			options: backup_choices,
		});

		if (typeof selected_backup_path === 'symbol') {
			return;
		}

		const should_restore = await confirm({
			message:
				'This will overwrite your current .claude.json file. Continue?',
		});

		if (typeof should_restore === 'symbol' || !should_restore) {
			return;
		}

		const config_path = get_claude_config_path();
		await copyFile(selected_backup_path as string, config_path);

		note('Configuration restored successfully!');
	} catch (error) {
		throw new Error(
			`Failed to restore configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

function format_time_ago(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return `${days} day${days > 1 ? 's' : ''} ago`;
	} else if (hours > 0) {
		return `${hours} hour${hours > 1 ? 's' : ''} ago`;
	} else if (minutes > 0) {
		return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
	} else {
		return 'just now';
	}
}
