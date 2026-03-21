import { defineCommand } from 'citty';
import {
	read_server_registry,
	write_server_registry,
} from '../../core/registry.js';
import { remove_mcp_via_cli } from '../../utils/claude-cli.js';
import { error } from '../output.js';

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
	},
	async run({ args }) {
		const registry = await read_server_registry();
		const index = registry.servers.findIndex(
			(s) => s.name === args.server,
		);

		if (index < 0) {
			error(
				`Server '${args.server}' not found in registry. Run 'mcpick list' to see available servers.`,
			);
		}

		// Remove from registry
		registry.servers.splice(index, 1);
		await write_server_registry(registry);

		// Also disable via CLI (best effort)
		await remove_mcp_via_cli(args.server);

		console.log(`Removed '${args.server}' from registry`);
	},
});
