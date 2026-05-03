import { defineCommand } from 'citty';
import {
	add_client_server,
	get_client_adapter,
	McpClientScope,
	PortableMcpServer,
	resolve_client_location,
} from '../../core/client-config.js';
import { add_server_to_registry } from '../../core/registry.js';
import { validate_mcp_server } from '../../core/validation.js';
import { McpScope } from '../../types.js';
import { add_mcp_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

interface AddArgs {
	name: string;
	command?: string;
	args?: string;
	url?: string;
	type: string;
	env?: string;
	headers?: string;
	description?: string;
	client?: string;
	scope?: string;
	location?: string;
	json: boolean;
}

export default defineCommand({
	meta: {
		name: 'add',
		description: 'Add a new MCP server to the registry and enable it',
	},
	args: {
		name: {
			type: 'string',
			description: 'Server name',
			required: true,
		},
		command: {
			type: 'string',
			description: 'Command to run (for stdio transport)',
		},
		args: {
			type: 'string',
			description:
				'Comma-separated arguments (e.g. "npx,-y,mcp-sqlite")',
		},
		url: {
			type: 'string',
			description: 'URL (for sse or http transport)',
		},
		type: {
			type: 'string',
			description:
				'Transport type: stdio, sse, or http (default: stdio)',
			default: 'stdio',
		},
		env: {
			type: 'string',
			description: 'Environment variables as KEY=val,KEY=val',
		},
		headers: {
			type: 'string',
			description: 'HTTP headers as KEY=val,KEY=val',
		},
		description: {
			type: 'string',
			description: 'Server description',
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
		const transport = args.type as 'stdio' | 'sse' | 'http';
		if (!['stdio', 'sse', 'http'].includes(transport)) {
			error(`Invalid type: ${transport}. Use stdio, sse, or http.`);
		}

		const add_args = args as AddArgs;
		const portable = build_portable_server(add_args, transport);

		if (add_args.client && add_args.client !== 'claude-code') {
			await add_to_client(
				add_args.client,
				portable,
				add_args.scope as McpClientScope | undefined,
				add_args.location,
				add_args.json,
			);
			return;
		}

		const scope = (add_args.scope || 'local') as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		const server_data: Record<string, unknown> = {
			name: portable.name,
			...(transport !== 'stdio' ? { type: transport } : {}),
			...(portable.command ? { command: portable.command } : {}),
			...(portable.args ? { args: portable.args } : {}),
			...(portable.url ? { url: portable.url } : {}),
			...(portable.env ? { env: portable.env } : {}),
			...(portable.headers ? { headers: portable.headers } : {}),
			...(portable.description
				? { description: portable.description }
				: {}),
		};

		let server;
		try {
			server = validate_mcp_server(server_data);
		} catch (err) {
			error(
				`Invalid server config: ${err instanceof Error ? err.message : 'validation failed'}`,
			);
		}

		await add_server_to_registry(server);
		const result = await add_mcp_via_cli(server, scope);

		if (add_args.json) {
			output(
				{
					added: server.name,
					client: 'claude-code',
					scope,
					cli: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(
				`Added '${server.name}' and enabled (scope: ${scope})`,
			);
		} else {
			console.log(
				`Added '${server.name}' to registry but CLI failed: ${result.error}`,
			);
		}
	},
});

function build_portable_server(
	args: AddArgs,
	transport: 'stdio' | 'sse' | 'http',
): PortableMcpServer {
	const server: PortableMcpServer = { name: args.name, transport };
	if (transport === 'stdio') {
		if (!args.command)
			error('--command is required for stdio transport');
		server.command = args.command;
		if (args.args) server.args = args.args.split(',');
	} else {
		if (!args.url)
			error(`--url is required for ${transport} transport`);
		server.url = args.url;
		if (args.headers) {
			server.headers = parse_key_value_pairs(args.headers);
		}
	}
	if (args.env) server.env = parse_key_value_pairs(args.env);
	if (args.description) server.description = args.description;
	return server;
}

async function add_to_client(
	client: string,
	server: PortableMcpServer,
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
		await add_client_server(adapter, location, server);
		if (json) {
			output(
				{
					added: server.name,
					client: adapter.id,
					scope: location.scope,
					location: location.path,
				},
				true,
			);
		} else {
			console.log(
				`Added '${server.name}' (${adapter.id}:${location.scope})`,
			);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to add server',
		);
	}
}

function parse_key_value_pairs(
	input: string,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const pair of input.split(',')) {
		const eq = pair.indexOf('=');
		if (eq > 0)
			result[pair.substring(0, eq)] = pair.substring(eq + 1);
	}
	return result;
}
