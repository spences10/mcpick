import { defineCommand } from 'citty';
import { write_claude_config } from '../../core/config.js';
import {
	list_profiles,
	load_profile,
	save_profile,
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
				console.log(`${p.name}  (${p.serverCount} servers)`);
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
			const config = await load_profile(args.name);
			await write_claude_config(config);
			const server_count = Object.keys(
				config.mcpServers || {},
			).length;

			if (args.json) {
				output(
					{
						profile: args.name,
						servers: server_count,
					},
					true,
				);
			} else {
				console.log(
					`Profile '${args.name}' applied (${server_count} servers)`,
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
			const server_count = await save_profile(args.name);

			if (args.json) {
				output(
					{
						profile: args.name,
						servers: server_count,
					},
					true,
				);
			} else {
				console.log(
					`Profile '${args.name}' saved (${server_count} servers)`,
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
		description: 'Manage MCP server profiles',
	},
	subCommands: { list, load, save },
});
