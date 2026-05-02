import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
	preview_remove_client_server,
	remove_client_server,
	resolve_client_location,
} from '../../core/client-config.js';
import {
	get_all_available_servers,
	read_server_registry,
	write_server_registry,
} from '../../core/registry.js';
import { McpScope } from '../../types.js';
import {
	build_remove_args,
	remove_mcp_via_cli,
} from '../../utils/claude-cli.js';
import { build_command_preview } from '../../utils/config-preview.js';
import { print_dry_run } from '../dry-run.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'remove',
		description:
			'Remove an MCP server from the registry and disable it',
	},
	args: {
		server: {
			type: 'positional',
			description: 'Server name to remove',
			required: true,
		},
		client: {
			type: 'string',
			description:
				'Client to edit: claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi',
			default: 'claude-code',
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
		if (args.client && args.client !== 'claude-code') {
			await remove_from_client(
				args.client,
				args.server,
				args.scope as McpClientScope | undefined,
				args.location,
				args.json,
				args.dryRun,
			);
			return;
		}

		const scope = (args.scope || 'local') as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		const all_servers = await get_all_available_servers();
		const found = all_servers.find((s) => s.name === args.server);

		if (!found) {
			error(
				`Server '${args.server}' not found. Run 'mcpick list' to see available servers.`,
			);
		}

		if (args.dryRun) {
			print_dry_run(
				build_command_preview({
					operation: 'remove-server',
					client: 'claude-code',
					scope,
					location: 'Claude Code CLI + mcpick registry',
					command: [
						'claude',
						...build_remove_args(args.server, scope),
					],
				}),
				args.json,
			);
			return;
		}

		const registry = await read_server_registry();
		const index = registry.servers.findIndex(
			(s) => s.name === args.server,
		);
		if (index >= 0) {
			registry.servers.splice(index, 1);
			await write_server_registry(registry);
		}

		await remove_mcp_via_cli(args.server, scope);

		if (args.json) {
			output(
				{ removed: args.server, client: 'claude-code', scope },
				true,
			);
		} else {
			console.log(`Removed '${args.server}'`);
		}
	},
});

async function remove_from_client(
	client: string,
	server: string,
	scope: McpClientScope | undefined,
	location_path: string | undefined,
	json: boolean,
	dry_run: boolean,
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

	try {
		const location = resolve_client_location(
			adapter,
			scope,
			location_path,
		);
		if (dry_run) {
			print_dry_run(
				await preview_remove_client_server(adapter, location, server),
				json,
			);
			return;
		}

		await remove_client_server(adapter, location, server);
		if (json) {
			output(
				{
					removed: server,
					client: adapter.id,
					scope: location.scope,
					location: location.path,
				},
				true,
			);
		} else {
			console.log(
				`Removed '${server}' (${adapter.id}:${location.scope})`,
			);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to remove server',
		);
	}
}
