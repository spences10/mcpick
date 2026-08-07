import type { McpServer } from 'tmcp';
import { tool } from 'tmcp/utils';
import * as v from 'valibot';
import type { GenericSchema } from 'valibot';
import {
	client_adapters,
	get_client_adapter,
	type McpClientScope,
} from '../core/client-config.js';
import { get_enabled_servers_for_scope } from '../core/config.js';
import { run_doctor } from '../core/doctor.js';
import { get_all_available_servers } from '../core/registry.js';
import { mcp_get_via_cli } from '../utils/claude-cli.js';
import {
	redact_portable_server,
	redact_server,
	redact_text,
	redact_value,
} from '../utils/redact.js';

const read_only_annotations = {
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: false,
} as const;

/** Tool payloads are free-form objects; keep the output schema honest. */
const payload_schema = v.record(v.string(), v.unknown());

const client_ids = client_adapters.map((adapter) => adapter.id);

type Payload = Record<string, unknown>;

/** Redact, then wrap via tmcp's structured-content helper. */
function tool_result(data: Payload) {
	return tool.structured(redact_value(data) as Payload);
}

/** Tool failures are results, not throws. */
function tool_error(error: unknown) {
	const message =
		error instanceof Error ? error.message : String(error);
	return tool.error(redact_text(message));
}

/** Mirrors the data-gathering of the `list` CLI command. */
async function gather_list(
	client: string | undefined,
	scope: McpClientScope | undefined,
): Promise<Payload> {
	if (client && client !== 'claude-code') {
		const adapter = get_client_adapter(client);
		if (!adapter) {
			throw new Error(
				`Unknown client '${client}'. Known clients: ${client_ids.join(', ')}.`,
			);
		}
		const servers = await adapter.read(scope);
		return {
			client: adapter.id,
			servers: servers.map(redact_portable_server),
		};
	}

	const requested_scopes: McpClientScope[] = scope
		? [scope]
		: ['local', 'project', 'user'];
	const all_servers = await get_all_available_servers();
	const enabled_by_scope: Record<string, string[]> = {};
	for (const current of requested_scopes) {
		enabled_by_scope[current] =
			await get_enabled_servers_for_scope(current);
	}

	return {
		servers: all_servers.map((server) => {
			const status: Record<string, boolean> = {};
			for (const current of requested_scopes) {
				status[current] = enabled_by_scope[current].includes(
					server.name,
				);
			}
			const { name, ...rest } = redact_server(server);
			return { name, ...status, ...rest };
		}),
	};
}

/** Mirrors the `get` CLI command, plus a per-client lookup path. */
async function gather_get(
	name: string,
	client: string | undefined,
): Promise<Payload> {
	if (client) {
		const adapter = get_client_adapter(client);
		if (!adapter) {
			throw new Error(
				`Unknown client '${client}'. Known clients: ${client_ids.join(', ')}.`,
			);
		}
		const servers = await adapter.read();
		const found = servers.find((server) => server.name === name);
		if (!found) {
			throw new Error(
				`Server '${name}' not found in ${adapter.label} configs.`,
			);
		}
		return {
			client: adapter.id,
			server: redact_portable_server(found),
		};
	}

	const result = await mcp_get_via_cli(name);
	if (!result.success) {
		throw new Error(result.error ?? 'Unknown error');
	}
	try {
		return { server: JSON.parse(result.stdout || '{}') };
	} catch {
		return { name, output: result.stdout };
	}
}

/**
 * Register mcpick's read-only tools on an MCP server. All output is
 * redacted before returning; all failures come back as isError results.
 */
export function register_read_only_tools(
	server: McpServer<GenericSchema>,
): void {
	server.tool(
		{
			name: 'mcpick_list',
			description:
				"List configured MCP servers and their enabled status. Without a client, lists the default registry view (same data as `mcpick list`); with a client id, lists that client's servers across its config locations.",
			schema: v.object({
				client: v.optional(v.string()),
				scope: v.optional(v.picklist(['local', 'project', 'user'])),
			}),
			outputSchema: payload_schema,
			annotations: read_only_annotations,
		},
		async ({ client, scope }) => {
			try {
				return tool_result(await gather_list(client, scope));
			} catch (error) {
				return tool_error(error);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_clients',
			description:
				'List supported MCP clients and their known config locations (the adapter matrix: id, label, scopes, paths).',
			outputSchema: payload_schema,
			annotations: read_only_annotations,
		},
		async () =>
			tool_result({
				clients: client_adapters.map((adapter) => ({
					id: adapter.id,
					label: adapter.label,
					locations: adapter.locations(),
				})),
			}),
	);

	server.tool(
		{
			name: 'mcpick_get',
			description:
				"Get details about one MCP server by name. With a client id, reads that client's configs; without one, uses the claude-code CLI (same data as `mcpick get`).",
			schema: v.object({
				name: v.string(),
				client: v.optional(v.string()),
			}),
			outputSchema: payload_schema,
			annotations: read_only_annotations,
		},
		async ({ name, client }) => {
			try {
				return tool_result(await gather_get(name, client));
			} catch (error) {
				return tool_error(error);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_doctor',
			description:
				'Validate known MCP client configs and report problems (same engine as `mcpick doctor`): JSON validity, per-client schema shape, missing commands, duplicate servers, plaintext secrets, unpinned packages.',
			schema: v.object({
				client: v.optional(v.string()),
			}),
			outputSchema: payload_schema,
			annotations: read_only_annotations,
		},
		async ({ client }) => {
			try {
				const report = await run_doctor({ client });
				return tool_result(report as unknown as Payload);
			} catch (error) {
				return tool_error(error);
			}
		},
	);
}
