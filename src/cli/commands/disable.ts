import { defineCommand } from 'citty';
import { McpScope } from '../../types.js';
import { remove_mcp_via_cli } from '../../utils/claude-cli.js';
import { error } from '../output.js';

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

		const result = await remove_mcp_via_cli(args.server);
		if (!result.success) {
			error(result.error || 'Failed to disable server');
		}

		console.log(`Disabled '${args.server}' (scope: ${scope})`);
	},
});
