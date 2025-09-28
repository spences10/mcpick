import { multiselect, note } from '@clack/prompts';
import {
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

		// If registry is empty but .claude.json has servers, populate registry from config
		let all_servers = await get_all_available_servers();
		if (all_servers.length === 0 && current_config.mcpServers) {
			const current_servers = get_enabled_servers(current_config);
			if (current_servers.length > 0) {
				await sync_servers_to_registry(current_servers);
				all_servers = current_servers;
				note(
					`Imported ${current_servers.length} servers from your .claude.json file into registry.`,
				);
			}
		}

		if (all_servers.length === 0) {
			note(
				'No MCP servers found in .claude.json or registry. Add servers first.',
			);
			return;
		}

		const currently_enabled = Object.keys(
			current_config.mcpServers || {},
		);

		const server_choices = all_servers.map((server) => ({
			value: server.name,
			label: server.name,
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

		note(
			`Configuration updated!\n` +
				`Enabled servers: ${selected_servers.length}`,
		);
	} catch (error) {
		throw new Error(
			`Failed to edit configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
