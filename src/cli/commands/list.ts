import { defineCommand } from 'citty';
import { get_enabled_servers_for_scope } from '../../core/config.js';
import { get_all_available_servers } from '../../core/registry.js';
import { McpScope } from '../../types.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'list',
		description: 'List all MCP servers and their status',
	},
	args: {
		scope: {
			type: 'string',
			description: 'Scope to check: local, project, or user',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scopes: McpScope[] = args.scope
			? [args.scope as McpScope]
			: ['local', 'project', 'user'];

		if (
			args.scope &&
			!['local', 'project', 'user'].includes(args.scope)
		) {
			error(
				`Invalid scope: ${args.scope}. Use local, project, or user.`,
			);
		}

		const all_servers = await get_all_available_servers();
		const enabled_by_scope: Record<string, string[]> = {};

		for (const scope of scopes) {
			enabled_by_scope[scope] =
				await get_enabled_servers_for_scope(scope);
		}

		if (args.json) {
			const data = all_servers.map((server) => {
				const status: Record<string, boolean> = {};
				for (const scope of scopes) {
					status[scope] = enabled_by_scope[scope].includes(
						server.name,
					);
				}
				const { name, ...rest } = server;
				return { name, ...status, ...rest };
			});
			output(data, true);
		} else {
			if (all_servers.length === 0) {
				console.log('No servers in registry.');
				return;
			}

			for (const server of all_servers) {
				const statuses = scopes
					.map((scope) => {
						const enabled = enabled_by_scope[scope].includes(
							server.name,
						);
						return `${scope}:${enabled ? 'on' : 'off'}`;
					})
					.join(' ');
				console.log(`${server.name}  ${statuses}`);
			}
		}
	},
});
