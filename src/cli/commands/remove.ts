import { defineCommand } from 'citty';
import {
	get_all_available_servers,
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
		const all_servers = await get_all_available_servers();
		const found = all_servers.find((s) => s.name === args.server);

		if (!found) {
			error(
				`Server '${args.server}' not found. Run 'mcpick list' to see available servers.`,
			);
		}

		// Remove from registry if present
		const registry = await read_server_registry();
		const index = registry.servers.findIndex(
			(s) => s.name === args.server,
		);
		if (index >= 0) {
			registry.servers.splice(index, 1);
			await write_server_registry(registry);
		}

		// Remove via CLI
		await remove_mcp_via_cli(args.server);

		console.log(`Removed '${args.server}'`);
	},
});
