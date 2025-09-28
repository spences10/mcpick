import { confirm, note, select } from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import {
	read_claude_config,
	write_claude_config,
} from '../core/config.js';
import { list_backups } from '../core/registry.js';

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
				'This will replace your current MCP servers configuration. Continue?',
		});

		if (typeof should_restore === 'symbol' || !should_restore) {
			return;
		}

		// Read the backup file
		const backup_content = await readFile(
			selected_backup_path as string,
			'utf-8',
		);
		const backup_data = JSON.parse(backup_content);

		// Read current config and merge
		const current_config = await read_claude_config();
		const updated_config = {
			...current_config,
			mcpServers: backup_data.mcpServers || {},
		};

		// Write back only the updated config
		await write_claude_config(updated_config);

		const server_count = Object.keys(
			backup_data.mcpServers || {},
		).length;
		note(
			`MCP servers configuration restored successfully!\n(${server_count} servers restored)`,
		);
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
