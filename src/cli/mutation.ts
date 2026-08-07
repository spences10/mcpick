import { McpScope } from '../types.js';
import { unified_diff } from '../utils/diff.js';
import {
	get_claude_config_path,
	get_project_mcp_json_path,
} from '../utils/paths.js';
import { redact_text } from '../utils/redact.js';
import {
	collect_dry_run,
	type DryRunPreview,
	start_dry_run,
} from '../utils/safe-apply.js';
import { output } from './output.js';

export interface CliMutationContext {
	operation: 'add' | 'remove' | 'enable' | 'disable';
	client: 'claude-code';
	scope: McpScope;
	location: string;
	servers: string[];
}

export function claude_mutation_context(
	operation: CliMutationContext['operation'],
	scope: McpScope,
	servers: string[],
): CliMutationContext {
	return {
		operation,
		client: 'claude-code',
		scope,
		location:
			scope === 'project'
				? get_project_mcp_json_path()
				: get_claude_config_path(),
		servers,
	};
}

export function print_mutation_details(input: {
	location?: string;
	backup_path?: string;
}): void {
	if (input.location) console.log(`Config: ${input.location}`);
	if (input.backup_path) console.log(`Backup: ${input.backup_path}`);
}

// ---------------------------------------------------------------------------
// --dry-run plumbing
// ---------------------------------------------------------------------------

export const DRY_RUN_ARG = {
	type: 'boolean',
	description:
		'Preview the exact unified diff of the would-be mutation without writing anything (no file changes, no backup)',
	default: false,
} as const;

/** Read the --dry-run flag from citty args. */
export function is_dry_run_arg(
	args: Record<string, unknown>,
): boolean {
	return args['dry-run'] === true;
}

/**
 * Run a mutation inside a dry-run session: all safe_json_write calls are
 * intercepted and recorded instead of written. The session is always
 * closed, even when the mutation throws.
 */
export async function run_dry_run<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; previews: DryRunPreview[] }> {
	start_dry_run();
	try {
		const result = await fn();
		return { result, previews: collect_dry_run() };
	} catch (err) {
		collect_dry_run();
		throw err;
	}
}

// JSON pair values whose keys look secret-bearing ("GITHUB_TOKEN": "...")
// must never appear in a printed diff. redact.ts has no pattern for this
// shape (it covers key=value and known token formats), so mask at our layer.
const SENSITIVE_JSON_PAIR =
	/("(?:[^"\\]*(?:TOKEN|SECRET|PASSWORD|API[-_]?KEY)[^"\\]*)"\s*:\s*")([^"\\]*)(")/gi;

function mask_sensitive_json_values(content: string): string {
	return content.replace(SENSITIVE_JSON_PAIR, '$1***$3');
}

export function previews_to_diff(previews: DryRunPreview[]): string {
	return previews
		.map((preview) =>
			unified_diff(
				preview.original_content === undefined
					? undefined
					: mask_sensitive_json_values(preview.original_content),
				mask_sensitive_json_values(preview.next_content),
				preview.path,
			),
		)
		.filter(Boolean)
		.join('\n');
}

/**
 * Print the recorded dry-run previews. Human mode prints the redacted
 * unified diff plus a "no changes written" line; JSON mode emits
 * {dry_run, diff, path, warnings?}. Always exits 0 — a non-empty diff is
 * a successful preview, not an error.
 */
export function print_dry_run_preview(
	previews: DryRunPreview[],
	options: { json: boolean; warnings?: unknown[] },
): void {
	const diff = previews_to_diff(previews);
	if (options.json) {
		output(
			{
				dry_run: true,
				diff,
				path: previews[0]?.path ?? null,
				...(options.warnings && options.warnings.length > 0
					? { warnings: options.warnings }
					: {}),
			},
			true,
		);
		return;
	}

	console.log(diff ? redact_text(diff) : '(no changes)');
	console.log('dry-run: no changes written');
}

/**
 * Mutations that go through the claude CLI subprocess cannot be simulated
 * truthfully. Say so (exit 0) instead of printing a fake diff.
 */
export function print_dry_run_unsupported(
	json: boolean,
	warnings?: unknown[],
): void {
	const message =
		'dry-run is unsupported for the claude-code CLI path (the mutation runs via the claude subprocess); use --client for an adapter-backed preview';
	if (json) {
		output(
			{
				dry_run: true,
				supported: false,
				message,
				...(warnings && warnings.length > 0 ? { warnings } : {}),
			},
			true,
		);
		return;
	}
	console.log(message);
}
