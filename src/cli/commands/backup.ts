import { defineCommand } from 'citty';
import { readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { read_claude_config } from '../../core/config.js';
import { read_claude_settings } from '../../core/settings.js';
import {
	ensure_directory_exists,
	get_backup_filename,
	get_backups_dir,
	get_plugin_backup_filename,
} from '../../utils/paths.js';
import { output } from '../output.js';

const MAX_BACKUPS = 10;

async function cleanup_old_backups(prefix: string): Promise<void> {
	try {
		const backups_dir = get_backups_dir();
		const files = await readdir(backups_dir);
		const backup_files = files
			.filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
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
}

export default defineCommand({
	meta: {
		name: 'backup',
		description:
			'Create a timestamped backup of MCP servers and plugins',
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
		let plugin_path: string | null = null;

		if (plugin_count > 0) {
			const plugin_filename = get_plugin_backup_filename();
			plugin_path = join(backups_dir, plugin_filename);
			const plugin_backup = { enabledPlugins: plugins };
			await writeFile(
				plugin_path,
				JSON.stringify(plugin_backup, null, 2),
				'utf-8',
			);
		}

		await cleanup_old_backups('mcp-servers-');
		await cleanup_old_backups('plugins-');

		const server_count = Object.keys(
			current_config.mcpServers || {},
		).length;

		if (args.json) {
			output(
				{
					mcp: { path: mcp_path, servers: server_count },
					plugins: plugin_path
						? {
								path: plugin_path,
								plugins: plugin_count,
							}
						: null,
				},
				true,
			);
		} else {
			console.log(
				`Backup created: ${mcp_path} (${server_count} servers)`,
			);
			if (plugin_path) {
				console.log(
					`Plugin backup: ${plugin_path} (${plugin_count} plugins)`,
				);
			}
		}
	},
});
