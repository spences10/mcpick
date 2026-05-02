import {
	confirm,
	log,
	multiselect,
	note,
	select,
} from '@clack/prompts';
import {
	client_adapters,
	ClientConfigLocation,
	McpClientAdapter,
	preview_set_client_enabled_servers,
	set_client_enabled_servers,
} from '../core/client-config.js';
import {
	create_config_from_servers,
	get_enabled_servers,
	get_enabled_servers_for_scope,
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
	get_scope_description,
	get_scope_options,
	remove_mcp_via_cli,
} from '../utils/claude-cli.js';
import { redact_url } from '../utils/redact.js';

export async function edit_config(): Promise<void> {
	try {
		const client_id = await select({
			message: 'Which MCP client do you want to edit?',
			options: client_adapters.map((adapter) => ({
				value: adapter.id,
				label: adapter.label,
			})),
			initialValue: 'claude-code',
		});

		if (typeof client_id === 'symbol') return;

		const adapter = client_adapters.find(
			(candidate) => candidate.id === client_id,
		);
		if (!adapter) return;

		if (adapter.id === 'claude-code') {
			await edit_claude_config();
			return;
		}

		await edit_client_config(adapter);
	} catch (error) {
		throw new Error(
			`Failed to edit configuration: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

async function edit_client_config(
	adapter: McpClientAdapter,
): Promise<void> {
	if (!adapter.writeEnabled) {
		note(`${adapter.label} support is read-only for now.`);
		return;
	}

	const location = await select_config_location(adapter);
	if (!location) return;

	const servers = await adapter.readLocation(location);
	if (servers.length === 0) {
		note(`No MCP servers found at ${location.path}.`);
		return;
	}

	const selected_names = await multiselect({
		message: `Toggle MCP servers for ${adapter.label}:`,
		options: servers.map((server) => ({
			value: server.name,
			label: server.name,
			hint: server_hint(server),
		})),
		initialValues: servers
			.filter((server) => server.disabled !== true)
			.map((server) => server.name),
		required: false,
	});

	if (typeof selected_names === 'symbol') return;

	const preview = await preview_set_client_enabled_servers(
		adapter,
		location,
		selected_names,
	);
	if (preview.diff) {
		note(preview.diff, 'Preview');
		const should_apply = await confirm({
			message: 'Apply these changes?',
			initialValue: true,
		});
		if (typeof should_apply === 'symbol' || !should_apply) return;
	}

	await set_client_enabled_servers(adapter, location, selected_names);

	note(
		`Configuration updated!\n` +
			`Client: ${adapter.label}\n` +
			`Config: ${location.path}\n` +
			`Enabled servers: ${selected_names.length}`,
	);
}

async function select_config_location(
	adapter: McpClientAdapter,
): Promise<ClientConfigLocation | null> {
	const locations = adapter.locations();
	if (locations.length === 1) return locations[0];

	const location_path = await select({
		message: `Which ${adapter.label} configuration do you want to edit?`,
		options: locations.map((location) => ({
			value: location.path,
			label: `${location.scope} — ${location.description}`,
			hint: location.path,
		})),
	});

	if (typeof location_path === 'symbol') return null;
	return (
		locations.find((location) => location.path === location_path) ??
		null
	);
}

function server_hint(server: {
	disabled?: boolean;
	transport: string;
	command?: string;
	args?: string[];
	url?: string;
	description?: string;
}): string {
	const status = server.disabled === true ? 'off' : 'on';
	const target = server.command
		? [server.command, ...(server.args ?? [])].join(' ')
		: server.url
			? redact_url(server.url)
			: server.transport;
	return [status, target, server.description]
		.filter(Boolean)
		.join(' · ');
}

async function edit_claude_config(): Promise<void> {
	// Check if Claude CLI is available
	const cli_available = await check_claude_cli();

	// Ask which scope to edit
	const scope = await select<McpScope>({
		message: 'Which Claude Code configuration do you want to edit?',
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
			'No MCP servers found in .claude.json or registry. Add servers with the CLI first.',
		);
		return;
	}

	// Get currently enabled servers for the selected scope
	const currently_enabled =
		await get_enabled_servers_for_scope(scope);

	const selected_server_names = await multiselect({
		message: `Select MCP servers for ${get_scope_description(scope)}:`,
		options: all_servers.map((server) => ({
			value: server.name,
			label: server.name,
			hint: server.description || '',
		})),
		initialValues: currently_enabled,
		required: false,
	});

	if (typeof selected_server_names === 'symbol') return;

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
		let error_count = 0;

		// Add new servers
		for (const name of servers_to_add) {
			const server = all_servers.find((s) => s.name === name);
			if (server) {
				const result = await add_mcp_via_cli(server, scope);
				if (!result.success) {
					error_count++;
					log.warn(`Failed to add ${name}: ${result.error}`);
				}
			}
		}

		// Remove servers
		for (const name of servers_to_remove) {
			const result = await remove_mcp_via_cli(name, scope);
			if (!result.success) {
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
}
