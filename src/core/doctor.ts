import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { parse as parse_toml } from 'smol-toml';
import type { McpClientId, McpClientScope } from '../types.js';
import {
	check_skill_drift,
	get_skills_provenance_path,
	type AsyncCommandRunner,
} from '../utils/skills-cli.js';
import {
	detect_unpinned_package,
	scan_secret_values,
} from '../utils/secrets.js';
import {
	client_adapters,
	type ClientConfigLocation,
} from './client-config.js';

export type DoctorSeverity = 'error' | 'warning';

export type DoctorCheck =
	| 'config-parse'
	| 'schema-shape'
	| 'command-missing'
	| 'duplicate-server'
	| 'plaintext-secret'
	| 'unpinned-server'
	| 'skill-drift'
	| 'unpinned-skill';

export interface DoctorIssue {
	severity: DoctorSeverity;
	check: DoctorCheck;
	/** Owning client id, or 'skills' for skill provenance findings. */
	client: McpClientId | 'skills';
	path: string;
	server?: string;
	message: string;
	remediation?: string;
}

export interface DoctorSummary {
	errors: number;
	warnings: number;
	checked: number;
}

export interface DoctorReport {
	issues: DoctorIssue[];
	summary: DoctorSummary;
	/** Checks that could not run, e.g. 'skill-drift (gh unavailable)'. */
	skipped_checks: string[];
}

export interface DoctorOptions {
	client?: string;
	/** Injection seam for the skills drift check (defaults to real gh). */
	runner?: AsyncCommandRunner;
}

type JsonObject = Record<string, unknown>;

interface ServerEntry {
	name: string;
	config: JsonObject;
}

interface LocationEntries {
	entries: ServerEntry[];
	/** Entries the client adapter would silently drop. */
	dropped: Array<{ name: string; reason: string }>;
}

const server_keys = [
	'mcpServers',
	'servers',
	'mcp',
	'mcp_servers',
] as const;
type ServerKey = (typeof server_keys)[number];

/** Top-level server-map key each client expects in its config files. */
const client_server_key: Record<McpClientId, ServerKey> = {
	'claude-code': 'mcpServers',
	'claude-desktop': 'mcpServers',
	'gemini-cli': 'mcpServers',
	vscode: 'servers',
	cursor: 'mcpServers',
	windsurf: 'mcpServers',
	opencode: 'mcp',
	pi: 'mcpServers',
	codex: 'mcp_servers',
};

/**
 * Run every doctor check against the known config locations of all (or
 * one) MCP client adapters. Read-only: never writes to disk, never
 * touches the network.
 */
export async function run_doctor(
	options: DoctorOptions = {},
): Promise<DoctorReport> {
	const adapters = options.client
		? client_adapters.filter(
				(adapter) => adapter.id === options.client,
			)
		: client_adapters;

	if (options.client && adapters.length === 0) {
		throw new Error(
			`Unknown client '${options.client}'. Known clients: ${client_adapters
				.map((adapter) => adapter.id)
				.join(', ')}`,
		);
	}

	const issues: DoctorIssue[] = [];
	const checked_paths = new Set<string>();
	const commands: CommandProbe[] = [];

	for (const adapter of adapters) {
		// name -> defining locations, for duplicate detection per client.
		const definitions = new Map<
			string,
			Array<{ location: ClientConfigLocation; rank: number }>
		>();

		for (const location of adapter.locations()) {
			const raw = await read_text_file(location.path);
			if (raw === null) continue; // missing config is not an issue

			checked_paths.add(location.path);

			const data = parse_config_text(adapter.id, location.path, raw);
			if (data === undefined) {
				const format = adapter.id === 'codex' ? 'TOML' : 'JSON/JSONC';
				issues.push({
					severity: 'error',
					check: 'config-parse',
					client: adapter.id,
					path: location.path,
					message: `Config file exists but is not valid ${format}; the client will fail to load it.`,
					remediation:
						'Fix the JSON syntax (or restore from a backup with `mcpick restore`).',
				});
				continue;
			}

			const extracted = extract_entries(adapter.id, location, data);

			check_schema_shape(
				adapter.id,
				location,
				data,
				extracted,
				issues,
			);

			for (const entry of extracted.entries) {
				check_server_entry(
					adapter.id,
					location,
					entry,
					issues,
					commands,
				);

				const list = definitions.get(entry.name) ?? [];
				list.push({
					location,
					rank: location_rank(adapter.id, location),
				});
				definitions.set(entry.name, list);
			}
		}

		check_duplicates(adapter.id, definitions, issues);
	}

	await check_commands_exist(issues, commands);

	const skipped_checks = await check_skills(issues, options.runner);

	const errors = issues.filter(
		(issue) => issue.severity === 'error',
	).length;

	return {
		issues,
		summary: {
			errors,
			warnings: issues.length - errors,
			checked: checked_paths.size,
		},
		skipped_checks,
	};
}

async function read_text_file(path: string): Promise<string | null> {
	try {
		return await readFile(path, 'utf-8');
	} catch {
		return null;
	}
}

function parse_config_text(
	client: McpClientId,
	path: string,
	raw: string,
): JsonObject | undefined {
	if (client === 'codex' || path.endsWith('.toml')) {
		try {
			const parsed = parse_toml(raw);
			return is_object(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}
	return parse_json_or_jsonc(raw);
}

function parse_json_or_jsonc(
	content: string,
): JsonObject | undefined {
	for (const candidate of [content, remove_jsonc_syntax(content)]) {
		try {
			const parsed: unknown = JSON.parse(candidate);
			if (
				parsed &&
				typeof parsed === 'object' &&
				!Array.isArray(parsed)
			) {
				return parsed as JsonObject;
			}
			return undefined;
		} catch {
			// try the JSONC-stripped variant next
		}
	}
	return undefined;
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

function is_object(value: unknown): value is JsonObject {
	return (
		!!value && typeof value === 'object' && !Array.isArray(value)
	);
}

/**
 * Extract the raw server entries a client would read from one location,
 * scope-aware (claude-code local scope lives under projects[cwd]).
 */
function extract_entries(
	client: McpClientId,
	location: ClientConfigLocation,
	data: JsonObject,
): LocationEntries {
	const key = client_server_key[client];
	let map: unknown;

	if (client === 'claude-code' && location.scope === 'local') {
		const projects = data.projects;
		map =
			is_object(projects) && is_object(projects[process.cwd()])
				? (projects[process.cwd()] as JsonObject)[key]
				: undefined;
	} else {
		map = data[key];
	}

	const entries: ServerEntry[] = [];
	const dropped: Array<{ name: string; reason: string }> = [];

	if (map === undefined || map === null) {
		return { entries, dropped };
	}

	if (!is_object(map)) {
		dropped.push({
			name: key,
			reason: `"${key}" is not an object`,
		});
		return { entries, dropped };
	}

	for (const [name, config] of Object.entries(map)) {
		if (is_object(config)) {
			entries.push({ name, config });
		} else {
			dropped.push({ name, reason: 'entry is not an object' });
		}
	}

	return { entries, dropped };
}

function check_schema_shape(
	client: McpClientId,
	location: ClientConfigLocation,
	data: JsonObject,
	extracted: LocationEntries,
	issues: DoctorIssue[],
): void {
	const key = client_server_key[client];

	for (const drop of extracted.dropped) {
		issues.push({
			severity: 'error',
			check: 'schema-shape',
			client,
			path: location.path,
			message: `${drop.reason}; the client will ignore it.`,
			remediation: `Make "${drop.name}" an object mapping server names to server configs.`,
		});
	}

	// The #85 bug class: servers written under a key the client never
	// reads are silently invisible.
	if (location.scope !== 'local' && !(key in data)) {
		const wrong_key = server_keys.find(
			(candidate) =>
				candidate !== key && has_server_entries(data[candidate]),
		);
		if (wrong_key) {
			issues.push({
				severity: 'error',
				check: 'schema-shape',
				client,
				path: location.path,
				message: `Servers are defined under "${wrong_key}" but this client reads "${key}"; every entry is silently ignored.`,
				remediation: `Move the server entries from "${wrong_key}" to "${key}".`,
			});
		}
	}
}

function has_server_entries(value: unknown): boolean {
	return is_object(value) && Object.keys(value).length > 0;
}

type PushIssue = (
	issue: Omit<DoctorIssue, 'client' | 'path' | 'server'>,
) => void;

interface CommandProbe {
	client: McpClientId;
	path: string;
	server: string;
	command: string;
}

function check_server_entry(
	client: McpClientId,
	location: ClientConfigLocation,
	entry: ServerEntry,
	issues: DoctorIssue[],
	commands: CommandProbe[],
): void {
	const config = entry.config;
	const push: PushIssue = (issue) =>
		issues.push({
			client,
			path: location.path,
			server: entry.name,
			...issue,
		});
	if (client === 'opencode') {
		check_opencode_entry(entry, push);
	} else {
		check_standard_entry(entry, push);
	}

	check_env_and_headers(client, entry, push);
	check_unpinned(config.args, push);
	if (client === 'opencode' && is_string_array(config.command)) {
		check_unpinned(config.command.slice(1), push);
	}

	const command = server_command(client, config);
	if (command) {
		commands.push({
			client,
			path: location.path,
			server: entry.name,
			command,
		});
	}
}

function check_standard_entry(
	entry: ServerEntry,
	push: PushIssue,
): void {
	const config = entry.config;
	const url = config.url ?? config.httpUrl ?? config.serverUrl;

	if (config.command !== undefined) {
		if (typeof config.command !== 'string' || !config.command) {
			push({
				severity: 'error',
				check: 'schema-shape',
				message:
					'Server has a "command" that is not a non-empty string; the client cannot launch it.',
			});
			return;
		}
		if (url !== undefined) {
			push({
				severity: 'warning',
				check: 'schema-shape',
				message:
					'Server defines both "command" and a URL; clients disagree on which wins.',
				remediation:
					'Split this into separate stdio and remote server entries.',
			});
		}
	} else if (url !== undefined) {
		if (typeof url !== 'string' || !url) {
			push({
				severity: 'error',
				check: 'schema-shape',
				message:
					'Server has a URL field that is not a non-empty string.',
			});
		}
	} else {
		push({
			severity: 'error',
			check: 'schema-shape',
			message:
				'Server has neither "command" (stdio) nor "url" (remote); the client will ignore it.',
			remediation:
				'Add a "command" with optional "args", or a "url" for a remote server.',
		});
	}

	if (config.args !== undefined && !is_string_array(config.args)) {
		push({
			severity: 'error',
			check: 'schema-shape',
			message: '"args" is not an array of strings.',
		});
	}
}

function check_opencode_entry(
	entry: ServerEntry,
	push: PushIssue,
): void {
	const config = entry.config;
	const type = config.type;

	if (type === 'remote' || (type === undefined && config.url)) {
		if (typeof config.url !== 'string' || !config.url) {
			push({
				severity: 'error',
				check: 'schema-shape',
				message: 'Remote server is missing a non-empty "url".',
			});
		}
		return;
	}

	if (type !== undefined && type !== 'local') {
		push({
			severity: 'error',
			check: 'schema-shape',
			message: `Server "type" must be "local" or "remote", got ${JSON.stringify(type)}.`,
		});
		return;
	}

	if (
		!is_string_array(config.command) ||
		config.command.length === 0
	) {
		push({
			severity: 'error',
			check: 'schema-shape',
			message:
				'Local server needs "command" as a non-empty array of strings (e.g. ["npx", "-y", "pkg"]).',
			remediation:
				'This client reads command as an argv array, not a string plus "args".',
		});
	}
}

function is_string_array(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every((item) => typeof item === 'string')
	);
}

/** The binary a client would exec for a stdio server, if any. */
function server_command(
	client: McpClientId,
	config: JsonObject,
): string | null {
	if (client === 'opencode') {
		if (
			is_string_array(config.command) &&
			config.command.length > 0
		) {
			return config.command[0];
		}
		return null;
	}
	if (typeof config.command === 'string' && config.command) {
		return config.command;
	}
	return null;
}

function check_env_and_headers(
	client: McpClientId,
	entry: ServerEntry,
	push: PushIssue,
): void {
	const config = entry.config;
	const records: Array<[string, unknown]> = [
		['env', config.env],
		['headers', config.headers],
	];
	if (client === 'opencode') {
		records.push(['environment', config.environment]);
	}

	for (const [field, record] of records) {
		if (record === undefined) continue;
		if (!is_object(record)) {
			push({
				severity: 'error',
				check: 'schema-shape',
				message: `"${field}" is not an object mapping names to values.`,
			});
			continue;
		}
		const string_values: Record<string, string> = {};
		for (const [key, value] of Object.entries(record)) {
			if (typeof value !== 'string') continue;
			string_values[key] = value;
		}

		// shared write-path detection lives in utils/secrets.js
		for (const warning of scan_secret_values(string_values)) {
			push({
				severity: 'warning',
				check: 'plaintext-secret',
				message: `"${field}" key "${warning.key}" holds a plaintext secret (${warning.pattern}) in the config file.`,
				remediation: warning.remediation,
			});
		}
	}
}

function check_unpinned(args: unknown, push: PushIssue): void {
	if (!is_string_array(args)) return;

	// shared write-path detection lives in utils/secrets.js
	const warning = detect_unpinned_package(args);
	if (!warning) return;

	push({
		severity: 'warning',
		check: 'unpinned-server',
		message: `Server launches "${warning.key}" without a pinned version (${warning.pattern}); every start pulls whatever is current.`,
		remediation: `${warning.remediation} A future mcpick.lock will record resolved versions for drift detection.`,
	});
}

/**
 * Skills provenance drift (audit rec #9): compares recorded install refs
 * against upstream. Offline-safe — when gh is unavailable the upstream
 * comparison is skipped and reported in the return value, while local
 * findings (unpinned installs) still surface.
 *
 * Returns the skipped_checks notes for the report.
 */
async function check_skills(
	issues: DoctorIssue[],
	runner?: AsyncCommandRunner,
): Promise<string[]> {
	const result = await check_skill_drift(runner);

	for (const finding of result.findings) {
		const { entry } = finding;
		const base = {
			client: 'skills' as const,
			path: finding.installed_path ?? get_skills_provenance_path(),
			server: entry.name,
		};

		if (finding.kind === 'drifted') {
			issues.push({
				...base,
				severity: 'warning',
				check: 'skill-drift',
				message: `Skill "${entry.name}" installed from ${entry.source}@${entry.ref} no longer matches upstream (now ${finding.current}).`,
				remediation:
					'Update or reinstall the skill to move it to the current upstream ref.',
			});
		} else if (finding.kind === 'unresolved') {
			issues.push({
				...base,
				severity: 'warning',
				check: 'skill-drift',
				message: `Skill "${entry.name}" installed from ${entry.source}@${entry.ref} no longer resolves upstream.`,
				remediation:
					'The skill may have been removed upstream or uninstalled outside mcpick; reinstall it or clean up the provenance entry.',
			});
		} else {
			issues.push({
				...base,
				severity: 'warning',
				check: 'unpinned-skill',
				message: `Skill "${entry.name}" installed from ${entry.source} has no recorded ref; drift cannot be detected.`,
				remediation:
					'Reinstall with a pinned ref (owner/repo@ref) so drift detection can track it.',
			});
		}
	}

	if (result.status === 'skipped') {
		return [`skill-drift (${result.reason})`];
	}
	return [];
}

async function check_commands_exist(
	issues: DoctorIssue[],
	commands: CommandProbe[],
): Promise<void> {
	const cache = new Map<string, boolean>();
	for (const item of commands) {
		let available = cache.get(item.command);
		if (available === undefined) {
			available = await command_available(item.command);
			cache.set(item.command, available);
		}
		if (!available) {
			issues.push({
				severity: 'warning',
				check: 'command-missing',
				client: item.client,
				path: item.path,
				server: item.server,
				message: `Command "${item.command}" was not found on PATH; the client will fail to start this server.`,
				remediation:
					'Install the tool or fix the command path, then re-run `mcpick doctor`.',
			});
		}
	}
}

async function command_available(command: string): Promise<boolean> {
	if (command.includes('/') || command.includes('\\')) {
		return is_executable(command);
	}

	const path_env = process.env.PATH ?? '';
	const extensions =
		process.platform === 'win32'
			? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
			: [''];

	for (const dir of path_env.split(delimiter)) {
		if (!dir) continue;
		for (const extension of extensions) {
			if (await is_executable(join(dir, command + extension))) {
				return true;
			}
		}
	}
	return false;
}

async function is_executable(path: string): Promise<boolean> {
	try {
		await access(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Precedence rank for duplicate detection: lower wins.
 * Default: local > project > user. Pi override files beat the shared
 * config at the same scope.
 */
function location_rank(
	client: McpClientId,
	location: ClientConfigLocation,
): number {
	const scope_rank: Record<McpClientScope, number> = {
		local: 0,
		project: 10,
		user: 20,
	};
	let rank = scope_rank[location.scope];
	if (client === 'pi') {
		const is_override =
			location.path.includes('/.pi/') ||
			location.path.includes('\\.pi\\');
		if (!is_override) rank += 1;
	}
	return rank;
}

function check_duplicates(
	client: McpClientId,
	definitions: Map<
		string,
		Array<{ location: ClientConfigLocation; rank: number }>
	>,
	issues: DoctorIssue[],
): void {
	for (const [name, locations] of definitions) {
		if (locations.length < 2) continue;
		const winner = locations.reduce((best, item) =>
			item.rank < best.rank ? item : best,
		);
		const others = locations
			.filter((item) => item !== winner)
			.map((item) => `${item.location.scope} (${item.location.path})`)
			.join(', ');
		issues.push({
			severity: 'warning',
			check: 'duplicate-server',
			client,
			path: winner.location.path,
			server: name,
			message: `Server "${name}" is also defined at ${others}; the ${winner.location.scope} scope wins for this client.`,
			remediation:
				'Remove the shadowed definition if the duplication is accidental.',
		});
	}
}
