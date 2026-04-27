import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
} from '../../core/client-config.js';
import { get_enabled_servers_for_scope } from '../../core/config.js';
import { get_all_available_servers } from '../../core/registry.js';
import { McpScope } from '../../types.js';
import {
	redact_portable_server,
	redact_server,
	redact_url,
} from '../../utils/redact.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'list',
		description: 'List all MCP servers and their status',
	},
	args: {
		client: {
			type: 'string',
			description:
				'Client to read: claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi',
		},
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
		if (args.client && args.client !== 'claude-code') {
			await list_client_servers(
				args.client,
				args.scope as McpClientScope | undefined,
				args.json,
			);
			return;
		}

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
				const { name, ...rest } = redact_server(server);
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

async function list_client_servers(
	client: string,
	scope: McpClientScope | undefined,
	json: boolean,
): Promise<void> {
	const adapter = get_client_adapter(client);
	if (!adapter) {
		error(
			`Invalid client: ${client}. Use claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi.`,
		);
	}

	if (scope && !['local', 'project', 'user'].includes(scope)) {
		error(`Invalid scope: ${scope}. Use local, project, or user.`);
	}

	const supported_scopes = new Set(
		adapter.locations().map((location) => location.scope),
	);
	if (scope && !supported_scopes.has(scope)) {
		error(
			`${adapter.label} does not support ${scope} scope in MCPick yet.`,
		);
	}

	const servers = await adapter.read(scope);
	if (json) {
		output(
			{
				client: adapter.id,
				servers: servers.map(redact_portable_server),
			},
			true,
		);
		return;
	}

	if (servers.length === 0) {
		console.log(`No MCP servers found for ${adapter.label}.`);
		return;
	}

	for (const server of servers) {
		const status = server.disabled ? 'off' : 'on';
		const target =
			server.command ||
			(server.url ? redact_url(server.url) : '(unknown)');
		console.log(
			`${server.name}  ${status}  ${server.transport}  ${target}`,
		);
	}
}
