import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import type {
	AsyncCommandRunner,
	CommandResult,
} from './skills-cli.js';
import {
	build_install_args,
	build_list_args,
	build_preview_args,
	build_search_args,
	build_update_args,
	check_skill_drift,
	ensure_gh_skill_ready,
	get_skills_provenance_path,
	install_skills,
	list_skills,
	normalize_agent,
	parse_gh_skill_list_json,
	remove_skills,
	split_cli_list,
	update_skills,
} from './skills-cli.js';

function ok(stdout = ''): CommandResult {
	return { status: 0, stdout, stderr: '' };
}

function fail(stderr = 'boom', status = 1): CommandResult {
	return { status, stdout: '', stderr };
}

function enoent(): CommandResult {
	const error = new Error('spawn gh ENOENT') as NodeJS.ErrnoException;
	error.code = 'ENOENT';
	return { status: null, stdout: '', stderr: '', error };
}

interface RecordedCall {
	command: string;
	args: string[];
}

function make_runner(
	handler: (
		command: string,
		args: string[],
	) => CommandResult | undefined,
): { runner: AsyncCommandRunner; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	const runner: AsyncCommandRunner = async (command, args) => {
		calls.push({ command, args: [...args] });
		return handler(command, args) ?? ok();
	};
	return { runner, calls };
}

/** Runner that is a healthy, authenticated gh with gh skill support. */
function healthy_gh(
	extra?: (
		command: string,
		args: string[],
	) => CommandResult | undefined,
) {
	return make_runner((command, args) => {
		const handled = extra?.(command, args);
		if (handled) return handled;
		if (
			command === 'gh' &&
			args[0] === 'skill' &&
			args[1] === 'list'
		) {
			return ok('[]');
		}
		return ok();
	});
}

describe('split_cli_list', () => {
	it('splits comma-separated values and trims', () => {
		expect(split_cli_list('a, b ,,c')).toEqual(['a', 'b', 'c']);
	});

	it('handles undefined and empty input', () => {
		expect(split_cli_list(undefined)).toEqual([]);
		expect(split_cli_list('')).toEqual([]);
	});
});

describe('normalize_agent', () => {
	it('maps * to universal for installs', () => {
		expect(normalize_agent('*')).toBe('universal');
	});

	it('passes through supported agents', () => {
		expect(normalize_agent('claude-code')).toBe('claude-code');
		expect(normalize_agent('PI')).toBe('pi');
	});

	it('rejects agents gh skill does not support', () => {
		expect(() => normalize_agent('windsurf')).toThrow(
			/not supported by the gh skill backend/,
		);
	});
});

describe('arg builders', () => {
	it('build_list_args includes json fields, agent and scope', () => {
		expect(build_list_args({ agent: 'pi', scope: 'user' })).toEqual([
			'skill',
			'list',
			'--json',
			'skillName,sourceURL,scope,version,pinned,path,agentHosts',
			'--agent',
			'pi',
			'--scope',
			'user',
		]);
	});

	it('build_list_args omits --agent for *', () => {
		const args = build_list_args({ agent: '*' });
		expect(args).not.toContain('--agent');
	});

	it('build_install_args pins and scopes', () => {
		expect(
			build_install_args({
				source: 'owner/repo',
				skill: 'git-commit',
				agent: 'pi',
				scope: 'user',
				pin: 'v1.2.0',
			}),
		).toEqual([
			'skill',
			'install',
			'owner/repo',
			'git-commit',
			'--agent',
			'pi',
			'--scope',
			'user',
			'--pin',
			'v1.2.0',
		]);
	});

	it('build_install_args with --dir omits agent and scope', () => {
		const args = build_install_args({
			source: 'owner/repo',
			skill: 'x',
			dir: '/tmp/staging',
			agent: 'pi',
			scope: 'project',
		});
		expect(args).toContain('--dir');
		expect(args).not.toContain('--agent');
		expect(args).not.toContain('--scope');
	});

	it('build_install_args supports --all and --from-local', () => {
		expect(
			build_install_args({
				source: './local',
				all: true,
				dir: '/tmp/s',
				from_local: true,
			}),
		).toEqual([
			'skill',
			'install',
			'./local',
			'--all',
			'--dir',
			'/tmp/s',
			'--from-local',
		]);
	});

	it('build_update_args defaults to --all without skills', () => {
		expect(build_update_args({})).toEqual([
			'skill',
			'update',
			'--all',
		]);
	});

	it('build_update_args passes named skills and flags', () => {
		expect(
			build_update_args({
				skills: ['a', 'b'],
				dry_run: true,
				force: true,
				unpin: true,
			}),
		).toEqual([
			'skill',
			'update',
			'a',
			'b',
			'--dry-run',
			'--force',
			'--unpin',
		]);
	});

	it('build_search_args includes json fields, limit and owner', () => {
		expect(
			build_search_args('svelte', { limit: 5, owner: 'spences10' }),
		).toEqual([
			'skill',
			'search',
			'svelte',
			'--json',
			'skillName,description,repo,path,stars,namespace',
			'--limit',
			'5',
			'--owner',
			'spences10',
		]);
	});

	it('build_preview_args builds repo and optional skill', () => {
		expect(build_preview_args('owner/repo', 'a')).toEqual([
			'skill',
			'preview',
			'owner/repo',
			'a',
		]);
		expect(build_preview_args('owner/repo')).toEqual([
			'skill',
			'preview',
			'owner/repo',
		]);
	});
});

describe('parse_gh_skill_list_json', () => {
	it('parses a valid list', () => {
		const skills = parse_gh_skill_list_json(
			JSON.stringify([
				{
					skillName: 'git-commit',
					sourceURL: 'https://github.com/owner/repo',
					scope: 'user',
					version: 'v1.0.0',
					pinned: true,
					path: '/home/u/.agents/skills/git-commit',
					agentHosts: ['pi'],
				},
			]),
		);
		expect(skills).toHaveLength(1);
		expect(skills[0].skillName).toBe('git-commit');
		expect(skills[0].pinned).toBe(true);
	});

	it('throws on invalid JSON', () => {
		expect(() => parse_gh_skill_list_json('not json')).toThrow(
			/Invalid gh skill list JSON/,
		);
	});

	it('throws on non-array JSON', () => {
		expect(() => parse_gh_skill_list_json('{}')).toThrow(
			/expected an array/,
		);
	});

	it('drops malformed entries and defaults missing fields', () => {
		const skills = parse_gh_skill_list_json(
			JSON.stringify([{ nope: true }, { skillName: 'x' }]),
		);
		expect(skills).toHaveLength(1);
		expect(skills[0].agentHosts).toEqual([]);
	});
});

describe('ensure_gh_skill_ready', () => {
	it('reports GH_NOT_FOUND when gh is missing', async () => {
		const { runner } = make_runner(() => enoent());
		const ready = await ensure_gh_skill_ready(runner);
		expect(ready.ok).toBe(false);
		if (!ready.ok) {
			expect(ready.code).toBe('GH_NOT_FOUND');
			expect(ready.error).toContain('cli.github.com');
		}
	});

	it('reports GH_SKILL_UNAVAILABLE when gh lacks skill commands', async () => {
		const { runner } = make_runner((command, args) => {
			if (command === 'gh' && args[0] === 'skill') {
				return fail('unknown command "skill"');
			}
			return ok();
		});
		const ready = await ensure_gh_skill_ready(runner);
		expect(ready.ok).toBe(false);
		if (!ready.ok) expect(ready.code).toBe('GH_SKILL_UNAVAILABLE');
	});

	it('reports GH_NOT_AUTHENTICATED when gh auth status fails', async () => {
		const { runner } = make_runner((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'auth' &&
				args[1] === 'status'
			) {
				return fail('not logged in');
			}
			return ok();
		});
		const ready = await ensure_gh_skill_ready(runner);
		expect(ready.ok).toBe(false);
		if (!ready.ok) {
			expect(ready.code).toBe('GH_NOT_AUTHENTICATED');
			expect(ready.error).toContain('gh auth login');
		}
	});

	it('returns ok for a healthy authenticated gh', async () => {
		const { runner } = healthy_gh();
		expect(await ensure_gh_skill_ready(runner)).toEqual({
			ok: true,
		});
	});
});

describe('install_skills', () => {
	let state_dir: string;

	beforeEach(async () => {
		state_dir = await mkdtemp(join(tmpdir(), 'mcpick-test-state-'));
		vi.stubEnv('CLAUDE_CONFIG_DIR', state_dir);
		vi.stubEnv('MCPICK_CONFIG_DIR', join(state_dir, 'mcpick'));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(state_dir, { recursive: true, force: true });
	});

	it('fails with actionable error when gh is missing', async () => {
		const { runner } = make_runner(() => enoent());
		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['a'],
				agents: ['pi'],
				scope: 'project',
				yes: false,
			},
			runner,
		);
		expect(result.success).toBe(false);
		expect(result.data).toMatchObject({ code: 'GH_NOT_FOUND' });
	});

	it('rejects unsupported agents before any gh call', async () => {
		const { runner, calls } = healthy_gh();
		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['a'],
				agents: ['windsurf'],
				scope: 'project',
				yes: false,
			},
			runner,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain('windsurf');
		expect(
			calls.filter((call) => call.args[1] === 'install'),
		).toHaveLength(0);
	});

	it('rejects npm-style sources', async () => {
		const { runner } = healthy_gh();
		const result = await install_skills(
			{
				source: '@scope/pkg',
				skills: ['a'],
				agents: ['pi'],
				scope: 'project',
				yes: false,
			},
			runner,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain('no longer supported');
	});

	it('stages, validates, installs and records provenance', async () => {
		const calls: RecordedCall[] = [];
		const runner: AsyncCommandRunner = async (command, args) => {
			calls.push({ command, args: [...args] });
			if (command === 'pnpx') {
				return ok('{"errors":[],"warnings":[]}');
			}
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'install'
			) {
				const dir_index = args.indexOf('--dir');
				if (dir_index !== -1) {
					const dir = join(args[dir_index + 1], 'my-skill');
					await mkdir(dir, { recursive: true });
					await writeFile(
						join(dir, 'SKILL.md'),
						'---\nname: my-skill\n---\n',
					);
					return ok('staged');
				}
				return ok('installed');
			}
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'list'
			) {
				return ok('[]');
			}
			return ok();
		};

		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['my-skill'],
				agents: ['pi'],
				scope: 'project',
				pin: 'v2.0.0',
				yes: false,
			},
			runner,
		);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			source: 'owner/repo',
			scope: 'project',
			validation: { status: 'passed' },
		});

		// Staging install used --dir, real install used --agent/--scope.
		const installs = calls.filter(
			(call) =>
				call.command === 'gh' &&
				call.args[0] === 'skill' &&
				call.args[1] === 'install',
		);
		expect(installs).toHaveLength(2);
		expect(installs[0].args).toContain('--dir');
		expect(installs[1].args).toEqual(
			expect.arrayContaining([
				'--agent',
				'pi',
				'--scope',
				'project',
				'--pin',
				'v2.0.0',
			]),
		);

		// check-skills ran against the staged directory.
		const validations = calls.filter(
			(call) => call.command === 'pnpx',
		);
		expect(validations).toHaveLength(1);
		expect(validations[0].args.slice(0, 2)).toEqual([
			'check-skills',
			'validate',
		]);
		expect(validations[0].args).toContain('--json');

		// Provenance recorded.
		const provenance = JSON.parse(
			await readFile(get_skills_provenance_path(), 'utf-8'),
		);
		expect(provenance.skills).toHaveLength(1);
		expect(provenance.skills[0]).toMatchObject({
			name: 'my-skill',
			source: 'owner/repo',
			ref: 'v2.0.0',
			agents: ['pi'],
			scope: 'project',
			validation: { status: 'passed', errors: 0, warnings: 0 },
		});
		expect(provenance.skills[0].installed_at).toBeTruthy();
	});

	it('warns and continues when check-skills is unavailable', async () => {
		const runner: AsyncCommandRunner = async (command, args) => {
			if (command === 'pnpx') return enoent();
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'install'
			) {
				const dir_index = args.indexOf('--dir');
				if (dir_index !== -1) {
					const dir = join(args[dir_index + 1], 's');
					await mkdir(dir, { recursive: true });
					await writeFile(join(dir, 'SKILL.md'), 'x');
				}
				return ok('ok');
			}
			return ok();
		};

		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['s'],
				agents: [],
				scope: 'project',
				yes: false,
			},
			runner,
		);
		expect(result.success).toBe(true);
		expect(result.warnings?.join(' ')).toContain(
			'check-skills is not available',
		);
	});

	it('aborts before installing when validation errors are unacknowledged', async () => {
		const calls: RecordedCall[] = [];
		const runner: AsyncCommandRunner = async (command, args) => {
			calls.push({ command, args: [...args] });
			if (command === 'pnpx') {
				return {
					status: 1,
					stdout:
						'{"errors":[{"message":"dynamic context execution detected"}]}',
					stderr: '',
				};
			}
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'install'
			) {
				const dir_index = args.indexOf('--dir');
				if (dir_index !== -1) {
					const dir = join(args[dir_index + 1], 'evil');
					await mkdir(dir, { recursive: true });
					await writeFile(join(dir, 'SKILL.md'), 'x');
				}
				return ok('ok');
			}
			return ok();
		};

		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['evil'],
				agents: ['pi'],
				scope: 'project',
				yes: false,
			},
			runner,
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('aborted');
		expect(result.data).toMatchObject({
			validation: { status: 'errors', errors: 1 },
		});
		// Only the staging install ran — nothing hit agent dirs.
		const real_installs = calls.filter(
			(call) =>
				call.command === 'gh' &&
				call.args[1] === 'install' &&
				!call.args.includes('--dir'),
		);
		expect(real_installs).toHaveLength(0);
	});

	it('proceeds past validation errors with --yes', async () => {
		const runner: AsyncCommandRunner = async (command, args) => {
			if (command === 'pnpx') {
				return {
					status: 1,
					stdout: '{"errors":["bad thing"]}',
					stderr: '',
				};
			}
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'install'
			) {
				const dir_index = args.indexOf('--dir');
				if (dir_index !== -1) {
					const dir = join(args[dir_index + 1], 's');
					await mkdir(dir, { recursive: true });
					await writeFile(join(dir, 'SKILL.md'), 'x');
				}
				return ok('ok');
			}
			return ok();
		};

		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['s'],
				agents: ['pi'],
				scope: 'project',
				yes: true,
			},
			runner,
		);
		expect(result.success).toBe(true);
		expect(result.warnings?.join(' ')).toContain('acknowledged');
	});

	it('uses the confirm callback in TTY mode when validation errors', async () => {
		const runner: AsyncCommandRunner = async (command, args) => {
			if (command === 'pnpx') {
				return {
					status: 1,
					stdout: '{"errors":["bad"]}',
					stderr: '',
				};
			}
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'install'
			) {
				const dir_index = args.indexOf('--dir');
				if (dir_index !== -1) {
					const dir = join(args[dir_index + 1], 's');
					await mkdir(dir, { recursive: true });
					await writeFile(join(dir, 'SKILL.md'), 'x');
				}
				return ok('ok');
			}
			return ok();
		};

		const result = await install_skills(
			{
				source: 'owner/repo',
				skills: ['s'],
				agents: ['pi'],
				scope: 'project',
				yes: false,
				confirm: async () => true,
			},
			runner,
		);
		expect(result.success).toBe(true);
	});
});

describe('list_skills', () => {
	let state_dir: string;

	beforeEach(async () => {
		state_dir = await mkdtemp(join(tmpdir(), 'mcpick-test-state-'));
		vi.stubEnv('CLAUDE_CONFIG_DIR', state_dir);
		vi.stubEnv('MCPICK_CONFIG_DIR', join(state_dir, 'mcpick'));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(state_dir, { recursive: true, force: true });
	});

	it('merges mcpick provenance into gh list output', async () => {
		await mkdir(join(state_dir, 'mcpick'), { recursive: true });
		await writeFile(
			get_skills_provenance_path(),
			JSON.stringify({
				skills: [
					{
						name: 'git-commit',
						source: 'owner/repo',
						ref: 'v1.0.0',
						agents: ['pi'],
						scope: 'user',
						installed_at: '2026-08-06T00:00:00.000Z',
						validation: {
							status: 'passed',
							errors: 0,
							warnings: 0,
						},
					},
				],
			}),
		);

		const { runner } = healthy_gh((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'list'
			) {
				return ok(
					JSON.stringify([
						{
							skillName: 'git-commit',
							sourceURL: 'https://github.com/owner/repo',
							scope: 'user',
							version: 'v1.0.0',
							pinned: true,
							path: '/x/git-commit',
							agentHosts: ['pi'],
						},
					]),
				);
			}
			return undefined;
		});

		const result = await list_skills({}, runner);
		expect(result.success).toBe(true);
		const data = result.data as {
			skills: Array<{
				skillName: string;
				provenance?: { ref?: string };
			}>;
		};
		expect(data.skills[0].provenance?.ref).toBe('v1.0.0');
	});

	it('returns a machine-readable error on invalid JSON', async () => {
		const { runner } = healthy_gh((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'list'
			) {
				return ok('not json at all');
			}
			return undefined;
		});
		const result = await list_skills({}, runner);
		expect(result.success).toBe(false);
		expect(result.error).toContain('Invalid gh skill list JSON');
	});
});

describe('update_skills', () => {
	it('runs gh skill update --all by default', async () => {
		const { runner, calls } = healthy_gh((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'update'
			) {
				return ok('updated 2 skills');
			}
			return undefined;
		});
		const result = await update_skills({}, runner);
		expect(result.success).toBe(true);
		expect(result.stdout).toBe('updated 2 skills');
		const update = calls.find((call) => call.args[1] === 'update');
		expect(update?.args).toContain('--all');
	});

	it('surfaces gh failures', async () => {
		const { runner } = healthy_gh((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'update'
			) {
				return fail('network down');
			}
			return undefined;
		});
		const result = await update_skills({}, runner);
		expect(result.success).toBe(false);
		expect(result.error).toContain('network down');
	});
});

describe('remove_skills', () => {
	it('reports removal as unsupported with manual locations', async () => {
		const { runner } = healthy_gh((command, args) => {
			if (
				command === 'gh' &&
				args[0] === 'skill' &&
				args[1] === 'list'
			) {
				return ok(
					JSON.stringify([
						{
							skillName: 'git-commit',
							sourceURL: '',
							scope: 'user',
							version: '',
							pinned: false,
							path: '/home/u/.agents/skills/git-commit',
							agentHosts: [],
						},
					]),
				);
			}
			return undefined;
		});
		const result = await remove_skills(
			{ skills: ['git-commit'] },
			runner,
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain('not supported');
		expect(result.error).toContain(
			'/home/u/.agents/skills/git-commit',
		);
		expect(result.data).toMatchObject({
			code: 'REMOVE_UNSUPPORTED',
			paths: ['/home/u/.agents/skills/git-commit'],
		});
	});
});

describe('check_skill_drift', () => {
	let state_dir: string;

	beforeEach(async () => {
		state_dir = await mkdtemp(join(tmpdir(), 'mcpick-drift-state-'));
		vi.stubEnv('MCPICK_CONFIG_DIR', join(state_dir, 'mcpick'));
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		await rm(state_dir, { recursive: true, force: true });
	});

	async function seed_provenance(
		entries: Array<Record<string, unknown>>,
	): Promise<void> {
		await mkdir(join(state_dir, 'mcpick'), { recursive: true });
		await writeFile(
			get_skills_provenance_path(),
			JSON.stringify({ skills: entries }),
		);
	}

	function gh_listing(
		skills: Array<Record<string, unknown>>,
	): CommandResult {
		return ok(JSON.stringify(skills));
	}

	it('reports nothing when no provenance exists, without calling gh', async () => {
		const { runner, calls } = make_runner(() => ok());
		const result = await check_skill_drift(runner);
		expect(result).toEqual({ status: 'checked', findings: [] });
		expect(calls).toHaveLength(0);
	});

	it('flags unpinned installs without needing gh', async () => {
		await seed_provenance([
			{
				name: 'review',
				source: 'owner/repo',
				agents: ['pi'],
				scope: 'user',
				installed_at: '2026-08-01T00:00:00Z',
			},
		]);

		const { runner, calls } = make_runner(() => ok());
		const result = await check_skill_drift(runner);
		expect(result.status).toBe('checked');
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].kind).toBe('unpinned');
		expect(calls).toHaveLength(0);
	});

	it('flags drifted refs when upstream has moved', async () => {
		await seed_provenance([
			{
				name: 'review',
				source: 'owner/repo',
				ref: 'v1.0.0',
				agents: ['pi'],
				scope: 'user',
				installed_at: '2026-08-01T00:00:00Z',
			},
		]);

		const { runner } = healthy_gh((command, args) => {
			if (command === 'gh' && args[1] === 'list') {
				return gh_listing([
					{
						skillName: 'review',
						sourceURL: 'https://github.com/owner/repo',
						scope: 'user',
						version: 'v2.0.0',
						pinned: false,
						path: '/home/u/.agents/skills/review',
						agentHosts: ['pi'],
					},
				]);
			}
			return undefined;
		});

		const result = await check_skill_drift(runner);
		expect(result.status).toBe('checked');
		expect(result.findings).toEqual([
			{
				entry: expect.objectContaining({ name: 'review' }),
				kind: 'drifted',
				current: 'v2.0.0',
				installed_path: '/home/u/.agents/skills/review',
			},
		]);
	});

	it('flags skills that no longer resolve upstream', async () => {
		await seed_provenance([
			{
				name: 'gone',
				source: 'owner/repo',
				ref: 'abc123',
				agents: ['pi'],
				scope: 'project',
				installed_at: '2026-08-01T00:00:00Z',
			},
		]);

		const { runner } = healthy_gh(); // gh skill list returns []
		const result = await check_skill_drift(runner);
		expect(result.status).toBe('checked');
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].kind).toBe('unresolved');
	});

	it('passes clean when refs still match upstream', async () => {
		await seed_provenance([
			{
				name: 'review',
				source: 'owner/repo',
				ref: 'v1.0.0',
				agents: ['pi'],
				scope: 'user',
				installed_at: '2026-08-01T00:00:00Z',
			},
		]);

		const { runner } = healthy_gh((command, args) => {
			if (command === 'gh' && args[1] === 'list') {
				return gh_listing([
					{
						skillName: 'review',
						sourceURL: 'owner/repo',
						scope: 'user',
						version: 'v1.0.0',
						pinned: true,
						path: '/x',
						agentHosts: [],
					},
				]);
			}
			return undefined;
		});

		const result = await check_skill_drift(runner);
		expect(result).toEqual({ status: 'checked', findings: [] });
	});

	it('skips the upstream comparison when gh is missing, keeping local findings', async () => {
		await seed_provenance([
			{
				name: 'pinned',
				source: 'owner/repo',
				ref: 'v1.0.0',
				agents: ['pi'],
				scope: 'user',
				installed_at: '2026-08-01T00:00:00Z',
			},
			{
				name: 'floating',
				source: 'owner/other',
				agents: ['pi'],
				scope: 'user',
				installed_at: '2026-08-01T00:00:00Z',
			},
		]);

		const { runner } = make_runner(() => enoent());
		const result = await check_skill_drift(runner);
		expect(result.status).toBe('skipped');
		expect(result.reason).toContain('GitHub CLI');
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0].kind).toBe('unpinned');
		expect(result.findings[0].entry.name).toBe('floating');
	});
});
