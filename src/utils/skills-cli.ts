import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { atomic_json_write } from './atomic-write.js';
import { ensure_directory_exists, get_mcpick_dir } from './paths.js';
import { redact_text } from './redact.js';

export interface SkillsCliResult {
	success: boolean;
	stdout?: string;
	stderr?: string;
	error?: string;
	warnings?: string[];
	data?: unknown;
}

export function split_cli_list(value?: string): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Command runner (injectable for tests — never shell out in unit tests)
// ---------------------------------------------------------------------------

export interface CommandResult {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
}

export type AsyncCommandRunner = (
	command: string,
	args: string[],
) => Promise<CommandResult>;

export const default_async_runner: AsyncCommandRunner = (
	command,
	args,
) =>
	new Promise((resolve) => {
		const child = spawn(command, args, {
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				CI: '1',
				NO_COLOR: '1',
				FORCE_COLOR: '0',
				TERM: 'dumb',
			},
		});
		let stdout = '';
		let stderr = '';
		child.stdout?.setEncoding('utf-8');
		child.stderr?.setEncoding('utf-8');
		child.stdout?.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', (error) => {
			resolve({ status: null, stdout, stderr, error });
		});
		child.on('close', (status) => {
			resolve({ status, stdout, stderr });
		});
	});

function is_spawn_missing(result: CommandResult): boolean {
	return (
		result.status === null &&
		(result.error as NodeJS.ErrnoException | undefined)?.code ===
			'ENOENT'
	);
}

function failure(
	error: string,
	extra?: Partial<SkillsCliResult>,
): SkillsCliResult {
	return { success: false, error: redact_text(error), ...extra };
}

// ---------------------------------------------------------------------------
// gh availability / auth
// ---------------------------------------------------------------------------

export type GhReadiness =
	| { ok: true }
	| { ok: false; code: string; error: string };

export async function ensure_gh_skill_ready(
	runner: AsyncCommandRunner = default_async_runner,
): Promise<GhReadiness> {
	const version = await runner('gh', ['--version']);
	if (is_spawn_missing(version)) {
		return {
			ok: false,
			code: 'GH_NOT_FOUND',
			error:
				'GitHub CLI (gh) is required for skills management but was not found on PATH. ' +
				'Install it from https://cli.github.com/ and re-run the command.',
		};
	}
	if (version.status !== 0) {
		return {
			ok: false,
			code: 'GH_NOT_FOUND',
			error:
				'GitHub CLI (gh) could not be executed: ' +
				(version.stderr.trim() ||
					version.error?.message ||
					'unknown error'),
		};
	}

	const skill = await runner('gh', ['skill', '--help']);
	if (skill.status !== 0) {
		return {
			ok: false,
			code: 'GH_SKILL_UNAVAILABLE',
			error:
				'Your gh version does not provide the preview `gh skill` commands. ' +
				'Upgrade gh (https://cli.github.com/) and re-run the command.',
		};
	}

	const auth = await runner('gh', ['auth', 'status']);
	if (auth.status !== 0) {
		return {
			ok: false,
			code: 'GH_NOT_AUTHENTICATED',
			error:
				'gh is not authenticated. Run `gh auth login` (or set GH_TOKEN/GITHUB_TOKEN) and re-run the command.',
		};
	}

	return { ok: true };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

// Agents the `gh skill` backend supports (verified via `gh skill install --help`).
export const GH_SKILL_AGENTS = [
	'github-copilot',
	'claude-code',
	'cursor',
	'codex',
	'gemini-cli',
	'amp',
	'cline',
	'opencode',
	'pi',
	'universal',
	'warp',
] as const;

// Historical mcpick agent names that have no gh skill equivalent.
const UNSUPPORTED_AGENTS = ['windsurf'];

/**
 * Map an mcpick agent name to a gh skill --agent value.
 * '*' maps to 'universal' for installs (shared location) and to no filter
 * for lists — callers handle the list case by omitting --agent.
 */
export function normalize_agent(agent: string): string {
	const value = agent.trim().toLowerCase();
	if (value === '*') return 'universal';
	if (UNSUPPORTED_AGENTS.includes(value)) {
		throw new Error(
			`Agent '${value}' is not supported by the gh skill backend. ` +
				`Supported agents: ${GH_SKILL_AGENTS.join(', ')} (or * for universal).`,
		);
	}
	return value;
}

// ---------------------------------------------------------------------------
// Source normalization
// ---------------------------------------------------------------------------

export function is_github_repo_spec(value: string): boolean {
	return /^(?:https:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(
		value,
	);
}

export function normalize_github_repo_spec(value: string): string {
	return value
		.replace(/^https:\/\/github\.com\//, '')
		.replace(/\.git$/, '');
}

// ---------------------------------------------------------------------------
// Arg builders (verified against `gh skill <cmd> --help`, gh 2.97.0)
// ---------------------------------------------------------------------------

export type SkillScope = 'project' | 'user';

const LIST_JSON_FIELDS =
	'skillName,sourceURL,scope,version,pinned,path,agentHosts';

export function build_list_args(options: {
	agent?: string;
	scope?: SkillScope;
}): string[] {
	const args = ['skill', 'list', '--json', LIST_JSON_FIELDS];
	if (options.agent && options.agent !== '*') {
		args.push('--agent', normalize_agent(options.agent));
	}
	if (options.scope) args.push('--scope', options.scope);
	return args;
}

export function build_install_args(options: {
	source: string;
	skill?: string;
	all?: boolean;
	agent?: string;
	scope?: SkillScope;
	dir?: string;
	pin?: string;
	from_local?: boolean;
	allow_hidden_dirs?: boolean;
}): string[] {
	const args = ['skill', 'install', options.source];
	if (options.skill) args.push(options.skill);
	if (options.all) args.push('--all');
	if (options.dir) {
		args.push('--dir', options.dir);
	} else {
		if (options.agent) {
			args.push('--agent', normalize_agent(options.agent));
		}
		if (options.scope) args.push('--scope', options.scope);
	}
	if (options.pin) args.push('--pin', options.pin);
	if (options.from_local) args.push('--from-local');
	if (options.allow_hidden_dirs) args.push('--allow-hidden-dirs');
	return args;
}

export function build_update_args(options: {
	skills?: string[];
	all?: boolean;
	dry_run?: boolean;
	force?: boolean;
	unpin?: boolean;
}): string[] {
	const args = ['skill', 'update'];
	if (options.skills && options.skills.length > 0) {
		args.push(...options.skills);
	} else {
		// Non-interactive gh only applies updates without prompting when
		// --all is passed; mcpick update semantics are "update everything".
		args.push('--all');
	}
	if (options.dry_run) args.push('--dry-run');
	if (options.force) args.push('--force');
	if (options.unpin) args.push('--unpin');
	return args;
}

export function build_search_args(
	query: string,
	options: { limit?: number; owner?: string } = {},
): string[] {
	const args = [
		'skill',
		'search',
		query,
		'--json',
		'skillName,description,repo,path,stars,namespace',
		'--limit',
		String(options.limit ?? 15),
	];
	if (options.owner) args.push('--owner', options.owner);
	return args;
}

export function build_preview_args(
	source: string,
	skill?: string,
): string[] {
	const args = ['skill', 'preview', source];
	if (skill) args.push(skill);
	return args;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export interface GhInstalledSkill {
	skillName: string;
	sourceURL: string;
	scope: string;
	version: string;
	pinned: boolean;
	path: string;
	agentHosts: string[];
}

export function parse_gh_skill_list_json(
	output: string,
): GhInstalledSkill[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch (error) {
		const detail = error instanceof Error ? `: ${error.message}` : '';
		throw new Error(`Invalid gh skill list JSON${detail}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error('Invalid gh skill list JSON: expected an array');
	}
	return parsed.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const record = item as Record<string, unknown>;
		if (typeof record.skillName !== 'string') return [];
		return [
			{
				skillName: record.skillName,
				sourceURL:
					typeof record.sourceURL === 'string'
						? record.sourceURL
						: '',
				scope: typeof record.scope === 'string' ? record.scope : '',
				version:
					typeof record.version === 'string' ? record.version : '',
				pinned: record.pinned === true,
				path: typeof record.path === 'string' ? record.path : '',
				agentHosts: Array.isArray(record.agentHosts)
					? record.agentHosts.filter(
							(host): host is string => typeof host === 'string',
						)
					: [],
			},
		];
	});
}

export interface GhSkillSearchResult {
	skillName: string;
	description: string;
	repo: string;
	path: string;
	stars: number;
	namespace: string;
}

export function parse_gh_skill_search_json(
	output: string,
): GhSkillSearchResult[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch (error) {
		const detail = error instanceof Error ? `: ${error.message}` : '';
		throw new Error(`Invalid gh skill search JSON${detail}`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error(
			'Invalid gh skill search JSON: expected an array',
		);
	}
	return parsed.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const record = item as Record<string, unknown>;
		if (
			typeof record.skillName !== 'string' ||
			typeof record.repo !== 'string'
		) {
			return [];
		}
		return [
			{
				skillName: record.skillName,
				description:
					typeof record.description === 'string'
						? record.description
						: '',
				repo: record.repo,
				path: typeof record.path === 'string' ? record.path : '',
				stars: typeof record.stars === 'number' ? record.stars : 0,
				namespace:
					typeof record.namespace === 'string'
						? record.namespace
						: '',
			},
		];
	});
}

// ---------------------------------------------------------------------------
// Provenance (seed of the Phase-2 skills lockfile)
// ---------------------------------------------------------------------------

export interface SkillProvenanceEntry {
	name: string;
	source: string;
	ref?: string;
	agents: string[];
	scope: SkillScope;
	installed_at: string;
	validation?: {
		status: 'passed' | 'warnings' | 'errors' | 'skipped';
		errors: number;
		warnings: number;
	};
}

export function get_skills_provenance_path(): string {
	return join(get_mcpick_dir(), 'skills-provenance.json');
}

export async function read_skills_provenance(): Promise<
	SkillProvenanceEntry[]
> {
	try {
		const { readFile } = await import('node:fs/promises');
		const raw = await readFile(get_skills_provenance_path(), 'utf-8');
		const parsed = JSON.parse(raw) as { skills?: unknown };
		return Array.isArray(parsed.skills)
			? (parsed.skills as SkillProvenanceEntry[])
			: [];
	} catch {
		return [];
	}
}

export async function record_skills_provenance(
	entries: SkillProvenanceEntry[],
): Promise<void> {
	if (entries.length === 0) return;
	await ensure_directory_exists(get_mcpick_dir());
	await atomic_json_write(
		get_skills_provenance_path(),
		(existing) => {
			const current = Array.isArray(existing.skills)
				? (existing.skills as SkillProvenanceEntry[])
				: [];
			const by_key = new Map<string, SkillProvenanceEntry>();
			for (const entry of current) {
				by_key.set(provenance_key(entry), entry);
			}
			for (const entry of entries) {
				const key = provenance_key(entry);
				const prior = by_key.get(key);
				by_key.set(
					key,
					prior
						? {
								...entry,
								agents: [
									...new Set([...prior.agents, ...entry.agents]),
								].sort(),
							}
						: entry,
				);
			}
			return {
				skills: [...by_key.values()].sort((a, b) =>
					provenance_key(a).localeCompare(provenance_key(b)),
				),
			};
		},
	);
}

function provenance_key(entry: {
	scope: string;
	source: string;
	name: string;
}): string {
	return `${entry.scope}:${entry.source}:${entry.name}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// check-skills trust layer (optional runtime tool, never a dependency)
// ---------------------------------------------------------------------------

export interface SkillValidationSummary {
	status: 'passed' | 'warnings' | 'errors' | 'skipped';
	errors: number;
	warnings: number;
	details: string[];
}

interface CheckSkillsCounts {
	errors: number;
	warnings: number;
	details: string[];
}

function parse_check_skills_output(
	stdout: string,
	stderr: string,
	status: number | null,
): CheckSkillsCounts {
	const details: string[] = [];
	let errors = 0;
	let warnings = 0;

	if (stdout.trim()) {
		try {
			const parsed = JSON.parse(stdout) as Record<string, unknown>;
			const collect = (
				value: unknown,
				severity: 'error' | 'warning',
			) => {
				if (!Array.isArray(value)) return;
				for (const issue of value) {
					const message =
						typeof issue === 'string'
							? issue
							: issue &&
								  typeof issue === 'object' &&
								  'message' in issue &&
								  typeof issue.message === 'string'
								? issue.message
								: JSON.stringify(issue);
					details.push(`[${severity}] ${message}`);
					if (severity === 'error') errors += 1;
					else warnings += 1;
				}
			};
			collect(parsed.errors, 'error');
			collect(parsed.warnings, 'warning');
			if (Array.isArray(parsed.issues)) {
				for (const issue of parsed.issues) {
					if (!issue || typeof issue !== 'object') continue;
					const record = issue as Record<string, unknown>;
					const severity =
						typeof record.severity === 'string' &&
						record.severity.toLowerCase() === 'warning'
							? 'warning'
							: 'error';
					collect([issue], severity);
				}
			}
			if (errors === 0 && status !== 0) {
				errors = 1;
				details.push(
					'[error] check-skills reported failure without structured details',
				);
			}
			return { errors, warnings, details };
		} catch {
			// Non-JSON output — fall through to exit-code handling.
		}
	}

	if (status !== 0) {
		errors = 1;
		const raw = (stderr || stdout).trim();
		details.push(
			`[error] ${raw ? raw.slice(0, 500) : 'check-skills exited non-zero'}`,
		);
	}
	return { errors, warnings, details };
}

export async function validate_skill_directory(
	skill_dir: string,
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillValidationSummary> {
	const result = await runner('pnpx', [
		'check-skills',
		'validate',
		skill_dir,
		'--json',
	]);

	if (is_spawn_missing(result)) {
		return {
			status: 'skipped',
			errors: 0,
			warnings: 0,
			details: [
				'check-skills is not available (pnpx not found); install validation was skipped. ' +
					'Install Node.js with pnpm to enable pre-install validation.',
			],
		};
	}

	const { errors, warnings, details } = parse_check_skills_output(
		result.stdout,
		result.stderr,
		result.status,
	);
	return {
		status:
			errors > 0 ? 'errors' : warnings > 0 ? 'warnings' : 'passed',
		errors,
		warnings,
		details: details.map((detail) => redact_text(detail)),
	};
}

async function find_skill_dirs(root: string): Promise<string[]> {
	const found: string[] = [];
	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > 4) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isFile() && entry.name === 'SKILL.md') {
				found.push(dir);
				return;
			}
			if (
				entry.isDirectory() &&
				!entry.name.startsWith('.') &&
				entry.name !== 'node_modules'
			) {
				await walk(full, depth + 1);
			}
		}
	}
	await walk(root, 0);
	return found;
}

// ---------------------------------------------------------------------------
// High-level operations
// ---------------------------------------------------------------------------

async function run_gh(
	args: string[],
	runner: AsyncCommandRunner,
	fallback: string,
): Promise<
	| { ok: true; stdout: string; stderr: string }
	| { ok: false; result: SkillsCliResult }
> {
	const result = await runner('gh', args);
	if (is_spawn_missing(result)) {
		return {
			ok: false,
			result: failure(
				'GitHub CLI (gh) was not found on PATH. Install it from https://cli.github.com/ and re-run the command.',
				{ data: { code: 'GH_NOT_FOUND' } },
			),
		};
	}
	const stdout = redact_text(result.stdout.trim());
	const stderr = redact_text(result.stderr.trim());
	if (result.status !== 0) {
		return {
			ok: false,
			result: {
				success: false,
				stdout: stdout || undefined,
				stderr: stderr || undefined,
				error: stderr || fallback,
			},
		};
	}
	return { ok: true, stdout, stderr };
}

export async function list_skills(
	options: { agent?: string; scope?: SkillScope },
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	let args: string[];
	try {
		args = build_list_args(options);
	} catch (error) {
		return failure((error as Error).message);
	}

	const listed = await run_gh(args, runner, 'gh skill list failed');
	if (!listed.ok) return listed.result;

	let skills: GhInstalledSkill[];
	try {
		skills = parse_gh_skill_list_json(listed.stdout);
	} catch (error) {
		return failure((error as Error).message);
	}

	const provenance = await read_skills_provenance();
	const provenance_by_key = new Map(
		provenance.map((entry) => [provenance_key(entry), entry]),
	);
	const merged = skills.map((skill) => {
		const key =
			`${skill.scope}:${github_repository_from_source_url(skill.sourceURL) ?? skill.sourceURL}:${skill.skillName}`.toLowerCase();
		const match = provenance_by_key.get(key);
		return match
			? {
					...skill,
					provenance: {
						source: match.source,
						ref: match.ref,
						installed_at: match.installed_at,
						validation: match.validation,
					},
				}
			: skill;
	});

	const lines = merged.map((skill) => {
		const parts = [
			skill.skillName,
			`scope=${skill.scope || 'unknown'}`,
		];
		if (skill.agentHosts.length > 0) {
			parts.push(`agents=${skill.agentHosts.join(',')}`);
		}
		if (skill.version) parts.push(`version=${skill.version}`);
		if (skill.pinned) parts.push('pinned');
		if (skill.sourceURL) parts.push(`source=${skill.sourceURL}`);
		return parts.join('  ');
	});

	return {
		success: true,
		stdout:
			lines.join('\n') ||
			'No skills found. Install one with: mcpick skills add <owner/repo> --skill <name>',
		data: { skills: merged },
	};
}

function github_repository_from_source_url(
	source_url: string,
): string | null {
	const value = source_url.trim();
	if (!value) return null;
	if (is_github_repo_spec(value)) {
		return normalize_github_repo_spec(value);
	}
	try {
		const url = new URL(value);
		if (url.hostname.toLowerCase() !== 'github.com') return null;
		const parts = url.pathname.split('/').filter(Boolean);
		if (parts.length < 2) return null;
		return normalize_github_repo_spec(`${parts[0]}/${parts[1]}`);
	} catch {
		return null;
	}
}

export interface SkillInstallRequest {
	source: string;
	skills: string[];
	all?: boolean;
	agents: string[];
	scope: SkillScope;
	pin?: string;
	from_local?: boolean;
	allow_hidden_dirs?: boolean;
	/** Programmatic acknowledgement of validation errors (--yes). */
	yes: boolean;
	/** TTY confirmation callback, invoked only when validation reports errors. */
	confirm?: (validation: SkillValidationSummary) => Promise<boolean>;
}

export async function install_skills(
	request: SkillInstallRequest,
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const warnings: string[] = [];

	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	// Normalize source: GitHub repo spec or an explicit local directory.
	let source = request.source.trim();
	let from_local = request.from_local === true;
	if (!from_local) {
		if (is_github_repo_spec(source)) {
			source = normalize_github_repo_spec(source);
		} else {
			try {
				const source_stat = await stat(source);
				if (source_stat.isDirectory()) {
					from_local = true;
				} else {
					return failure(
						`Unsupported skill source '${request.source}'. The gh skill backend installs from GitHub repos (owner/repo) or local directories.`,
					);
				}
			} catch {
				return failure(
					`Unsupported skill source '${request.source}'. The gh skill backend installs from GitHub repos (owner/repo) or local directories. npm package sources are no longer supported.`,
				);
			}
		}
	}

	let agents: string[];
	try {
		agents = request.agents.map((agent) => normalize_agent(agent));
	} catch (error) {
		return failure((error as Error).message);
	}

	const skill_names = request.skills;
	if (!request.all && skill_names.length === 0) {
		return failure(
			'Pass a skill name, comma-separated skill names, or use --all.',
		);
	}

	// --- Stage: download into a temp dir and validate before installing ---
	const staging_dir = await mkdtemp(join(tmpdir(), 'mcpick-skills-'));
	try {
		const stage_targets = request.all
			? [{ skill: undefined, all: true }]
			: skill_names.map((skill) => ({
					skill,
					all: false,
				}));
		for (const target of stage_targets) {
			const staged = await run_gh(
				build_install_args({
					source,
					skill: target.skill,
					all: target.all,
					dir: staging_dir,
					pin: request.pin,
					from_local,
					allow_hidden_dirs: request.allow_hidden_dirs,
				}),
				runner,
				'gh skill install (staging) failed',
			);
			if (!staged.ok) return staged.result;
		}

		// --- Validate staged skills with check-skills (optional tool) ---
		const skill_dirs = await find_skill_dirs(staging_dir);
		const aggregate: SkillValidationSummary = {
			status: 'passed',
			errors: 0,
			warnings: 0,
			details: [],
		};
		let validation_available = true;
		for (const dir of skill_dirs) {
			const summary = await validate_skill_directory(dir, runner);
			if (summary.status === 'skipped') {
				validation_available = false;
				warnings.push(...summary.details);
				continue;
			}
			aggregate.errors += summary.errors;
			aggregate.warnings += summary.warnings;
			aggregate.details.push(...summary.details);
		}
		if (skill_dirs.length === 0) {
			validation_available = false;
			warnings.push(
				'No SKILL.md found in staged download; check-skills validation was skipped.',
			);
		}
		if (!validation_available) {
			aggregate.status = 'skipped';
		} else if (aggregate.errors > 0) {
			aggregate.status = 'errors';
		} else if (aggregate.warnings > 0) {
			aggregate.status = 'warnings';
		}

		// --- Gate on validation errors ---
		if (aggregate.status === 'errors' && !request.yes) {
			const confirmed = request.confirm
				? await request.confirm(aggregate)
				: false;
			if (!confirmed) {
				return {
					success: false,
					error:
						'Skill validation reported errors and the install was aborted before anything was written to agent directories. ' +
						'Re-run with --yes to acknowledge and install anyway.',
					warnings,
					data: { validation: aggregate },
				};
			}
		}
		if (aggregate.status === 'errors') {
			warnings.push(
				'check-skills reported validation errors; install acknowledged and continuing.',
			);
		}
		if (aggregate.status === 'warnings') {
			warnings.push(
				...aggregate.details.map(
					(detail) => `check-skills: ${detail}`,
				),
			);
		}

		// --- Real install into agent directories ---
		const install_targets = request.all
			? [{ skill: undefined, all: true }]
			: skill_names.map((skill) => ({
					skill,
					all: false,
				}));
		const agent_targets = agents.length > 0 ? agents : [undefined];
		const installed: Array<{
			skill?: string;
			agent?: string;
		}> = [];
		for (const agent of agent_targets) {
			for (const target of install_targets) {
				const installed_result = await run_gh(
					build_install_args({
						source,
						skill: target.skill,
						all: target.all,
						agent,
						scope: request.scope,
						pin: request.pin,
						from_local,
						allow_hidden_dirs: request.allow_hidden_dirs,
					}),
					runner,
					'gh skill install failed',
				);
				if (!installed_result.ok) {
					return {
						...installed_result.result,
						warnings,
					};
				}
				installed.push({
					skill: target.skill,
					agent,
				});
			}
		}

		// --- Provenance ---
		const now = new Date().toISOString();
		const names = request.all
			? await resolve_staged_skill_names(staging_dir)
			: skill_names.map((name) => name.replace(/@.*$/, ''));
		const provenance_source = from_local
			? source
			: normalize_github_repo_spec(source);
		await record_skills_provenance(
			names.map((name) => ({
				name,
				source: provenance_source,
				ref: request.pin ?? pinned_ref_from_names(skill_names),
				agents: agent_targets.map(
					(agent) => agent ?? 'github-copilot',
				),
				scope: request.scope,
				installed_at: now,
				validation: {
					status: aggregate.status,
					errors: aggregate.errors,
					warnings: aggregate.warnings,
				},
			})),
		);

		const summary_lines = installed.map((entry) => {
			const what = entry.skill ?? 'all skills';
			const where = entry.agent
				? `for ${entry.agent}`
				: 'with gh default agent';
			return `Installed ${what} ${where} (${request.scope} scope)`;
		});
		summary_lines.push(
			`Validation: ${aggregate.status}` +
				(aggregate.errors > 0
					? ` (${aggregate.errors} errors, ${aggregate.warnings} warnings)`
					: aggregate.warnings > 0
						? ` (${aggregate.warnings} warnings)`
						: ''),
		);

		return {
			success: true,
			stdout: summary_lines.join('\n'),
			warnings: warnings.length > 0 ? warnings : undefined,
			data: {
				installed,
				validation: aggregate,
				source: provenance_source,
				scope: request.scope,
			},
		};
	} finally {
		await rm(staging_dir, { recursive: true, force: true });
	}
}

async function resolve_staged_skill_names(
	staging_dir: string,
): Promise<string[]> {
	const dirs = await find_skill_dirs(staging_dir);
	return dirs.map((dir) => dir.split('/').pop() ?? dir);
}

function pinned_ref_from_names(skills: string[]): string | undefined {
	for (const skill of skills) {
		const at = skill.indexOf('@');
		if (at > 0) return skill.slice(at + 1);
	}
	return undefined;
}

export async function update_skills(
	options: {
		skills?: string[];
		dry_run?: boolean;
		force?: boolean;
		unpin?: boolean;
	},
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	const updated = await run_gh(
		build_update_args(options),
		runner,
		'gh skill update failed',
	);
	if (!updated.ok) return updated.result;

	return {
		success: true,
		stdout: updated.stdout || 'Skills are up to date.',
		data: { stdout: updated.stdout },
	};
}

export async function search_skills(
	query: string,
	options: { limit?: number; owner?: string } = {},
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	const found = await run_gh(
		build_search_args(query, options),
		runner,
		'gh skill search failed',
	);
	if (!found.ok) return found.result;

	let results: GhSkillSearchResult[];
	try {
		results = parse_gh_skill_search_json(found.stdout);
	} catch (error) {
		return failure((error as Error).message);
	}

	const lines = results.map(
		(result) =>
			`${result.repo}  ${result.skillName}  ★${result.stars}  ${result.description}`,
	);
	return {
		success: true,
		stdout: lines.join('\n') || 'No skills found.',
		data: { results },
	};
}

export async function preview_skill(
	source: string,
	skill?: string,
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	if (!is_github_repo_spec(source)) {
		return failure(
			`preview requires a GitHub repo (owner/repo); got '${source}'.`,
		);
	}

	const previewed = await run_gh(
		build_preview_args(normalize_github_repo_spec(source), skill),
		runner,
		'gh skill preview failed',
	);
	if (!previewed.ok) return previewed.result;

	return {
		success: true,
		stdout: previewed.stdout,
		data: { stdout: previewed.stdout },
	};
}

/**
 * List skills available in a source repo without installing.
 * Non-interactive `gh skill install <repo>` (no skill, no --all) prints the
 * available skills so they can be browsed/filtered.
 */
export async function list_available_skills(
	source: string,
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	if (!is_github_repo_spec(source)) {
		return failure(
			`Listing available skills requires a GitHub repo (owner/repo); got '${source}'.`,
		);
	}

	const listed = await run_gh(
		build_install_args({
			source: normalize_github_repo_spec(source),
		}),
		runner,
		'gh skill install (list available) failed',
	);
	if (!listed.ok) return listed.result;

	return {
		success: true,
		stdout: listed.stdout || 'No skills found in source.',
		data: { stdout: listed.stdout },
	};
}

/**
 * Removal is not supported by the gh skill backend (preview): gh ships
 * list/search/preview/install/update/publish but no uninstall. Report the
 * installed locations so the caller can act manually.
 */
export async function remove_skills(
	options: { skills?: string[]; agent?: string; scope?: SkillScope },
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillsCliResult> {
	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return failure(ready.error, { data: { code: ready.code } });
	}

	const listed = await run_gh(
		build_list_args({
			agent: options.agent,
			scope: options.scope,
		}),
		runner,
		'gh skill list failed',
	);
	const wanted = new Set(
		(options.skills ?? []).map((name) => name.toLowerCase()),
	);
	let paths: string[] = [];
	if (listed.ok) {
		try {
			paths = parse_gh_skill_list_json(listed.stdout)
				.filter(
					(skill) =>
						wanted.size === 0 ||
						wanted.has(skill.skillName.toLowerCase()),
				)
				.map((skill) => skill.path)
				.filter(Boolean);
		} catch {
			paths = [];
		}
	}

	const hint =
		paths.length > 0
			? `Installed locations you can delete manually:\n${paths.map((path) => `  ${path}`).join('\n')}`
			: 'Use `mcpick skills list` to find install locations, then delete the skill directories manually.';
	return failure(
		`Removing skills is not supported by the gh skill backend (preview has no uninstall command). ${hint}`,
		{
			data: {
				code: 'REMOVE_UNSUPPORTED',
				paths,
			},
		},
	);
}

// ---------------------------------------------------------------------------
// Skill drift detection (compares recorded provenance refs against upstream)
// ---------------------------------------------------------------------------

export interface SkillDriftFinding {
	entry: SkillProvenanceEntry;
	kind: 'drifted' | 'unresolved' | 'unpinned';
	/** Current upstream version, when the skill still resolves. */
	current?: string;
	/** Installed path reported by gh, when known. */
	installed_path?: string;
}

export type SkillDriftResult = {
	/**
	 * 'checked' means the upstream comparison ran (or there was nothing
	 * pinned to compare). 'skipped' means gh/the network was unavailable;
	 * local-only findings (unpinned) are still reported.
	 */
	status: 'checked' | 'skipped';
	/** Why the upstream comparison was skipped (only when status is 'skipped'). */
	reason?: string;
	findings: SkillDriftFinding[];
};

/**
 * Compare recorded skill provenance against what gh currently resolves.
 * Never throws and never touches the network when there is no pinned
 * provenance to compare: offline hosts get a 'skipped' status instead.
 */
export async function check_skill_drift(
	runner: AsyncCommandRunner = default_async_runner,
): Promise<SkillDriftResult> {
	const provenance = await read_skills_provenance();
	if (provenance.length === 0) {
		return { status: 'checked', findings: [] };
	}

	// Local-only finding: no ref recorded at install time.
	const findings: SkillDriftFinding[] = provenance
		.filter((entry) => !entry.ref)
		.map((entry) => ({ entry, kind: 'unpinned' as const }));

	const pinned = provenance.filter((entry) => !!entry.ref);
	if (pinned.length === 0) {
		return { status: 'checked', findings };
	}

	const ready = await ensure_gh_skill_ready(runner);
	if (!ready.ok) {
		return { status: 'skipped', reason: ready.error, findings };
	}

	const listed = await runner('gh', build_list_args({}));
	if (listed.status !== 0) {
		const reason =
			listed.stderr.trim() ||
			listed.error?.message ||
			'gh skill list failed';
		return { status: 'skipped', reason, findings };
	}

	let installed: GhInstalledSkill[];
	try {
		installed = parse_gh_skill_list_json(listed.stdout);
	} catch (error) {
		return {
			status: 'skipped',
			reason: (error as Error).message,
			findings,
		};
	}

	for (const entry of pinned) {
		const match = installed.find(
			(skill) =>
				skill.skillName.toLowerCase() === entry.name.toLowerCase() &&
				(
					github_repository_from_source_url(skill.sourceURL) ??
					skill.sourceURL
				).toLowerCase() === entry.source.toLowerCase() &&
				(!skill.scope || skill.scope === entry.scope),
		);
		if (!match) {
			findings.push({ entry, kind: 'unresolved' });
			continue;
		}
		if (match.version && match.version !== entry.ref) {
			findings.push({
				entry,
				kind: 'drifted',
				current: match.version,
				installed_path: match.path,
			});
		}
	}

	return { status: 'checked', findings };
}
