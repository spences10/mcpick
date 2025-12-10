import { log, multiselect, note, select } from '@clack/prompts';
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
import { McpScope } from '../types.js';
import {
	add_mcp_via_cli,
	check_claude_cli,
	get_scope_options,
	get_scope_description,
	remove_mcp_via_cli,
} from '../utils/claude-cli.js';

export async function edit_config(): Promise<void> {
	try {
		// Check if Claude CLI is available
		const cli_available = await check_claude_cli();

		// Ask which scope to edit
		const scope = await select<McpScope>({
			message: 'Which configuration do you want to edit?',
			options: get_scope_options(),
			initialValue: 'local',
		});

		if (typeof scope === 'symbol') return;

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
			message: `Select MCP servers for ${get_scope_description(scope)}:`,
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

		// Determine which servers to add and remove
		const servers_to_add = selected_server_names.filter(
			(name) => !currently_enabled.includes(name),
		);
		const servers_to_remove = currently_enabled.filter(
			(name) => !selected_server_names.includes(name),
		);

		// If CLI is available, use it for add/remove operations
		if (cli_available && (scope === 'local' || scope === 'project')) {
			let success_count = 0;
			let error_count = 0;

			// Add new servers
			for (const name of servers_to_add) {
				const server = all_servers.find((s) => s.name === name);
				if (server) {
					const result = await add_mcp_via_cli(server, scope);
					if (result.success) {
						success_count++;
					} else {
						error_count++;
						log.warn(`Failed to add ${name}: ${result.error}`);
					}
				}
			}

			// Remove servers
			for (const name of servers_to_remove) {
				const result = await remove_mcp_via_cli(name);
				if (result.success) {
					success_count++;
				} else {
					error_count++;
					log.warn(`Failed to remove ${name}: ${result.error}`);
				}
			}

			await sync_servers_to_registry(selected_servers);

			if (error_count > 0) {
				note(
					`Configuration updated with ${error_count} errors.\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Added: ${servers_to_add.length}, Removed: ${servers_to_remove.length}`,
				);
			} else {
				note(
					`Configuration updated!\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Enabled servers: ${selected_servers.length}`,
				);
			}
		} else {
			// Fallback to direct file writing (user scope or no CLI)
			const new_config = create_config_from_servers(selected_servers);
			await write_claude_config(new_config);
			await sync_servers_to_registry(selected_servers);

			if (!cli_available && scope !== 'user') {
				log.warn(
					`Claude CLI not available. Changes written to ~/.claude.json (user scope) instead of ${scope} scope.`,
				);
			}

			note(
				`Configuration updated!\n` +
					`Enabled servers: ${selected_servers.length}`,
			);
		}
	} catch (error) {
		throw new Error(
			`Failed to edit configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
