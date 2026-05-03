import { defineCommand } from 'citty';
import {
	add_client_server_config,
	get_client_adapter,
	McpClientScope,
	resolve_client_location,
} from '../../core/client-config.js';
import { McpScope } from '../../types.js';
import { mcp_add_json_via_cli } from '../../utils/claude-cli.js';
import {
	claude_mutation_context,
	print_mutation_details,
} from '../mutation.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'add-json',
		description: 'Add an MCP server from a JSON configuration string',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Server name',
			required: true,
		},
		config: {
			type: 'positional',
			description: 'JSON configuration string',
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
		let parsed: unknown;
		try {
			parsed = JSON.parse(args.config);
		} catch {
			error(
				'Invalid JSON configuration. Provide a valid JSON string.',
			);
		}
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed)
		) {
			error('JSON configuration must be an object.');
		}

		if (args.client && args.client !== 'claude-code') {
			await add_json_to_client(
				args.client,
				args.name,
				parsed as Record<string, unknown>,
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

		const result = await mcp_add_json_via_cli(
			args.name,
			args.config,
			scope,
		);
		const mutation = claude_mutation_context('add', scope, [
			args.name,
		]);

		if (args.json) {
			output(
				{
					added: args.name,
					...mutation,
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(`Added '${args.name}' from JSON (scope: ${scope})`);
			print_mutation_details(mutation);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

async function add_json_to_client(
	client: string,
	name: string,
	config: Record<string, unknown>,
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
		const mutation = await add_client_server_config(
			adapter,
			location,
			name,
			config,
		);
		if (json) {
			output({ added: name, ...mutation }, true);
		} else {
			console.log(
				`Added '${name}' from JSON (${adapter.id}:${location.scope})`,
			);
			print_mutation_details(mutation);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to add server',
		);
	}
}
