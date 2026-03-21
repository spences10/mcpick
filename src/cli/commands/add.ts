import { defineCommand } from 'citty';
import { add_server_to_registry } from '../../core/registry.js';
import { validate_mcp_server } from '../../core/validation.js';
import { McpScope } from '../../types.js';
import { add_mcp_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

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
		scope: {
			type: 'string',
			description: 'Scope: local, project, or user (default: local)',
			default: 'local',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		const transport = args.type as 'stdio' | 'sse' | 'http';
		if (!['stdio', 'sse', 'http'].includes(transport)) {
			error(`Invalid type: ${transport}. Use stdio, sse, or http.`);
		}

		// Build server object
		const server_data: Record<string, unknown> = {
			name: args.name,
		};

		if (transport === 'stdio') {
			if (!args.command) {
				error('--command is required for stdio transport');
			}
			server_data.command = args.command;
			if (args.args) {
				server_data.args = args.args.split(',');
			}
		} else {
			if (!args.url) {
				error(`--url is required for ${transport} transport`);
			}
			server_data.type = transport;
			server_data.url = args.url;
			if (args.headers) {
				server_data.headers = parse_key_value_pairs(args.headers);
			}
		}

		if (args.env) {
			server_data.env = parse_key_value_pairs(args.env);
		}

		if (args.description) {
			server_data.description = args.description;
		}

		// Validate
		let server;
		try {
			server = validate_mcp_server(server_data);
		} catch (err) {
			error(
				`Invalid server config: ${err instanceof Error ? err.message : 'validation failed'}`,
			);
		}

		// Add to registry
		await add_server_to_registry(server);

		// Enable via CLI
		const result = await add_mcp_via_cli(server, scope);

		if (args.json) {
			output(
				{
					added: server.name,
					scope,
					cli: result.success,
					error: result.error,
				},
				true,
			);
		} else {
			if (result.success) {
				console.log(
					`Added '${server.name}' and enabled (scope: ${scope})`,
				);
			} else {
				console.log(
					`Added '${server.name}' to registry but CLI failed: ${result.error}`,
				);
			}
		}
	},
});

function parse_key_value_pairs(
	input: string,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const pair of input.split(',')) {
		const eq = pair.indexOf('=');
		if (eq > 0) {
			result[pair.substring(0, eq)] = pair.substring(eq + 1);
		}
	}
	return result;
}
