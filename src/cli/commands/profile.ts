import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
	resolve_client_location,
} from '../../core/client-config.js';
import {
	apply_profile_to_claude,
	apply_profile_to_client,
	list_profiles,
	save_current_claude_profile,
	save_profile_for_client,
} from '../../core/profile.js';
import { print_mutation_details } from '../mutation.js';
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
				resolve_client_location(
					adapter,
					args.scope as McpClientScope | undefined,
					args.location,
				);

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
					print_mutation_details(result);
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
				resolve_client_location(
					adapter,
					args.scope as McpClientScope | undefined,
					args.location,
				);

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
