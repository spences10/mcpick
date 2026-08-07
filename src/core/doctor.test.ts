import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
	AsyncCommandRunner,
	CommandResult,
} from '../utils/skills-cli.js';
import { get_skills_provenance_path } from '../utils/skills-cli.js';
import { run_doctor } from './doctor.js';

const original_cwd = process.cwd();
const original_home = process.env.HOME;
const original_config_dir = process.env.CLAUDE_CONFIG_DIR;

afterEach(() => {
	process.chdir(original_cwd);
	if (original_home === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = original_home;
	}
	if (original_config_dir === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = original_config_dir;
	}
});

/**
 * Point HOME at a fresh temp dir (homedir() reads $HOME on POSIX) and
 * chdir into a fresh temp project so every known config location lives
 * under throwaway directories.
 */
async function temp_env(): Promise<{
	home: string;
	project: string;
}> {
	const home = await mkdtemp(join(tmpdir(), 'mcpick-doctor-home-'));
	const project = await mkdtemp(
		join(tmpdir(), 'mcpick-doctor-proj-'),
	);
	process.env.HOME = home;
	delete process.env.CLAUDE_CONFIG_DIR;
	process.chdir(project);
	return { home, project };
}

async function write_json(
	path: string,
	data: unknown,
): Promise<void> {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(data));
}

describe('run_doctor', () => {
	it('reports no issues for a clean pinned config', async () => {
		const { project } = await temp_env();
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				memory: {
					command: 'node',
					args: ['server.js'],
				},
			},
		});

		const report = await run_doctor({ client: 'vscode' });

		expect(report.issues).toEqual([]);
		expect(report.summary).toEqual({
			errors: 0,
			warnings: 0,
			checked: 1,
		});
	});

	it('reports unparseable config files as errors', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.vscode'), { recursive: true });
		await writeFile(join(project, '.vscode/mcp.json'), '{ not json ');

		const report = await run_doctor({ client: 'vscode' });

		expect(report.summary.errors).toBe(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'error',
			check: 'config-parse',
			client: 'vscode',
		});
	});

	it('parses JSONC configs with comments and trailing commas', async () => {
		const { project } = await temp_env();
		await writeFile(
			join(project, 'opencode.json'),
			`{
				// comment line
				"mcp": {
					"everything": {
						"type": "local",
						"command": ["node", "server.js"],
					},
				},
			}`,
		);

		const report = await run_doctor({ client: 'opencode' });

		expect(report.issues).toEqual([]);
		expect(report.summary.checked).toBe(1);
	});

	it('flags servers written under a key the client never reads', async () => {
		const { project } = await temp_env();
		// the #85 bug class: this client reads "mcp", not "mcpServers"
		await write_json(join(project, 'opencode.json'), {
			mcpServers: {
				everything: { command: ['node', 'server.js'] },
			},
		});

		const report = await run_doctor({ client: 'opencode' });

		expect(report.summary.errors).toBe(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'error',
			check: 'schema-shape',
			client: 'opencode',
		});
		expect(report.issues[0].message).toContain('"mcpServers"');
		expect(report.issues[0].message).toContain('"mcp"');
	});

	it('flags server entries with neither command nor url', async () => {
		const { project } = await temp_env();
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				broken: { args: ['--help'] },
			},
		});

		const report = await run_doctor({ client: 'vscode' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'error',
			check: 'schema-shape',
			server: 'broken',
		});
	});

	it('flags entries the adapter would silently drop', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.vscode'), { recursive: true });
		await writeFile(
			join(project, '.vscode/mcp.json'),
			JSON.stringify({ servers: { broken: 'npx server' } }),
		);

		const report = await run_doctor({ client: 'vscode' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'error',
			check: 'schema-shape',
		});
		expect(report.issues[0].message).toContain('not an object');
	});

	it('warns when a stdio command is not on PATH', async () => {
		const { project } = await temp_env();
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				missing: {
					command: 'mcpick-test-definitely-not-a-real-binary',
				},
			},
		});

		const report = await run_doctor({ client: 'vscode' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'warning',
			check: 'command-missing',
			server: 'missing',
		});
	});

	it('warns on duplicate server names across scopes', async () => {
		const { home, project } = await temp_env();
		const server = { command: 'node', args: ['server.js'] };
		await write_json(join(project, '.cursor/mcp.json'), {
			mcpServers: { db: server },
		});
		await write_json(join(home, '.cursor/mcp.json'), {
			mcpServers: { db: server },
		});

		const report = await run_doctor({ client: 'cursor' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'warning',
			check: 'duplicate-server',
			server: 'db',
			path: join(project, '.cursor/mcp.json'),
		});
		expect(report.issues[0].message).toContain('project scope wins');
	});

	it('warns on plaintext secrets without printing the value', async () => {
		const { project } = await temp_env();
		const token = 'ghp_abcdefghijklmnopqrstuvwx';
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				github: {
					command: 'node',
					env: {
						GITHUB_TOKEN: token,
						PLAIN: 'not-a-secret',
					},
					headers: { X_API_KEY: 'supersecretvalue123' },
				},
			},
		});

		const report = await run_doctor({ client: 'vscode' });
		const secret_issues = report.issues.filter(
			(issue) => issue.check === 'plaintext-secret',
		);

		expect(secret_issues).toHaveLength(2);
		expect(secret_issues[0].message).toContain('GITHUB_TOKEN');
		expect(secret_issues[1].message).toContain('X_API_KEY');
		expect(JSON.stringify(report)).not.toContain(token);
		expect(JSON.stringify(report)).not.toContain(
			'supersecretvalue123',
		);
	});

	it('ignores placeholder and env-reference values', async () => {
		const { project } = await temp_env();
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				github: {
					command: 'node',
					env: {
						GITHUB_TOKEN: '${GITHUB_TOKEN}',
						API_KEY: 'your-api-key-here',
					},
				},
			},
		});

		const report = await run_doctor({ client: 'vscode' });

		expect(
			report.issues.filter(
				(issue) => issue.check === 'plaintext-secret',
			),
		).toEqual([]);
	});

	it('warns on unpinned npx packages and @latest', async () => {
		const { project } = await temp_env();
		await write_json(join(project, '.vscode/mcp.json'), {
			servers: {
				unpinned: {
					command: 'node',
					args: ['-y', '@modelcontextprotocol/server-memory'],
				},
				latest: {
					command: 'node',
					args: ['-y', 'some-server@latest'],
				},
				pinned: {
					command: 'node',
					args: ['-y', 'some-server@1.2.3'],
				},
			},
		});

		const report = await run_doctor({ client: 'vscode' });
		const unpinned = report.issues.filter(
			(issue) => issue.check === 'unpinned-server',
		);

		expect(unpinned).toHaveLength(2);
		expect(
			unpinned
				.map((issue) => issue.server ?? '')
				.sort((a, b) => a.localeCompare(b)),
		).toEqual(['latest', 'unpinned']);
	});

	it('checks only the requested client', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.vscode'), { recursive: true });
		await writeFile(join(project, '.vscode/mcp.json'), '{ broken ');
		await mkdir(join(project, '.cursor'), { recursive: true });
		await writeFile(join(project, '.cursor/mcp.json'), '{ broken ');

		const report = await run_doctor({ client: 'vscode' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0].client).toBe('vscode');
	});

	it('rejects unknown client ids', async () => {
		await temp_env();
		await expect(run_doctor({ client: 'nope' })).rejects.toThrow(
			"Unknown client 'nope'",
		);
	});

	it('checks claude-code local scope under projects[cwd]', async () => {
		const { home } = await temp_env();
		await write_json(join(home, '.claude.json'), {
			projects: {
				[process.cwd()]: {
					mcpServers: { broken: { args: ['--help'] } },
				},
			},
		});

		const report = await run_doctor({ client: 'claude-code' });

		expect(report.issues).toHaveLength(1);
		expect(report.issues[0]).toMatchObject({
			severity: 'error',
			check: 'schema-shape',
			server: 'broken',
			path: join(home, '.claude.json'),
		});
		// local and user scopes share ~/.claude.json — counted once
		expect(report.summary.checked).toBe(1);
	});

	describe('skill drift', () => {
		function ok(stdout = ''): CommandResult {
			return { status: 0, stdout, stderr: '' };
		}

		function enoent(): CommandResult {
			const error = new Error(
				'spawn gh ENOENT',
			) as NodeJS.ErrnoException;
			error.code = 'ENOENT';
			return { status: null, stdout: '', stderr: '', error };
		}

		function gh_runner(
			handler: (
				command: string,
				args: string[],
			) => CommandResult | undefined,
		): AsyncCommandRunner {
			return async (command, args) => handler(command, args) ?? ok();
		}

		async function seed_provenance(
			entries: Array<Record<string, unknown>>,
		): Promise<void> {
			const dir = join(get_skills_provenance_path(), '..');
			await mkdir(dir, { recursive: true });
			await writeFile(
				get_skills_provenance_path(),
				JSON.stringify({ skills: entries }),
			);
		}

		it('emits skill-drift and unpinned-skill issues', async () => {
			await temp_env();
			await seed_provenance([
				{
					name: 'review',
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

			const runner = gh_runner((command, args) => {
				if (command === 'gh' && args[1] === 'list') {
					return ok(
						JSON.stringify([
							{
								skillName: 'review',
								sourceURL: 'https://github.com/owner/repo',
								scope: 'user',
								version: 'v2.0.0',
								pinned: false,
								path: '/home/u/.agents/skills/review',
								agentHosts: [],
							},
						]),
					);
				}
				return undefined;
			});

			const report = await run_doctor({ runner });

			expect(report.skipped_checks).toEqual([]);
			const drift = report.issues.find(
				(issue) => issue.check === 'skill-drift',
			);
			expect(drift).toMatchObject({
				severity: 'warning',
				client: 'skills',
				server: 'review',
			});
			expect(drift?.message).toContain('v1.0.0');
			expect(drift?.message).toContain('v2.0.0');

			const unpinned = report.issues.find(
				(issue) => issue.check === 'unpinned-skill',
			);
			expect(unpinned).toMatchObject({
				severity: 'warning',
				client: 'skills',
				server: 'floating',
			});
		});

		it('reports skipped_checks when gh is unavailable, keeping local findings', async () => {
			await temp_env();
			await seed_provenance([
				{
					name: 'pinned',
					source: 'owner/repo',
					ref: 'v1.0.0',
					agents: ['pi'],
					scope: 'user',
					installed_at: '2026-08-01T00:00:00Z',
				},
			]);

			const runner = gh_runner(() => enoent());
			const report = await run_doctor({ runner });

			expect(report.skipped_checks).toHaveLength(1);
			expect(report.skipped_checks[0]).toContain('skill-drift');
			expect(
				report.issues.filter(
					(issue) => issue.check === 'skill-drift',
				),
			).toEqual([]);
			// a missing gh is not an error
			expect(report.summary.errors).toBe(0);
		});

		it('emits no skill issues and makes no gh calls without provenance', async () => {
			await temp_env();
			let called = false;
			const runner: AsyncCommandRunner = async () => {
				called = true;
				return ok();
			};

			const report = await run_doctor({ runner });

			expect(called).toBe(false);
			expect(report.skipped_checks).toEqual([]);
			expect(
				report.issues.filter((issue) => issue.client === 'skills'),
			).toEqual([]);
		});
	});
});
