/**
 * MCP mutation tools: enable, disable, remove, add, add-json.
 *
 * Registered on the tmcp server built in src/mcp/server.ts (Peer A).
 * Each tool reuses the same core write paths as the CLI commands and
 * the Phase-1 secrets write-path hardening (warnings + from_env).
 *
 * Contract: every handler returns structuredContent (redacted) with
 * the same JSON stringified into content[0].text; errors return
 * tool.error(...) (isError) with a redacted message — handlers never
 * throw.
 */
import type { McpServer } from 'tmcp';
import { tool } from 'tmcp/utils';
import * as v from 'valibot';
import type { GenericSchema } from 'valibot';
import {
	add_client_server,
	add_client_server_config,
	ClientMutationResult,
	get_client_adapter,
	McpClientScope,
	remove_client_server,
	resolve_client_location,
	set_client_server_enabled,
} from '../core/client-config.js';
import {
	add_server_to_registry,
	get_all_available_servers,
	read_server_registry,
	write_server_registry,
} from '../core/registry.js';
import { validate_mcp_server } from '../core/validation.js';
import {
	McpClientId,
	McpScope,
	PortableMcpServer,
} from '../types.js';
import {
	add_mcp_via_cli,
	mcp_add_json_via_cli,
	remove_mcp_via_cli,
} from '../utils/claude-cli.js';
import { redact_text, redact_value } from '../utils/redact.js';
import {
	collect_config_warnings,
	ConfigWarning,
	resolve_from_env,
} from '../utils/secrets.js';

const client_schema = v.optional(
	v.picklist([
		'claude-code',
		'gemini-cli',
		'vscode',
		'cursor',
		'windsurf',
		'opencode',
		'pi',
	]),
);

const scope_schema = v.optional(
	v.picklist(['local', 'project', 'user']),
);

const from_env_schema = v.optional(v.array(v.string()));

const ROLLBACK_NOTE =
	'An automatic rollback backup is created before the config file is written. ' +
	'Recovery: `mcpick rollback` / `mcpick restore` on the CLI.';

// tmcp requires an outputSchema for structuredContent responses.
const output_schema = v.record(v.string(), v.unknown());

function ok(result: Record<string, unknown>) {
	const safe = redact_value(result) as Record<string, unknown>;
	return tool.structured(safe);
}

function fail(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return tool.error(redact_text(message));
}

function resolve_scope(scope?: McpClientScope): McpScope {
	const resolved = scope ?? 'local';
	if (!['local', 'project', 'user'].includes(resolved)) {
		throw new Error(
			`Invalid scope: ${resolved}. Use local, project, or user.`,
		);
	}
	return resolved;
}

function get_adapter(client: McpClientId) {
	const adapter = get_client_adapter(client);
	if (!adapter) {
		throw new Error(`Invalid client: ${client}.`);
	}
	return adapter;
}

function with_warnings(
	result: Record<string, unknown>,
	warnings: ConfigWarning[],
): Record<string, unknown> {
	return warnings.length > 0 ? { ...result, warnings } : result;
}

async function find_registry_server(name: string) {
	const all_servers = await get_all_available_servers();
	const server = all_servers.find(
		(candidate) => candidate.name === name,
	);
	if (!server) {
		throw new Error(
			`Server '${name}' not found in registry. Run 'mcpick list' to see available servers.`,
		);
	}
	return server;
}

interface NameInput {
	name: string;
	client?: McpClientId;
	scope?: McpClientScope;
}

async function enable_server(
	input: NameInput,
): Promise<Record<string, unknown>> {
	const client = input.client ?? 'claude-code';
	if (client !== 'claude-code') {
		const adapter = get_adapter(client);
		const location = resolve_client_location(adapter, input.scope);
		const mutation = await set_client_server_enabled(
			adapter,
			location,
			input.name,
			true,
		);
		return { enabled: input.name, ...mutation };
	}

	const scope = resolve_scope(input.scope);
	const server = await find_registry_server(input.name);
	const result = await add_mcp_via_cli(server, scope);
	if (!result.success) {
		throw new Error(result.error || 'Failed to enable server');
	}
	return {
		enabled: server.name,
		operation: 'enable',
		client: 'claude-code',
		scope,
		servers: [server.name],
	};
}

async function disable_server(
	input: NameInput,
): Promise<Record<string, unknown>> {
	const client = input.client ?? 'claude-code';
	if (client !== 'claude-code') {
		const adapter = get_adapter(client);
		const location = resolve_client_location(adapter, input.scope);
		const mutation = await set_client_server_enabled(
			adapter,
			location,
			input.name,
			false,
		);
		return { disabled: input.name, ...mutation };
	}

	const scope = resolve_scope(input.scope);
	const result = await remove_mcp_via_cli(input.name, scope);
	if (!result.success) {
		throw new Error(result.error || 'Failed to disable server');
	}
	return {
		disabled: input.name,
		operation: 'disable',
		client: 'claude-code',
		scope,
		servers: [input.name],
	};
}

async function remove_server(
	input: NameInput,
): Promise<Record<string, unknown>> {
	const client = input.client ?? 'claude-code';
	if (client !== 'claude-code') {
		const adapter = get_adapter(client);
		const location = resolve_client_location(adapter, input.scope);
		const mutation: ClientMutationResult = await remove_client_server(
			adapter,
			location,
			input.name,
		);
		return { removed: input.name, ...mutation };
	}

	const scope = resolve_scope(input.scope);
	await find_registry_server(input.name);
	const registry = await read_server_registry();
	const index = registry.servers.findIndex(
		(server) => server.name === input.name,
	);
	if (index >= 0) {
		registry.servers.splice(index, 1);
		await write_server_registry(registry);
	}
	await remove_mcp_via_cli(input.name, scope);
	return {
		removed: input.name,
		operation: 'remove',
		client: 'claude-code',
		scope,
		servers: [input.name],
	};
}

interface AddInput {
	name: string;
	command?: string;
	args?: string[];
	url?: string;
	type?: 'stdio' | 'sse' | 'http';
	env?: Record<string, string>;
	headers?: Record<string, string>;
	description?: string;
	client?: McpClientId;
	scope?: McpClientScope;
	from_env?: string[];
}

async function add_server(
	input: AddInput,
): Promise<Record<string, unknown>> {
	const transport = input.type ?? 'stdio';
	const server: PortableMcpServer = {
		name: input.name,
		transport,
	};
	if (transport === 'stdio') {
		if (!input.command) {
			throw new Error('command is required for stdio transport');
		}
		server.command = input.command;
		if (input.args) server.args = input.args;
	} else {
		if (!input.url) {
			throw new Error(`url is required for ${transport} transport`);
		}
		server.url = input.url;
		if (input.headers) server.headers = input.headers;
	}
	if (input.env) server.env = input.env;
	if (input.description) server.description = input.description;

	// Resolve before anything else so a missing variable fails
	// before any write. Values are never logged.
	if (input.from_env && input.from_env.length > 0) {
		server.env = {
			...server.env,
			...resolve_from_env(input.from_env),
		};
	}

	const warnings = collect_config_warnings({
		env: server.env,
		headers: server.headers,
		args: server.args,
	});

	const client = input.client ?? 'claude-code';
	if (client !== 'claude-code') {
		const adapter = get_adapter(client);
		const location = resolve_client_location(adapter, input.scope);
		const mutation = await add_client_server(
			adapter,
			location,
			server,
		);
		return with_warnings(
			{ added: server.name, ...mutation },
			warnings,
		);
	}

	const scope = resolve_scope(input.scope);
	const server_data: Record<string, unknown> = {
		name: server.name,
		...(transport !== 'stdio' ? { type: transport } : {}),
		...(server.command ? { command: server.command } : {}),
		...(server.args ? { args: server.args } : {}),
		...(server.url ? { url: server.url } : {}),
		...(server.env ? { env: server.env } : {}),
		...(server.headers ? { headers: server.headers } : {}),
		...(server.description
			? { description: server.description }
			: {}),
	};
	const validated = validate_mcp_server(server_data);
	await add_server_to_registry(validated);
	const result = await add_mcp_via_cli(validated, scope);
	return with_warnings(
		{
			added: validated.name,
			operation: 'add',
			client: 'claude-code',
			scope,
			servers: [validated.name],
			cli: result.success,
			error: result.error,
		},
		warnings,
	);
}

interface AddJsonInput {
	name: string;
	config: Record<string, unknown>;
	client?: McpClientId;
	scope?: McpClientScope;
	from_env?: string[];
}

function string_record(
	value: unknown,
): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.values(value).every(
		(entry) => typeof entry === 'string',
	);
}

async function add_server_json(
	input: AddJsonInput,
): Promise<Record<string, unknown>> {
	const config = { ...input.config };

	// Merge before anything else so a missing variable fails
	// before any write. Values are never logged.
	if (input.from_env && input.from_env.length > 0) {
		const from_env = resolve_from_env(input.from_env);
		const existing_env = string_record(config.env) ? config.env : {};
		config.env = { ...existing_env, ...from_env };
	}

	const warnings = collect_config_warnings({
		env: string_record(config.env) ? config.env : undefined,
		headers: string_record(config.headers)
			? config.headers
			: undefined,
		args: Array.isArray(config.args)
			? config.args.filter(
					(arg): arg is string => typeof arg === 'string',
				)
			: undefined,
	});

	const client = input.client ?? 'claude-code';
	if (client !== 'claude-code') {
		const adapter = get_adapter(client);
		const location = resolve_client_location(adapter, input.scope);
		const mutation = await add_client_server_config(
			adapter,
			location,
			input.name,
			config,
		);
		return with_warnings(
			{ added: input.name, ...mutation },
			warnings,
		);
	}

	const scope = resolve_scope(input.scope);
	const result = await mcp_add_json_via_cli(
		input.name,
		JSON.stringify(config),
		scope,
	);
	if (!result.success) {
		throw new Error(result.error || 'Unknown error');
	}
	return with_warnings(
		{
			added: input.name,
			operation: 'add',
			client: 'claude-code',
			scope,
			servers: [input.name],
			success: result.success,
		},
		warnings,
	);
}

const name_only_schema = v.object({
	name: v.pipe(v.string(), v.description('Server name')),
	client: client_schema,
	scope: scope_schema,
});

export function register_mutation_tools(
	server: McpServer<GenericSchema>,
): void {
	server.tool(
		{
			name: 'mcpick_enable',
			outputSchema: output_schema,
			description:
				'Enable an MCP server in a client config. ' + ROLLBACK_NOTE,
			schema: name_only_schema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async (input) => {
			try {
				return ok(await enable_server(input));
			} catch (err) {
				return fail(err);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_disable',
			outputSchema: output_schema,
			description:
				'Disable an MCP server in a client config without removing it. ' +
				ROLLBACK_NOTE,
			schema: name_only_schema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
		async (input) => {
			try {
				return ok(await disable_server(input));
			} catch (err) {
				return fail(err);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_remove',
			outputSchema: output_schema,
			description:
				'Remove an MCP server from the registry and client config. ' +
				ROLLBACK_NOTE,
			schema: name_only_schema,
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		async (input) => {
			try {
				return ok(await remove_server(input));
			} catch (err) {
				return fail(err);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_add',
			outputSchema: output_schema,
			description:
				'Add a new MCP server and enable it. Secret-looking env/header values ' +
				'trigger non-blocking warnings (returned in the "warnings" field); prefer ' +
				'from_env for secrets so values never appear in tool arguments. ' +
				ROLLBACK_NOTE,
			schema: v.object({
				name: v.pipe(v.string(), v.description('Server name')),
				command: v.optional(
					v.pipe(
						v.string(),
						v.description('Command to run (stdio transport)'),
					),
				),
				args: v.optional(
					v.pipe(
						v.array(v.string()),
						v.description('Command arguments'),
					),
				),
				url: v.optional(
					v.pipe(
						v.string(),
						v.description('URL (sse or http transport)'),
					),
				),
				type: v.optional(
					v.pipe(
						v.picklist(['stdio', 'sse', 'http']),
						v.description('Transport type (default: stdio)'),
					),
				),
				env: v.optional(
					v.pipe(
						v.record(v.string(), v.string()),
						v.description('Environment variables'),
					),
				),
				headers: v.optional(
					v.pipe(
						v.record(v.string(), v.string()),
						v.description('HTTP headers (sse/http transport)'),
					),
				),
				description: v.optional(v.string()),
				client: client_schema,
				scope: scope_schema,
				from_env: v.pipe(
					from_env_schema,
					v.description(
						'Environment variable names to resolve from the MCP server process environment ' +
							'and merge into env. Use this for secrets so values never appear in tool arguments. ' +
							'Fails before any write if a named variable is unset or empty.',
					),
				),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		async (input) => {
			try {
				return ok(await add_server(input));
			} catch (err) {
				return fail(err);
			}
		},
	);

	server.tool(
		{
			name: 'mcpick_add_json',
			outputSchema: output_schema,
			description:
				'Add an MCP server from a JSON configuration object. Secret-looking ' +
				'env/header values trigger non-blocking warnings (returned in the ' +
				'"warnings" field); prefer from_env for secrets so values never appear ' +
				'in tool arguments. ' +
				ROLLBACK_NOTE,
			schema: v.object({
				name: v.pipe(v.string(), v.description('Server name')),
				config: v.pipe(
					v.record(v.string(), v.unknown()),
					v.description(
						'Server configuration object (e.g. {"command":"npx","args":["-y","some-mcp"]})',
					),
				),
				client: client_schema,
				scope: scope_schema,
				from_env: from_env_schema,
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
			},
		},
		async (input) => {
			try {
				return ok(await add_server_json(input));
			} catch (err) {
				return fail(err);
			}
		},
	);
}
