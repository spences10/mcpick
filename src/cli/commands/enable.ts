import { defineCommand } from 'citty';
import { get_all_available_servers } from '../../core/registry.js';
import { McpScope } from '../../types.js';
import { add_mcp_via_cli } from '../../utils/claude-cli.js';
import { error } from '../output.js';

export default defineCommand({
	meta: {
		name: 'enable',
		description: 'Enable an MCP server',
	},
	args: {
		server: {
			type: 'positional',
			description: 'Server name to enable',
			required: true,
		},
		scope: {
			type: 'string',
			description: 'Scope: local, project, or user (default: local)',
			default: 'local',
		},
	},
	async run({ args }) {
		const scope = args.scope as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		const all_servers = await get_all_available_servers();
		const server = all_servers.find((s) => s.name === args.server);

		if (!server) {
			error(
				`Server '${args.server}' not found in registry. Run 'mcpick list' to see available servers.`,
			);
		}

		const result = await add_mcp_via_cli(server, scope);
		if (!result.success) {
			error(result.error || 'Failed to enable server');
		}

		console.log(`Enabled '${server.name}' (scope: ${scope})`);
	},
});
