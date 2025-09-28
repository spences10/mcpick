import { multiselect, note } from '@clack/prompts';
import {
	calculate_token_estimate,
	create_config_from_servers,
	get_enabled_servers,
	read_claude_config,
	write_claude_config,
} from '../core/config.js';
import {
	get_all_available_servers,
	sync_servers_to_registry,
} from '../core/registry.js';

export async function edit_config(): Promise<void> {
	try {
		const current_config = await read_claude_config();
		const all_servers = await get_all_available_servers();

		if (all_servers.length === 0) {
			note('No MCP servers found in registry. Add servers first.');
			return;
		}

		const currently_enabled = Object.keys(
			current_config.mcpServers || {},
		);

		const server_choices = all_servers.map((server) => ({
			value: server.name,
			label: `${server.name} (${
				server.estimated_tokens || 'unknown'
			} tokens)`,
			hint: server.description || '',
		}));

		const selected_server_names = await multiselect({
			message: 'Select MCP servers to enable:',
			options: server_choices,
			initialValues: currently_enabled,
			required: false,
		});

		if (typeof selected_server_names === 'symbol') {
			return;
		}

		const selected_servers = all_servers.filter((server) =>
			selected_server_names.includes(server.name),
		);

		const new_config = create_config_from_servers(selected_servers);
		await write_claude_config(new_config);

		await sync_servers_to_registry(selected_servers);

		const current_servers = get_enabled_servers(current_config);
		const old_token_count = calculate_token_estimate(current_servers);
		const new_token_count =
			calculate_token_estimate(selected_servers);

		note(
			`Configuration updated!\n` +
				`Enabled servers: ${selected_servers.length}\n` +
				`Token estimate: ${old_token_count} → ${new_token_count} (${
					new_token_count - old_token_count >= 0 ? '+' : ''
				}${new_token_count - old_token_count})`,
		);
	} catch (error) {
		throw new Error(
			`Failed to edit configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
