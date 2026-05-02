import { defineCommand } from 'citty';
import {
	get_client_adapter,
	McpClientScope,
	resolve_client_location,
	set_client_server_enabled,
} from '../../core/client-config.js';
import { get_all_available_servers } from '../../core/registry.js';
import { McpScope } from '../../types.js';
import { remove_mcp_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'disable',
		description: 'Disable an MCP server',
	},
	args: {
		server: {
			type: 'positional',
			description: 'Server name to disable',
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
			description:
				'Scope: local, project, or user (default: local for Claude Code)',
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
			await disable_client_server(
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

		// Sync config→registry before removing so headers/env are preserved
		await get_all_available_servers();

		const result = await remove_mcp_via_cli(args.server);
		if (!result.success) {
			error(result.error || 'Failed to disable server');
		}

		if (args.json) {
			output(
				{ disabled: args.server, client: 'claude-code', scope },
				true,
			);
		} else {
			console.log(`Disabled '${args.server}' (scope: ${scope})`);
		}
	},
});

async function disable_client_server(
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
		const enabled_count = await set_client_server_enabled(
			adapter,
			location,
			server,
			false,
		);
		if (json) {
			output(
				{
					disabled: server,
					client: adapter.id,
					scope: location.scope,
					location: location.path,
					enabledCount: enabled_count,
				},
				true,
			);
		} else {
			console.log(
				`Disabled '${server}' (${adapter.id}:${location.scope})`,
			);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to disable server',
		);
	}
}
