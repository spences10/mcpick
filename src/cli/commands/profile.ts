import { defineCommand } from 'citty';
import { read_claude_config } from '../../core/config.js';
import {
	apply_profile_to_claude,
	list_profiles,
	load_profile,
	save_current_claude_profile,
} from '../../core/profile.js';
import { read_claude_settings } from '../../core/settings.js';
import { build_json_change_preview } from '../../utils/config-preview.js';
import {
	get_claude_config_path,
	get_claude_settings_path,
	get_profile_path,
} from '../../utils/paths.js';
import { print_dry_run } from '../dry-run.js';
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
		dryRun: {
			type: 'boolean',
			description: 'Preview changes without writing',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		try {
			if (args.dryRun) {
				const profile = await load_profile(args.name);
				const previews = [
					build_json_change_preview({
						operation: 'profile-load',
						client: 'claude-code',
						scope: 'user',
						location: get_claude_config_path(),
						before: await read_claude_config(),
						after: profile.config,
					}),
				];

				if (profile.enabledPlugins) {
					previews.push(
						build_json_change_preview({
							operation: 'profile-load-plugins',
							client: 'claude-code',
							scope: 'user',
							location: get_claude_settings_path(),
							before: await read_claude_settings(),
							after: { enabledPlugins: profile.enabledPlugins },
						}),
					);
				}

				if (args.json) {
					output(previews, true);
				} else {
					for (const preview of previews)
						print_dry_run(preview, false);
				}
				return;
			}

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
		dryRun: {
			type: 'boolean',
			description: 'Preview changes without writing',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		try {
			if (args.dryRun) {
				const config = await read_claude_config();
				const settings = await read_claude_settings();
				const profile_data: Record<string, unknown> = {
					mcpServers: config.mcpServers || {},
				};
				if (settings.enabledPlugins) {
					profile_data.enabledPlugins = settings.enabledPlugins;
				}
				print_dry_run(
					build_json_change_preview({
						operation: 'profile-save',
						client: 'claude-code',
						scope: 'user',
						location: get_profile_path(args.name),
						before: {},
						after: profile_data,
					}),
					args.json,
				);
				return;
			}

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
