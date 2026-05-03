import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
	remove_client_server,
	resolve_client_location,
} from '../../core/client-config.js';
import {
	get_all_available_servers,
	read_server_registry,
	write_server_registry,
} from '../../core/registry.js';
import { McpScope } from '../../types.js';
import { remove_mcp_via_cli } from '../../utils/claude-cli.js';
import {
	claude_mutation_context,
	print_mutation_details,
} from '../mutation.js';
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

		const registry = await read_server_registry();
		const index = registry.servers.findIndex(
			(s) => s.name === args.server,
		);
		if (index >= 0) {
			registry.servers.splice(index, 1);
			await write_server_registry(registry);
		}

		await remove_mcp_via_cli(args.server, scope);
		const mutation = claude_mutation_context('remove', scope, [
			args.server,
		]);

		if (args.json) {
			output({ removed: args.server, ...mutation }, true);
		} else {
			console.log(`Removed '${args.server}'`);
			print_mutation_details(mutation);
		}
	},
});

async function remove_from_client(
	client: string,
	server: string,
	scope: McpClientScope | undefined,
	location_path: string | undefined,
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

	try {
		const location = resolve_client_location(
			adapter,
			scope,
			location_path,
		);
		const mutation = await remove_client_server(
			adapter,
			location,
			server,
		);
		if (json) {
			output({ removed: server, ...mutation }, true);
		} else {
			console.log(
				`Removed '${server}' (${adapter.id}:${location.scope})`,
			);
			print_mutation_details(mutation);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to remove server',
		);
	}
}
