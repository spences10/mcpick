import { defineCommand } from 'citty';
import { readFile } from 'node:fs/promises';
import { write_claude_config } from '../../core/config.js';
import { list_backups } from '../../core/registry.js';
import { validate_claude_config } from '../../core/validation.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'restore',
		description:
			'Restore MCP server config from a backup (latest if no file specified)',
	},
	args: {
		file: {
			type: 'positional',
			description:
				'Backup filename or path (optional, defaults to latest)',
			required: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const backups = await list_backups();

		if (backups.length === 0) {
			error('No backups found. Run "mcpick backup" first.');
		}

		let backup_path: string;
		if (args.file) {
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

		const server_count = Object.keys(config.mcpServers || {}).length;

		if (args.json) {
			output(
				{
					restored: backup_path,
					servers: server_count,
				},
				true,
			);
		} else {
			console.log(
				`Restored from ${backup_path} (${server_count} servers)`,
			);
		}
	},
});
