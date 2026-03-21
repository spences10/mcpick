import { defineCommand } from 'citty';
import { readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { read_claude_config } from '../../core/config.js';
import {
	ensure_directory_exists,
	get_backup_filename,
	get_backups_dir,
} from '../../utils/paths.js';
import { output } from '../output.js';

const MAX_BACKUPS = 10;

export default defineCommand({
	meta: {
		name: 'backup',
		description: 'Create a timestamped backup of MCP server config',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const current_config = await read_claude_config();
		const backups_dir = get_backups_dir();

		await ensure_directory_exists(backups_dir);

		const backup_filename = get_backup_filename();
		const backup_path = join(backups_dir, backup_filename);

		const mcp_backup = {
			mcpServers: current_config.mcpServers || {},
		};

		await writeFile(
			backup_path,
			JSON.stringify(mcp_backup, null, 2),
			'utf-8',
		);

		// Cleanup old backups
		try {
			const files = await readdir(backups_dir);
			const backup_files = files
				.filter(
					(f) => f.startsWith('mcp-servers-') && f.endsWith('.json'),
				)
				.sort()
				.reverse();

			if (backup_files.length > MAX_BACKUPS) {
				for (const file of backup_files.slice(MAX_BACKUPS)) {
					await unlink(join(backups_dir, file));
				}
			}
		} catch {
			// Cleanup is best-effort
		}

		const server_count = Object.keys(
			current_config.mcpServers || {},
		).length;

		if (args.json) {
			output({ path: backup_path, servers: server_count }, true);
		} else {
			console.log(
				`Backup created: ${backup_path} (${server_count} servers)`,
			);
		}
	},
});
