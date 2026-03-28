import { defineCommand } from 'citty';
import {
	detect_server_scope,
	find_server_in_scope,
} from '../../core/config.js';
import { add_server_to_registry } from '../../core/registry.js';
import { validate_mcp_server } from '../../core/validation.js';
import type { McpScope } from '../../types.js';
import { add_mcp_via_cli } from '../../utils/claude-cli.js';
import { redact_server } from '../../utils/redact.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'clone',
		description:
			'Clone an existing MCP server config with a new name, optionally overriding command/args',
	},
	args: {
		source: {
			type: 'positional',
			description: 'Source server name to clone from',
			required: true,
		},
		name: {
			type: 'positional',
			description: 'New server name',
			required: true,
		},
		command: {
			type: 'string',
			description: 'Override command (e.g. "node" for local dev)',
		},
		args: {
			type: 'string',
			description: 'Override comma-separated arguments',
		},
		scope: {
			type: 'string',
			description: 'Scope for new server (default: same as source)',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		if (
			args.scope &&
			!['local', 'project', 'user'].includes(args.scope)
		) {
			error(
				`Invalid scope: ${args.scope}. Use local, project, or user.`,
			);
		}

		// Find the source server
		const scope = args.scope as McpScope | undefined;
		let found;
		if (scope) {
			found = await find_server_in_scope(args.source, scope);
		} else {
			found = await detect_server_scope(args.source);
		}

		if (!found) {
			error(
				`Server '${args.source}' not found${scope ? ` in ${scope} scope` : ' in any scope'}`,
			);
		}

		const target_scope = (args.scope as McpScope) || found.scope;

		// Clone the config, applying overrides
		const cloned: Record<string, unknown> = {
			...found.server,
			name: args.name,
		};

		if (args.command) {
			cloned.command = args.command;
			// When overriding command, clear url/type if switching from http/sse to stdio
			delete cloned.url;
			if (cloned.type === 'sse' || cloned.type === 'http') {
				delete cloned.type;
			}
		}

		if (args.args) {
			cloned.args = args.args.split(',');
		}

		// Validate
		let server;
		try {
			server = validate_mcp_server(cloned);
		} catch (err) {
			error(
				`Invalid cloned config: ${err instanceof Error ? err.message : 'validation failed'}`,
			);
		}

		// Add to registry
		await add_server_to_registry(server);

		// Enable via CLI
		const result = await add_mcp_via_cli(server, target_scope);

		if (args.json) {
			output(
				{
					cloned: server.name,
					from: args.source,
					scope: target_scope,
					server: redact_server(server),
					cli: result.success,
					error: result.error,
				},
				true,
			);
		} else {
			if (result.success) {
				console.log(
					`Cloned '${args.source}' → '${server.name}' (scope: ${target_scope})`,
				);
			} else {
				console.log(
					`Cloned '${args.source}' → '${server.name}' to registry but CLI failed: ${result.error}`,
				);
			}
		}
	},
});
