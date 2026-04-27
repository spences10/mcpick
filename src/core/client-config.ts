import {
	access,
	mkdir,
	readFile,
	rename,
	writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { get_claude_config_path } from '../utils/paths.js';

export type McpClientId =
	| 'claude-code'
	| 'gemini-cli'
	| 'vscode'
	| 'cursor'
	| 'windsurf'
	| 'opencode'
	| 'pi';

export type McpClientScope = 'local' | 'project' | 'user';
export type McpTransport = 'stdio' | 'http' | 'sse';

export interface PortableMcpServer {
	name: string;
	transport: McpTransport;
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	headers?: Record<string, string>;
	description?: string;
	disabled?: boolean;
	clientOptions?: Record<string, unknown>;
}

export interface ClientConfigLocation {
	scope: McpClientScope;
	path: string;
	description: string;
}

export interface McpClientAdapter {
	id: McpClientId;
	label: string;
	locations: () => ClientConfigLocation[];
	read: (scope?: McpClientScope) => Promise<PortableMcpServer[]>;
	readLocation: (
		location: ClientConfigLocation,
	) => Promise<PortableMcpServer[]>;
	writeEnabled?: (
		location: ClientConfigLocation,
		enabledNames: string[],
	) => Promise<void>;
}

type JsonObject = Record<string, unknown>;

const client_options_to_skip = new Set([
	'name',
	'type',
	'command',
	'args',
	'url',
	'httpUrl',
	'serverUrl',
	'env',
	'headers',
	'description',
	'disabled',
	'enabled',
	'environment',
]);

async function file_exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function read_json_file(
	path: string,
): Promise<JsonObject | null> {
	try {
		const content = await readFile(path, 'utf-8');
		return parse_json_or_jsonc(content) as JsonObject;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return null;
		}
		throw error;
	}
}

async function write_json_file(
	path: string,
	data: JsonObject,
): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp_path = join(dirname(path), `.${Date.now()}.tmp`);
	await writeFile(tmp_path, JSON.stringify(data, null, 2), 'utf-8');
	await rename(tmp_path, path);
}

function parse_json_or_jsonc(content: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		return JSON.parse(remove_jsonc_syntax(content));
	}
}

function remove_jsonc_syntax(content: string): string {
	let result = '';
	let in_string = false;
	let quote = '';
	let escaped = false;
	let in_line_comment = false;
	let in_block_comment = false;

	for (let index = 0; index < content.length; index++) {
		const char = content[index];
		const next = content[index + 1];

		if (in_line_comment) {
			if (char === '\n' || char === '\r') {
				in_line_comment = false;
				result += char;
			}
			continue;
		}

		if (in_block_comment) {
			if (char === '*' && next === '/') {
				in_block_comment = false;
				index++;
			}
			continue;
		}

		if (in_string) {
			result += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				in_string = false;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			in_string = true;
			quote = char;
			result += char;
			continue;
		}

		if (char === '/' && next === '/') {
			in_line_comment = true;
			index++;
			continue;
		}

		if (char === '/' && next === '*') {
			in_block_comment = true;
			index++;
			continue;
		}

		result += char;
	}

	return remove_trailing_commas(result);
}

function remove_trailing_commas(content: string): string {
	let result = '';
	let in_string = false;
	let quote = '';
	let escaped = false;

	for (let index = 0; index < content.length; index++) {
		const char = content[index];

		if (in_string) {
			result += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				in_string = false;
			}
			continue;
		}

		if (char === '"') {
			in_string = true;
			quote = char;
			result += char;
			continue;
		}

		if (char === ',') {
			let cursor = index + 1;
			while (/\s/.test(content[cursor] ?? '')) {
				cursor++;
			}
			if (content[cursor] === '}' || content[cursor] === ']') {
				continue;
			}
		}

		result += char;
	}

	return result;
}

function string_record(
	value: unknown,
): Record<string, string> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === 'string') {
			result[key] = item;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function string_array(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const values = value.filter(
		(item): item is string => typeof item === 'string',
	);
	return values.length > 0 ? values : undefined;
}

function infer_transport(config: JsonObject): McpTransport {
	if (
		config.type === 'http' ||
		config.type === 'remote' ||
		config.httpUrl ||
		config.serverUrl
	) {
		return 'http';
	}
	if (config.type === 'sse') {
		return 'sse';
	}
	if (config.url && !config.command) {
		// Cursor/Windsurf use url/serverUrl for remote servers without a type.
		return 'http';
	}
	return 'stdio';
}

export function normalize_mcp_server(
	name: string,
	config: JsonObject,
): PortableMcpServer {
	const transport = infer_transport(config);
	const url =
		typeof config.httpUrl === 'string'
			? config.httpUrl
			: typeof config.serverUrl === 'string'
				? config.serverUrl
				: typeof config.url === 'string'
					? config.url
					: undefined;
	const clientOptions: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(config)) {
		if (!client_options_to_skip.has(key)) {
			clientOptions[key] = value;
		}
	}

	const command_array = string_array(config.command);
	const command =
		typeof config.command === 'string'
			? config.command
			: command_array?.[0];
	const args = string_array(config.args) ?? command_array?.slice(1);
	const env =
		string_record(config.env) ?? string_record(config.environment);
	const disabled =
		typeof config.disabled === 'boolean'
			? config.disabled
			: typeof config.enabled === 'boolean'
				? !config.enabled
				: undefined;

	return {
		name,
		transport,
		...(command ? { command } : {}),
		...(args && args.length > 0 ? { args } : {}),
		...(url ? { url } : {}),
		...(env ? { env } : {}),
		...(string_record(config.headers)
			? { headers: string_record(config.headers) }
			: {}),
		...(typeof config.description === 'string'
			? { description: config.description }
			: {}),
		...(typeof disabled === 'boolean' ? { disabled } : {}),
		...(Object.keys(clientOptions).length > 0
			? { clientOptions }
			: {}),
	};
}

function get_server_record(
	data: JsonObject | null,
	key: 'mcpServers' | 'servers' | 'mcp',
): Record<string, JsonObject> {
	const servers = data?.[key];
	if (
		!servers ||
		typeof servers !== 'object' ||
		Array.isArray(servers)
	) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(servers as Record<string, unknown>).filter(
			(entry): entry is [string, JsonObject] => {
				const [, value] = entry;
				return (
					!!value &&
					typeof value === 'object' &&
					!Array.isArray(value)
				);
			},
		),
	);
}

function read_server_map(
	data: JsonObject | null,
	key: 'mcpServers' | 'servers' | 'mcp',
): PortableMcpServer[] {
	return Object.entries(get_server_record(data, key)).map(
		([name, config]) => normalize_mcp_server(name, config),
	);
}

function set_server_enabled(
	config: JsonObject,
	enabled: boolean,
	mode: 'disabled' | 'enabled',
): void {
	if (mode === 'enabled' || 'enabled' in config) {
		config.enabled = enabled;
		delete config.disabled;
		return;
	}
	config.disabled = !enabled;
}

function create_json_adapter(options: {
	id: McpClientId;
	label: string;
	serverKey: 'mcpServers' | 'servers' | 'mcp';
	disabledMode?: 'disabled' | 'enabled';
	locations: () => ClientConfigLocation[];
}): McpClientAdapter {
	return {
		id: options.id,
		label: options.label,
		locations: options.locations,
		async read(scope) {
			const locations = scope
				? options
						.locations()
						.filter((location) => location.scope === scope)
				: options.locations();
			const result: PortableMcpServer[] = [];

			for (const location of locations) {
				for (const server of await this.readLocation(location)) {
					result.push(server);
				}
			}

			return result;
		},
		async readLocation(location) {
			return read_server_map(
				await read_json_file(location.path),
				options.serverKey,
			);
		},
		async writeEnabled(location, enabledNames) {
			const data = (await read_json_file(location.path)) ?? {};
			const servers = get_server_record(data, options.serverKey);
			const enabled = new Set(enabledNames);

			for (const [name, config] of Object.entries(servers)) {
				set_server_enabled(
					config,
					enabled.has(name),
					options.disabledMode ?? 'disabled',
				);
			}

			data[options.serverKey] = servers;
			await write_json_file(location.path, data);
		},
	};
}

function project_path(path: string): string {
	return join(process.cwd(), path);
}

export const client_adapters: McpClientAdapter[] = [
	{
		id: 'claude-code',
		label: 'Claude Code',
		locations: () => [
			{
				scope: 'local',
				path: get_claude_config_path(),
				description: '~/.claude.json projects[cwd].mcpServers',
			},
			{
				scope: 'project',
				path: project_path('.mcp.json'),
				description: '.mcp.json mcpServers',
			},
			{
				scope: 'user',
				path: get_claude_config_path(),
				description: '~/.claude.json mcpServers',
			},
		],
		async read(scope) {
			const locations = scope
				? this.locations().filter(
						(location) => location.scope === scope,
					)
				: this.locations();
			const result: PortableMcpServer[] = [];

			for (const location of locations) {
				result.push(...(await this.readLocation(location)));
			}

			return result;
		},
		async readLocation(location) {
			if (location.scope === 'project') {
				return read_server_map(
					await read_json_file(location.path),
					'mcpServers',
				);
			}

			const data = await read_json_file(get_claude_config_path());
			if (location.scope === 'user') {
				return read_server_map(data, 'mcpServers');
			}

			const projects = data?.projects;
			if (
				!projects ||
				typeof projects !== 'object' ||
				Array.isArray(projects)
			) {
				return [];
			}

			const project_config = (projects as JsonObject)[process.cwd()];
			if (
				!project_config ||
				typeof project_config !== 'object' ||
				Array.isArray(project_config)
			) {
				return [];
			}

			return read_server_map(
				project_config as JsonObject,
				'mcpServers',
			);
		},
	},
	create_json_adapter({
		id: 'gemini-cli',
		label: 'Gemini CLI',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.gemini/settings.json'),
				description: '.gemini/settings.json mcpServers',
			},
			{
				scope: 'user',
				path: join(homedir(), '.gemini/settings.json'),
				description: '~/.gemini/settings.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'vscode',
		label: 'VS Code / GitHub Copilot',
		serverKey: 'servers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.vscode/mcp.json'),
				description: '.vscode/mcp.json servers',
			},
		],
	}),
	create_json_adapter({
		id: 'cursor',
		label: 'Cursor',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'project',
				path: project_path('.cursor/mcp.json'),
				description: '.cursor/mcp.json mcpServers',
			},
			{
				scope: 'user',
				path: join(homedir(), '.cursor/mcp.json'),
				description: '~/.cursor/mcp.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'windsurf',
		label: 'Windsurf',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'user',
				path: join(homedir(), '.codeium/windsurf/mcp_config.json'),
				description: '~/.codeium/windsurf/mcp_config.json mcpServers',
			},
		],
	}),
	create_json_adapter({
		id: 'opencode',
		label: 'OpenCode',
		serverKey: 'mcp',
		disabledMode: 'enabled',
		locations: () => [
			{
				scope: 'project',
				path: project_path('opencode.json'),
				description: 'opencode.json mcp',
			},
			{
				scope: 'user',
				path: join(homedir(), '.config/opencode/opencode.json'),
				description: '~/.config/opencode/opencode.json mcp',
			},
		],
	}),
	create_json_adapter({
		id: 'pi',
		label: 'Pi MCP Adapter',
		serverKey: 'mcpServers',
		locations: () => [
			{
				scope: 'user',
				path: join(homedir(), '.config/mcp/mcp.json'),
				description: '~/.config/mcp/mcp.json shared MCP config',
			},
			{
				scope: 'user',
				path: join(homedir(), '.pi/agent/mcp.json'),
				description: '~/.pi/agent/mcp.json Pi global override',
			},
			{
				scope: 'project',
				path: project_path('.mcp.json'),
				description: '.mcp.json shared project MCP config',
			},
			{
				scope: 'project',
				path: project_path('.pi/mcp.json'),
				description: '.pi/mcp.json Pi project override',
			},
		],
	}),
];

export function get_client_adapter(
	id: string,
): McpClientAdapter | null {
	return client_adapters.find((adapter) => adapter.id === id) ?? null;
}

export async function list_client_locations(): Promise<
	Array<
		ClientConfigLocation & {
			client: McpClientId;
			label: string;
			exists: boolean;
		}
	>
> {
	const locations = await Promise.all(
		client_adapters.flatMap((adapter) =>
			adapter.locations().map(async (location) => ({
				client: adapter.id,
				label: adapter.label,
				...location,
				exists: await file_exists(location.path),
			})),
		),
	);
	return locations;
}
