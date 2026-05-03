import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repo_root = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
);
const cli_bin = join(repo_root, 'dist/index.js');

interface CliFixture {
	root: string;
	home: string;
	claudeDir: string;
	project: string;
}

interface CliResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

async function fixture(): Promise<CliFixture> {
	const root = await mkdtemp(join(tmpdir(), 'mcpick-cli-'));
	const home = join(root, 'home');
	const claudeDir = join(home, '.claude');
	const project = join(root, 'project');
	await mkdir(claudeDir, { recursive: true });
	await mkdir(project, { recursive: true });
	return { root, home, claudeDir, project };
}

function run_cli(
	ctx: CliFixture,
	args: string[],
): Promise<CliResult> {
	return new Promise((resolve_result) => {
		const child = spawn(process.execPath, [cli_bin, ...args], {
			cwd: ctx.project,
			env: {
				...process.env,
				HOME: ctx.home,
				USERPROFILE: ctx.home,
				CLAUDE_CONFIG_DIR: ctx.claudeDir,
				NO_COLOR: '1',
				FORCE_COLOR: '0',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf-8');
		child.stderr.setEncoding('utf-8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('close', (status) => {
			resolve_result({ status, stdout, stderr });
		});
	});
}

function parse_json<T = unknown>(result: CliResult): T {
	expect(result.status, result.stderr).toBe(0);
	return JSON.parse(result.stdout) as T;
}

beforeAll(() => {
	if (!existsSync(cli_bin)) {
		throw new Error('dist/index.js not found. Run pnpm build first.');
	}
});

describe('CLI subprocess integration', () => {
	it('prints top-level help instead of launching TUI in non-TTY mode', async () => {
		const ctx = await fixture();
		const result = await run_cli(ctx, []);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain('USAGE');
		expect(result.stdout).toContain('mcpick clients');
	});

	it('lists client locations as JSON', async () => {
		const ctx = await fixture();
		const locations = parse_json<
			Array<{ client: string; scope: string; path: string }>
		>(await run_cli(ctx, ['clients', '--json']));

		expect(locations.some((item) => item.client === 'vscode')).toBe(
			true,
		);
		expect(
			locations.some(
				(item) =>
					item.client === 'opencode' && item.scope === 'project',
			),
		).toBe(true);
	});

	it('adds JSON server config to VS Code project settings', async () => {
		const ctx = await fixture();
		const config = JSON.stringify({
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-memory'],
			env: { API_TOKEN: 'sk-test_12345678901234567890' },
		});

		const result = parse_json<{
			added: string;
			client: string;
			scope: string;
			location: string;
		}>(
			await run_cli(ctx, [
				'add-json',
				'memory',
				config,
				'--client',
				'vscode',
				'--scope',
				'project',
				'--json',
			]),
		);

		expect(result).toMatchObject({
			added: 'memory',
			client: 'vscode',
			scope: 'project',
		});
		const stored = JSON.parse(
			await readFile(join(ctx.project, '.vscode/mcp.json'), 'utf-8'),
		);
		expect(stored.servers.memory.command).toBe('npx');
		expect(stored.servers.memory.env.API_TOKEN).toContain('sk-test');
	});

	it('disables and enables OpenCode project servers', async () => {
		const ctx = await fixture();
		await writeFile(
			join(ctx.project, 'opencode.json'),
			JSON.stringify({
				mcp: {
					everything: {
						type: 'local',
						command: ['npx', '-y', 'everything'],
						enabled: true,
					},
				},
			}),
		);

		const disabled = parse_json<{ disabled: string }>(
			await run_cli(ctx, [
				'disable',
				'everything',
				'--client',
				'opencode',
				'--scope',
				'project',
				'--json',
			]),
		);
		expect(disabled.disabled).toBe('everything');
		expect(
			JSON.parse(
				await readFile(join(ctx.project, 'opencode.json'), 'utf-8'),
			).mcp.everything.enabled,
		).toBe(false);

		const enabled = parse_json<{ enabled: string }>(
			await run_cli(ctx, [
				'enable',
				'everything',
				'--client',
				'opencode',
				'--scope',
				'project',
				'--json',
			]),
		);
		expect(enabled.enabled).toBe('everything');
		expect(
			JSON.parse(
				await readFile(join(ctx.project, 'opencode.json'), 'utf-8'),
			).mcp.everything.enabled,
		).toBe(true);
	});

	it('removes VS Code project servers', async () => {
		const ctx = await fixture();
		await mkdir(join(ctx.project, '.vscode'), { recursive: true });
		await writeFile(
			join(ctx.project, '.vscode/mcp.json'),
			JSON.stringify({
				servers: { memory: { command: 'npx', args: ['memory'] } },
			}),
		);

		const result = parse_json<{ removed: string; client: string }>(
			await run_cli(ctx, [
				'remove',
				'memory',
				'--client',
				'vscode',
				'--scope',
				'project',
				'--json',
			]),
		);

		expect(result).toMatchObject({
			removed: 'memory',
			client: 'vscode',
		});
		expect(
			JSON.parse(
				await readFile(
					join(ctx.project, '.vscode/mcp.json'),
					'utf-8',
				),
			).servers.memory,
		).toBeUndefined();
	});

	it('lists and restores rollback backups', async () => {
		const ctx = await fixture();
		await mkdir(join(ctx.project, '.vscode'), { recursive: true });
		const configPath = join(ctx.project, '.vscode/mcp.json');
		await writeFile(
			configPath,
			JSON.stringify({
				servers: { old: { command: 'npx', args: ['old'] } },
			}),
		);

		const mutation = parse_json<{
			operation: string;
			location: string;
			backup_path: string;
		}>(
			await run_cli(ctx, [
				'add-json',
				'next',
				JSON.stringify({ command: 'npx', args: ['next'] }),
				'--client',
				'vscode',
				'--scope',
				'project',
				'--json',
			]),
		);
		expect(mutation).toMatchObject({
			operation: 'add',
			location: configPath,
		});
		expect(mutation.backup_path).toContain('config-mcp.json');

		const backups = parse_json<Array<{ original_path: string }>>(
			await run_cli(ctx, ['rollback', '--list', '--json']),
		);
		expect(backups[0].original_path).toBe(configPath);
		expect(
			JSON.parse(await readFile(configPath, 'utf-8')).servers.next,
		).toBeDefined();

		const restored = parse_json<{
			restored: { original_path: string };
		}>(await run_cli(ctx, ['rollback', '--json']));
		expect(restored.restored.original_path).toBe(configPath);
		const config = JSON.parse(await readFile(configPath, 'utf-8'));
		expect(config.servers.old).toBeDefined();
		expect(config.servers.next).toBeUndefined();
	});

	it('exits non-zero for invalid client and invalid scope', async () => {
		const ctx = await fixture();

		const invalidClient = await run_cli(ctx, [
			'list',
			'--client',
			'not-a-client',
		]);
		expect(invalidClient.status).not.toBe(0);
		expect(invalidClient.stderr).toContain('Invalid client');

		const invalidScope = await run_cli(ctx, [
			'list',
			'--client',
			'vscode',
			'--scope',
			'local',
		]);
		expect(invalidScope.status).not.toBe(0);
		expect(invalidScope.stderr).toContain(
			'does not support local scope',
		);
	});

	it('redacts secret-like values from error output', async () => {
		const ctx = await fixture();
		const secretPath = join(
			ctx.project,
			'sk-test_123456789012345678901234.json',
		);

		const result = await run_cli(ctx, [
			'add-json',
			'secret-test',
			JSON.stringify({ command: 'npx', args: ['secret-test'] }),
			'--client',
			'vscode',
			'--scope',
			'project',
			'--location',
			secretPath,
		]);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('[REDACTED:API_KEY]');
		expect(result.stderr).not.toContain(
			'sk-test_123456789012345678901234',
		);
	});
});
