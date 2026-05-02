import { defineCommand } from 'citty';
import {
	apply_profile_to_claude,
	list_profiles,
	save_current_claude_profile,
} from '../../core/profile.js';
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
			const result = await apply_profile_to_claude(args.name);

			if (args.json) {
				output(
					{
						profile: result.profile,
						servers: result.serverCount,
						plugins: result.pluginCount,
					},
					true,
				);
			} else {
				const parts = [`${result.serverCount} servers`];
				if (result.pluginCount > 0) {
					parts.push(`${result.pluginCount} plugins`);
				}
				console.log(
					`Profile '${result.profile}' applied (${parts.join(', ')})`,
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
			const result = await save_current_claude_profile(args.name);

			if (args.json) {
				output(
					{
						profile: result.profile,
						servers: result.serverCount,
						plugins: result.pluginCount,
					},
					true,
				);
			} else {
				const parts = [`${result.serverCount} servers`];
				if (result.pluginCount > 0) {
					parts.push(`${result.pluginCount} plugins`);
				}
				console.log(
					`Profile '${result.profile}' saved (${parts.join(', ')})`,
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
