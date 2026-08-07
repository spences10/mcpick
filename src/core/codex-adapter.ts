/**
 * Codex CLI adapter — TOML, the different format in the client matrix.
 *
 * Codex reads ~/.codex/config.toml (user scope only). MCP servers live
 * in [mcp_servers.<name>] tables: command/args/env for stdio, url for
 * streamable HTTP. Key names verified empirically against
 * codex-cli 0.144.6 (`codex mcp add` + `codex mcp list` against a
 * throwaway CODEX_HOME).
 *
 * Enabled/disabled: Codex has a native `enabled` key (verified:
 * `enabled = false` shows status "disabled" in `codex mcp list`), so
 * this adapter uses the 'enabled' mode, like opencode.
 *
 * Write path: safe_toml_write mirrors safe_json_write from
 * utils/safe-apply.ts (backup, temp+rename, verify parse, restore on
 * failure) but for TOML content. Backups use a .toml suffix so the
 * JSON-only restore_config_backup never tries to parse them — rollback
 * integration for TOML backups is a noted follow-up.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'smol-toml';
import { PortableMcpServer } from '../types.js';
import { safe_content_write } from '../utils/safe-apply.js';
import {
	McpClientAdapter,
	normalize_mcp_server,
} from './client-config.js';

type JsonObject = Record<string, unknown>;

const SERVER_KEY = 'mcp_servers';

function get_server_record(
	data: JsonObject,
): Record<string, JsonObject> {
	const servers = data[SERVER_KEY];
	if (
		!servers ||
		typeof servers !== 'object' ||
		Array.isArray(servers)
	) {
		return {};
	}
	return servers as Record<string, JsonObject>;
}

async function read_toml_file(
	path: string,
): Promise<JsonObject | null> {
	let content: string;
	try {
		content = await readFile(path, 'utf-8');
	} catch {
		// File may not exist yet — treat as empty config.
		return null;
	}
	return parse(content) as JsonObject;
}

/**
 * Serialize a portable server to a Codex TOML table. Codex has no
 * `type` field: stdio is command/args/env, HTTP is just `url`.
 * Codex-specific extras (bearer_token_env_var, startup_timeout_sec,
 * cwd, ...) survive via client_options.
 */
function codex_to_toml(server: PortableMcpServer): JsonObject {
	const result: JsonObject = { ...server.client_options };
	if (server.command) result.command = server.command;
	if (server.args && server.args.length > 0)
		result.args = server.args;
	if (server.url) result.url = server.url;
	if (server.env) result.env = server.env;
	if (typeof server.disabled === 'boolean') {
		result.enabled = !server.disabled;
	}
	return result;
}

export const codex_adapter: McpClientAdapter = {
	id: 'codex',
	label: 'Codex CLI',
	locations: () => [
		{
			scope: 'user',
			// homedir() join covers %USERPROFILE%\.codex\config.toml.
			path: join(homedir(), '.codex/config.toml'),
			description: '~/.codex/config.toml mcp_servers',
		},
	],
	async read(scope) {
		if (scope && scope !== 'user') return [];
		return this.readLocation(this.locations()[0]);
	},
	async readLocation(location) {
		const data = await read_toml_file(location.path);
		return Object.entries(get_server_record(data ?? {})).map(
			([name, config]) => normalize_mcp_server(name, config),
		);
	},
	async writeEnabled(location, enabled_names) {
		const data = (await read_toml_file(location.path)) ?? {};
		const servers = get_server_record(data);
		const enabled = new Set(enabled_names);

		for (const [name, config] of Object.entries(servers)) {
			delete config.disabled;
			config.enabled = enabled.has(name);
			servers[name] = config;
		}

		data[SERVER_KEY] = servers;
		return safe_content_write(location.path, stringify(data), 'toml');
	},
	async write_server(location, server) {
		const data = (await read_toml_file(location.path)) ?? {};
		const servers = get_server_record(data);
		servers[server.name] = codex_to_toml(server);
		data[SERVER_KEY] = servers;
		return safe_content_write(location.path, stringify(data), 'toml');
	},
	async write_server_config(location, name, config) {
		const data = (await read_toml_file(location.path)) ?? {};
		const servers = get_server_record(data);
		servers[name] = config;
		data[SERVER_KEY] = servers;
		return safe_content_write(location.path, stringify(data), 'toml');
	},
	async remove_server(location, name) {
		const data = (await read_toml_file(location.path)) ?? {};
		const servers = get_server_record(data);
		delete servers[name];
		data[SERVER_KEY] = servers;
		return safe_content_write(location.path, stringify(data), 'toml');
	},
	async write_servers(location, servers) {
		const data = (await read_toml_file(location.path)) ?? {};
		data[SERVER_KEY] = Object.fromEntries(
			servers.map((server) => [server.name, codex_to_toml(server)]),
		);
		return safe_content_write(location.path, stringify(data), 'toml');
	},
};
