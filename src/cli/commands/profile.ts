import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
	preview_replace_client_servers,
	resolve_client_location,
} from '../../core/client-config.js';
import { read_claude_config } from '../../core/config.js';
import {
	apply_profile_to_claude,
	apply_profile_to_client,
	list_profiles,
	load_portable_profile,
	load_profile,
	save_current_claude_profile,
	save_profile_for_client,
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

const CLIENTS =
	'claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi';

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
		client: {
			type: 'string',
			description: `Client to apply to: ${CLIENTS}`,
		},
		scope: {
			type: 'string',
			description: 'Scope: local, project, or user',
		},
		location: {
			type: 'string',
			description:
				'Exact config path when a client has multiple matching locations',
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
			if (args.client || args.scope || args.location) {
				const client = args.client || 'claude-code';
				const adapter = get_client_adapter(client);
				if (!adapter)
					error(`Invalid client: ${client}. Use ${CLIENTS}.`);
				const location = resolve_client_location(
					adapter,
					args.scope as McpClientScope | undefined,
					args.location,
				);

				if (args.dryRun) {
					const profile = await load_portable_profile(args.name);
					print_dry_run(
						await preview_replace_client_servers(
							adapter,
							location,
							profile.servers,
						),
						args.json,
					);
					return;
				}

				const result = await apply_profile_to_client({
					name: args.name,
					client,
					scope: args.scope as McpClientScope | undefined,
					location: args.location,
				});
				if (args.json) {
					output(result, true);
				} else {
					console.log(
						`Profile '${result.profile}' applied to ${result.client}:${result.scope} (${result.serverCount} servers)`,
					);
				}
				return;
			}

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
							after: {
								enabledPlugins: profile.enabledPlugins,
							},
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
				output(result, true);
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
		description: 'Save current config as a portable profile',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Profile name',
			required: true,
		},
		client: {
			type: 'string',
			description: `Client to save from: ${CLIENTS}`,
		},
		scope: {
			type: 'string',
			description: 'Scope: local, project, or user',
		},
		location: {
			type: 'string',
			description:
				'Exact config path when a client has multiple matching locations',
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
			if (args.client || args.scope || args.location) {
				const client = args.client || 'claude-code';
				const adapter = get_client_adapter(client);
				if (!adapter)
					error(`Invalid client: ${client}. Use ${CLIENTS}.`);
				const location = resolve_client_location(
					adapter,
					args.scope as McpClientScope | undefined,
					args.location,
				);
				const servers = await adapter.readLocation(location);
				const profile_data = { version: 2, servers };

				if (args.dryRun) {
					print_dry_run(
						build_json_change_preview({
							operation: 'profile-save',
							client: adapter.id,
							scope: location.scope,
							location: get_profile_path(args.name),
							before: {},
							after: profile_data,
						}),
						args.json,
					);
					return;
				}

				const result = await save_profile_for_client({
					name: args.name,
					client,
					scope: args.scope as McpClientScope | undefined,
					location: args.location,
				});
				if (args.json) {
					output(result, true);
				} else {
					console.log(
						`Profile '${result.profile}' saved from ${result.client}:${result.scope} (${result.serverCount} servers)`,
					);
				}
				return;
			}

			if (args.dryRun) {
				const config = await read_claude_config();
				const settings = await read_claude_settings();
				const profile_data: Record<string, unknown> = {
					version: 2,
					servers: Object.entries(config.mcpServers || {}).map(
						([name, server]) => ({ name, ...server }),
					),
				};
				if (settings.enabledPlugins) {
					profile_data.plugins = settings.enabledPlugins;
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
				output(result, true);
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
		description:
			'Manage portable profiles (MCP servers + optional Claude plugins)',
	},
	subCommands: { list, load, save },
});
