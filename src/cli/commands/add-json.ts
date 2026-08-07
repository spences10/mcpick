import { defineCommand } from 'citty';
import {
	add_client_server_config,
	get_client_adapter,
	McpClientScope,
	resolve_client_location,
} from '../../core/client-config.js';
import { McpScope } from '../../types.js';
import { mcp_add_json_via_cli } from '../../utils/claude-cli.js';
import {
	collect_config_warnings,
	ConfigWarning,
	emit_warnings,
	resolve_from_env,
} from '../../utils/secrets.js';
import {
	claude_mutation_context,
	DRY_RUN_ARG,
	is_dry_run_arg,
	print_dry_run_preview,
	print_dry_run_unsupported,
	print_mutation_details,
	run_dry_run,
} from '../mutation.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'add-json',
		description: 'Add an MCP server from a JSON configuration string',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Server name',
			required: true,
		},
		config: {
			type: 'positional',
			description: 'JSON configuration string',
			required: true,
		},
		from_env: {
			type: 'string',
			description:
				'Read env values from the process environment (KEY,KEY2), merged into the JSON env object, so secrets never appear in conversation context. Example: pnpx nopeek run .env --only GITHUB_TOKEN -- mcpick add-json myserver \'{"command":"npx","args":["-y","some-mcp"]}\' --from-env GITHUB_TOKEN --json',
		},
		client: {
			type: 'string',
			description:
				'Client to edit: claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi',
			default: 'claude-code',
		},
		scope: {
			type: 'string',
			description:
				'Scope: local, project, or user (default: local for Claude Code)',
		},
		location: {
			type: 'string',
			description:
				'Exact config path when a client has multiple matching locations',
		},
		'dry-run': DRY_RUN_ARG,
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const dry_run = is_dry_run_arg(args);
		let parsed: unknown;
		try {
			parsed = JSON.parse(args.config);
		} catch {
			error(
				'Invalid JSON configuration. Provide a valid JSON string.',
			);
		}
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed)
		) {
			error('JSON configuration must be an object.');
		}

		const config = parsed as Record<string, unknown>;

		// Fail before any write if a --from-env variable is missing.
		// Merges into the JSON payload's env object.
		if (args.from_env) {
			const from_env = resolve_from_env_flag(args.from_env);
			const existing_env =
				config.env &&
				typeof config.env === 'object' &&
				!Array.isArray(config.env)
					? (config.env as Record<string, unknown>)
					: {};
			config.env = { ...existing_env, ...from_env };
		}

		// Non-blocking write-time warnings (secrets, version pinning).
		const warnings = collect_config_warnings({
			env: is_string_record(config.env) ? config.env : undefined,
			headers: is_string_record(config.headers)
				? config.headers
				: undefined,
			args: Array.isArray(config.args)
				? config.args.filter(
						(arg): arg is string => typeof arg === 'string',
					)
				: undefined,
		});
		emit_warnings(warnings);

		if (args.client && args.client !== 'claude-code') {
			await add_json_to_client(
				args.client,
				args.name,
				config,
				args.scope as McpClientScope | undefined,
				args.location,
				args.json,
				warnings,
				dry_run,
			);
			return;
		}

		const scope = (args.scope || 'local') as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		if (dry_run) {
			print_dry_run_unsupported(args.json, warnings);
			return;
		}

		const result = await mcp_add_json_via_cli(
			args.name,
			JSON.stringify(config),
			scope,
		);
		const mutation = claude_mutation_context('add', scope, [
			args.name,
		]);

		if (args.json) {
			output(
				{
					added: args.name,
					...mutation,
					success: result.success,
					error: result.error,
					...(warnings.length > 0 ? { warnings } : {}),
				},
				true,
			);
		} else if (result.success) {
			console.log(`Added '${args.name}' from JSON (scope: ${scope})`);
			print_mutation_details(mutation);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

async function add_json_to_client(
	client: string,
	name: string,
	config: Record<string, unknown>,
	scope: McpClientScope | undefined,
	location_path: string | undefined,
	json: boolean,
	warnings: ConfigWarning[],
	dry_run: boolean,
): Promise<void> {
	const adapter = get_client_adapter(client);
	if (!adapter) {
		error(
			`Invalid client: ${client}. Use claude-code, gemini-cli, vscode, cursor, windsurf, opencode, or pi.`,
		);
	}
	if (scope && !['local', 'project', 'user'].includes(scope)) {
		error(`Invalid scope: ${scope}. Use local, project, or user.`);
	}

	try {
		const location = resolve_client_location(
			adapter,
			scope,
			location_path,
		);
		if (dry_run) {
			const { previews } = await run_dry_run(() =>
				add_client_server_config(adapter, location, name, config),
			);
			print_dry_run_preview(previews, { json, warnings });
			return;
		}
		const mutation = await add_client_server_config(
			adapter,
			location,
			name,
			config,
		);
		if (json) {
			output(
				{
					added: name,
					...mutation,
					...(warnings.length > 0 ? { warnings } : {}),
				},
				true,
			);
		} else {
			console.log(
				`Added '${name}' from JSON (${adapter.id}:${location.scope})`,
			);
			print_mutation_details(mutation);
		}
	} catch (err) {
		error(
			err instanceof Error ? err.message : 'Failed to add server',
		);
	}
}

function resolve_from_env_flag(
	from_env: string,
): Record<string, string> {
	const keys = from_env
		.split(',')
		.map((key) => key.trim())
		.filter((key) => key.length > 0);
	if (keys.length === 0) return {};
	try {
		return resolve_from_env(keys);
	} catch (err) {
		error(err instanceof Error ? err.message : '--from-env failed');
	}
}

function is_string_record(
	value: unknown,
): value is Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return Object.values(value).every(
		(entry) => typeof entry === 'string',
	);
}
