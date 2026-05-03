import { multiselect, note, select } from '@clack/prompts';
import {
	client_adapters,
	ClientConfigLocation,
	McpClientAdapter,
	normalize_mcp_server,
	replace_client_servers,
	set_client_enabled_servers,
} from '../core/client-config.js';
import { get_all_available_servers } from '../core/registry.js';
import { PortableMcpServer } from '../types.js';
import { redact_url } from '../utils/redact.js';

export async function edit_config(): Promise<void> {
	try {
		const sorted_adapters = [...client_adapters].sort((a, b) =>
			b.label.localeCompare(a.label),
		);
		const client_id = await select({
			message: 'Which MCP client do you want to edit?',
			options: sorted_adapters.map((adapter) => ({
				value: adapter.id,
				label: adapter.label,
			})),
			initialValue: sorted_adapters[0]?.id,
		});

		if (typeof client_id === 'symbol') return;

		const adapter = client_adapters.find(
			(candidate) => candidate.id === client_id,
		);
		if (!adapter) return;

		if (adapter.id === 'claude-code') {
			await edit_claude_config(adapter);
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

	const mutation = await set_client_enabled_servers(
		adapter,
		location,
		selected_names,
	);

	note(
		`Configuration updated!\n` +
			`Client: ${adapter.label}\n` +
			`Config: ${mutation.location}\n` +
			(mutation.backup_path
				? `Backup: ${mutation.backup_path}\n`
				: '') +
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

async function edit_claude_config(
	adapter: McpClientAdapter,
): Promise<void> {
	const location = await select_config_location(adapter);
	if (!location) return;

	const registry_servers = (await get_all_available_servers()).map(
		(server) => {
			const { name, ...config } = server;
			return normalize_mcp_server(name, config);
		},
	);
	const current_servers = await adapter.readLocation(location);
	const servers_by_name = new Map<string, PortableMcpServer>();
	for (const server of registry_servers) {
		servers_by_name.set(server.name, server);
	}
	for (const server of current_servers) {
		if (!servers_by_name.has(server.name)) {
			servers_by_name.set(server.name, server);
		}
	}
	const all_servers = [...servers_by_name.values()];

	if (all_servers.length === 0) {
		note(
			'No MCP servers found in this Claude Code config or registry. Add servers with the CLI first.',
		);
		return;
	}

	const currently_enabled = current_servers
		.filter((server) => server.disabled !== true)
		.map((server) => server.name);
	const selected_server_names = await multiselect({
		message: `Select MCP servers for ${location.description}:`,
		options: all_servers.map((server) => ({
			value: server.name,
			label: server.name,
			hint: server_hint(server),
		})),
		initialValues: currently_enabled,
		required: false,
	});

	if (typeof selected_server_names === 'symbol') return;

	const selected_servers = all_servers.filter((server) =>
		selected_server_names.includes(server.name),
	);
	const mutation = await replace_client_servers(
		adapter,
		location,
		selected_servers,
	);

	note(
		`Configuration updated!\n` +
			`Client: ${adapter.label}\n` +
			`Config: ${mutation.location}\n` +
			(mutation.backup_path
				? `Backup: ${mutation.backup_path}\n`
				: '') +
			`Enabled servers: ${selected_servers.length}`,
	);
}
