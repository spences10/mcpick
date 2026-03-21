import { defineCommand } from 'citty';
import { readFile } from 'node:fs/promises';
import { write_claude_config } from '../../core/config.js';
import {
	list_backups,
	list_plugin_backups,
} from '../../core/registry.js';
import { write_claude_settings } from '../../core/settings.js';
import { validate_claude_config } from '../../core/validation.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'restore',
		description:
			'Restore config from a backup (latest if no file specified)',
	},
	args: {
		file: {
			type: 'positional',
			description:
				'Backup filename or path (optional, defaults to latest)',
			required: false,
		},
		type: {
			type: 'string',
			description: 'What to restore: mcp (default), plugins, or all',
			default: 'mcp',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const restore_type = args.type as 'mcp' | 'plugins' | 'all';
		const results: Record<string, unknown> = {};

		if (restore_type === 'mcp' || restore_type === 'all') {
			const backups = await list_backups();
			if (backups.length === 0) {
				if (restore_type === 'mcp') {
					error('No MCP backups found. Run "mcpick backup" first.');
				}
			} else {
				let backup_path: string;
				if (args.file && restore_type === 'mcp') {
					const found = backups.find(
						(b) => b.filename === args.file || b.path === args.file,
					);
					if (!found) {
						error(
							`Backup '${args.file}' not found. Available: ${backups.map((b) => b.filename).join(', ')}`,
						);
					}
					backup_path = found.path;
				} else {
					backup_path = backups[0].path;
				}

				const content = await readFile(backup_path, 'utf-8');
				const parsed = JSON.parse(content);
				const config = validate_claude_config(parsed);
				await write_claude_config(config);

				const server_count = Object.keys(
					config.mcpServers || {},
				).length;
				results.mcp = {
					restored: backup_path,
					servers: server_count,
				};

				if (!args.json) {
					console.log(
						`Restored MCP: ${backup_path} (${server_count} servers)`,
					);
				}
			}
		}

		if (restore_type === 'plugins' || restore_type === 'all') {
			const backups = await list_plugin_backups();
			if (backups.length === 0) {
				if (restore_type === 'plugins') {
					error(
						'No plugin backups found. Run "mcpick backup" first.',
					);
				}
			} else {
				let backup_path: string;
				if (args.file && restore_type === 'plugins') {
					const found = backups.find(
						(b) => b.filename === args.file || b.path === args.file,
					);
					if (!found) {
						error(
							`Backup '${args.file}' not found. Available: ${backups.map((b) => b.filename).join(', ')}`,
						);
					}
					backup_path = found.path;
				} else {
					backup_path = backups[0].path;
				}

				const content = await readFile(backup_path, 'utf-8');
				const parsed = JSON.parse(content);
				await write_claude_settings({
					enabledPlugins: parsed.enabledPlugins || {},
				});

				const plugin_count = Object.keys(
					parsed.enabledPlugins || {},
				).length;
				results.plugins = {
					restored: backup_path,
					plugins: plugin_count,
				};

				if (!args.json) {
					console.log(
						`Restored plugins: ${backup_path} (${plugin_count} plugins)`,
					);
				}
			}
		}

		if (args.json) {
			output(results, true);
		}
	},
});
