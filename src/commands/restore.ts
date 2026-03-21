import { confirm, isCancel, log, note, select } from '@clack/prompts';
import { readFile } from 'node:fs/promises';
import {
	read_claude_config,
	write_claude_config,
} from '../core/config.js';
import {
	list_backups,
	list_plugin_backups,
} from '../core/registry.js';
import { write_claude_settings } from '../core/settings.js';

type RestoreType = 'mcp' | 'plugins';

export async function restore_config(): Promise<void> {
	try {
		const restore_type = await select<RestoreType>({
			message: 'What would you like to restore?',
			options: [
				{
					value: 'mcp' as RestoreType,
					label: 'MCP servers',
					hint: 'Restore server configuration',
				},
				{
					value: 'plugins' as RestoreType,
					label: 'Plugins',
					hint: 'Restore plugin enabled/disabled state',
				},
			],
		});

		if (isCancel(restore_type)) return;

		if (restore_type === 'mcp') {
			await restore_mcp();
		} else {
			await restore_plugins();
		}
	} catch (error) {
		throw new Error(
			`Failed to restore configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

async function restore_mcp(): Promise<void> {
	const backups = await list_backups();

	if (backups.length === 0) {
		note('No MCP server backups found.');
		return;
	}

	const backup_choices = backups.map((backup) => ({
		value: backup.path,
		label: `${backup.filename} (${backup.timestamp.toLocaleString()})`,
		hint: format_time_ago(backup.timestamp),
	}));

	const selected_backup_path = await select({
		message: 'Select backup to restore:',
		options: backup_choices,
	});

	if (isCancel(selected_backup_path)) return;

	const should_restore = await confirm({
		message:
			'This will replace your current MCP servers configuration. Continue?',
	});

	if (isCancel(should_restore) || !should_restore) return;

	const backup_content = await readFile(
		selected_backup_path as string,
		'utf-8',
	);
	const backup_data = JSON.parse(backup_content);

	const current_config = await read_claude_config();
	const updated_config = {
		...current_config,
		mcpServers: backup_data.mcpServers || {},
	};

	await write_claude_config(updated_config);

	const server_count = Object.keys(
		backup_data.mcpServers || {},
	).length;
	log.success(`MCP servers restored (${server_count} servers)`);
}

async function restore_plugins(): Promise<void> {
	const backups = await list_plugin_backups();

	if (backups.length === 0) {
		note('No plugin backups found.');
		return;
	}

	const backup_choices = backups.map((backup) => ({
		value: backup.path,
		label: `${backup.filename} (${backup.timestamp.toLocaleString()})`,
		hint: format_time_ago(backup.timestamp),
	}));

	const selected_backup_path = await select({
		message: 'Select plugin backup to restore:',
		options: backup_choices,
	});

	if (isCancel(selected_backup_path)) return;

	const should_restore = await confirm({
		message:
			'This will replace your current plugin configuration. Continue?',
	});

	if (isCancel(should_restore) || !should_restore) return;

	const backup_content = await readFile(
		selected_backup_path as string,
		'utf-8',
	);
	const backup_data = JSON.parse(backup_content);

	await write_claude_settings({
		enabledPlugins: backup_data.enabledPlugins || {},
	});

	const plugin_count = Object.keys(
		backup_data.enabledPlugins || {},
	).length;
	log.success(`Plugins restored (${plugin_count} plugins)`);
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
