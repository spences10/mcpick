import { defineCommand } from 'citty';
import { write_claude_config } from '../../core/config.js';
import {
	list_profiles,
	load_profile,
	save_profile,
} from '../../core/profile.js';
import { write_claude_settings } from '../../core/settings.js';
import { error, output } from '../output.js';

const list = defineCommand({
	meta: {
		name: 'list',
		description: 'List all saved profiles',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const profiles = await list_profiles();

		if (args.json) {
			output(profiles, true);
		} else {
			if (profiles.length === 0) {
				console.log('No profiles found.');
				return;
			}
			for (const p of profiles) {
				const parts = [`${p.serverCount} servers`];
				if (p.pluginCount > 0) {
					parts.push(`${p.pluginCount} plugins`);
				}
				console.log(`${p.name}  (${parts.join(', ')})`);
			}
		}
	},
});

const load = defineCommand({
	meta: {
		name: 'load',
		description: 'Load and apply a saved profile',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Profile name',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		try {
			const profile = await load_profile(args.name);
			await write_claude_config(profile.config);
			const server_count = Object.keys(
				profile.config.mcpServers || {},
			).length;

			let plugin_count = 0;
			if (profile.enabledPlugins) {
				await write_claude_settings({
					enabledPlugins: profile.enabledPlugins,
				});
				plugin_count = Object.keys(profile.enabledPlugins).length;
			}

			if (args.json) {
				output(
					{
						profile: args.name,
						servers: server_count,
						plugins: plugin_count,
					},
					true,
				);
			} else {
				const parts = [`${server_count} servers`];
				if (plugin_count > 0) {
					parts.push(`${plugin_count} plugins`);
				}
				console.log(
					`Profile '${args.name}' applied (${parts.join(', ')})`,
				);
			}
		} catch (err) {
			error(
				err instanceof Error ? err.message : 'Failed to load profile',
			);
		}
	},
});

const save = defineCommand({
	meta: {
		name: 'save',
		description: 'Save current config as a profile',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Profile name',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		try {
			const counts = await save_profile(args.name);

			if (args.json) {
				output(
					{
						profile: args.name,
						servers: counts.serverCount,
						plugins: counts.pluginCount,
					},
					true,
				);
			} else {
				const parts = [`${counts.serverCount} servers`];
				if (counts.pluginCount > 0) {
					parts.push(`${counts.pluginCount} plugins`);
				}
				console.log(
					`Profile '${args.name}' saved (${parts.join(', ')})`,
				);
			}
		} catch (err) {
			error(
				err instanceof Error ? err.message : 'Failed to save profile',
			);
		}
	},
});

export default defineCommand({
	meta: {
		name: 'profile',
		description: 'Manage profiles (MCP servers + plugins)',
	},
	subCommands: { list, load, save },
});
