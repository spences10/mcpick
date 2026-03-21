import { defineCommand } from 'citty';
import {
	clean_orphaned_versions,
	clear_plugin_caches,
	get_cached_plugins_info,
	read_installed_plugins,
	refresh_all_marketplaces,
} from '../../core/plugin-cache.js';
import { error, output } from '../output.js';

const status = defineCommand({
	meta: {
		name: 'status',
		description: 'Show cached plugins with staleness info',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const plugins = await get_cached_plugins_info();

		if (args.json) {
			output(plugins, true);
			return;
		}

		if (plugins.length === 0) {
			console.log('No cached plugins found.');
			return;
		}

		for (const p of plugins) {
			const stale_markers: string[] = [];
			if (p.isVersionStale) {
				stale_markers.push(
					`version: ${p.installedVersion} → ${p.latestVersion}`,
				);
			}
			if (p.isShaStale) {
				stale_markers.push('commits behind');
			}
			if (p.orphanedVersions.length > 0) {
				stale_markers.push(`${p.orphanedVersions.length} orphaned`);
			}

			const status_str =
				stale_markers.length > 0
					? `  [stale: ${stale_markers.join(', ')}]`
					: '  [up to date]';

			console.log(
				`${p.name}@${p.marketplace}  v${p.installedVersion}${status_str}`,
			);
		}
	},
});

const clear = defineCommand({
	meta: {
		name: 'clear',
		description: 'Clear plugin caches (refreshes marketplace first)',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace) — omit for all',
			required: false,
		},
		all: {
			type: 'boolean',
			description: 'Clear all plugin caches',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const installed = await read_installed_plugins();
		const all_keys = Object.keys(installed.plugins);

		if (all_keys.length === 0) {
			if (args.json) {
				output({ cleared: [], errors: [] }, true);
			} else {
				console.log('No cached plugins to clear.');
			}
			return;
		}

		let keys_to_clear: string[];

		if (args.plugin) {
			if (!installed.plugins[args.plugin]) {
				error(
					`Plugin '${args.plugin}' not found in cache. Run 'mcpick cache status' to see cached plugins.`,
				);
			}
			keys_to_clear = [args.plugin];
		} else if (args.all) {
			keys_to_clear = all_keys;
		} else {
			error(
				'Specify a plugin key or use --all. Run "mcpick cache status" to see cached plugins.',
			);
		}

		const result = await clear_plugin_caches(keys_to_clear);

		if (args.json) {
			output(result, true);
		} else {
			for (const key of result.cleared) {
				console.log(`Cleared: ${key}`);
			}
			for (const err of result.errors) {
				console.error(`Error: ${err}`);
			}
			if (result.cleared.length > 0) {
				console.log(
					'\nRun /reload-plugins in Claude Code or restart your session.',
				);
			}
		}
	},
});

const clean_orphaned = defineCommand({
	meta: {
		name: 'clean-orphaned',
		description: 'Remove orphaned plugin version directories',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await clean_orphaned_versions();

		if (args.json) {
			output(result, true);
		} else if (result.cleaned === 0) {
			console.log('No orphaned versions found.');
		} else {
			for (const p of result.paths) {
				console.log(`Removed: ${p}`);
			}
			console.log(`\nCleaned ${result.cleaned} orphaned version(s).`);
		}
	},
});

const refresh = defineCommand({
	meta: {
		name: 'refresh',
		description: 'Refresh all marketplace clones (git pull)',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const results = await refresh_all_marketplaces();

		if (args.json) {
			const data = Object.fromEntries(results);
			output(data, true);
			return;
		}

		if (results.size === 0) {
			console.log('No marketplaces configured.');
			return;
		}

		for (const [name, result] of results) {
			if (result.success) {
				console.log(`${name}  refreshed`);
			} else {
				console.error(`${name}  failed: ${result.error}`);
			}
		}
	},
});

export default defineCommand({
	meta: {
		name: 'cache',
		description: 'Manage plugin cache',
	},
	subCommands: {
		status,
		clear,
		'clean-orphaned': clean_orphaned,
		refresh,
	},
});
