import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo_root = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);
const cli_bin = join(repo_root, 'dist/index.js');

interface CliFixture {
	root: string;
	home: string;
	claude_dir: string;
	project: string;
}

interface CliResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

async function fixture(): Promise<CliFixture> {
	const root = await mkdtemp(join(tmpdir(), 'mcpick-dry-run-'));
	const home = join(root, 'home');
	const claude_dir = join(home, '.claude');
	const project = join(root, 'project');
	await mkdir(claude_dir, { recursive: true });
	await mkdir(project, { recursive: true });
	return { root, home, claude_dir, project };
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
				CLAUDE_CONFIG_DIR: ctx.claude_dir,
				MCPICK_CONFIG_DIR: join(ctx.root, 'mcpick-state'),
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

async function write_cursor_config(
	ctx: CliFixture,
	servers: Record<string, unknown>,
): Promise<string> {
	const config_path = join(ctx.project, '.cursor', 'mcp.json');
	await mkdir(dirname(config_path), { recursive: true });
	await writeFile(
		config_path,
		JSON.stringify({ mcpServers: servers }, null, 2),
		'utf-8',
	);
	return config_path;
}

async function backup_files(ctx: CliFixture): Promise<string[]> {
	const backups_dir = join(ctx.root, 'mcpick-state', 'backups');
	if (!existsSync(backups_dir)) return [];
	return readdir(backups_dir);
}

describe('--dry-run mutations', () => {
	it('remove --client cursor previews the diff and writes nothing', async () => {
		const ctx = await fixture();
		const config_path = await write_cursor_config(ctx, {
			keep: { command: 'keep-cmd' },
			gone: { command: 'gone-cmd' },
		});
		const before = await readFile(config_path, 'utf-8');

		const result = await run_cli(ctx, [
			'remove',
			'gone',
			'--client',
			'cursor',
			'--scope',
			'project',
			'--dry-run',
			'--json',
		]);

		expect(result.status, result.stderr).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.dry_run).toBe(true);
		expect(payload.path).toBe(config_path);
		expect(payload.diff).toContain(`--- a${config_path}`);
		expect(payload.diff).toContain('gone-cmd');

		// True read-only preview: file unchanged, no backup written.
		expect(await readFile(config_path, 'utf-8')).toBe(before);
		expect(await backup_files(ctx)).toEqual([]);
	});

	it('add-json --client cursor previews a new file from /dev/null', async () => {
		const ctx = await fixture();
		const result = await run_cli(ctx, [
			'add-json',
			'fresh',
			'{"command":"npx","args":["-y","some-mcp@1.2.3"]}',
			'--client',
			'cursor',
			'--scope',
			'project',
			'--dry-run',
			'--json',
		]);

		expect(result.status, result.stderr).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.dry_run).toBe(true);
		expect(payload.diff).toContain('--- /dev/null');
		expect(payload.diff).toContain('some-mcp@1.2.3');

		// Nothing was created.
		expect(existsSync(join(ctx.project, '.cursor', 'mcp.json'))).toBe(
			false,
		);
		expect(await backup_files(ctx)).toEqual([]);
	});

	it('human mode prints the diff and a no-changes-written line', async () => {
		const ctx = await fixture();
		const config_path = await write_cursor_config(ctx, {
			gone: { command: 'gone-cmd' },
		});
		const before = await readFile(config_path, 'utf-8');

		const result = await run_cli(ctx, [
			'remove',
			'gone',
			'--client',
			'cursor',
			'--scope',
			'project',
			'--dry-run',
		]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('dry-run: no changes written');
		expect(result.stdout).toContain('+++ b/');
		expect(await readFile(config_path, 'utf-8')).toBe(before);
	});

	it('unknown server is a real error (exit 1) even in dry-run', async () => {
		const ctx = await fixture();
		await write_cursor_config(ctx, {
			keep: { command: 'keep-cmd' },
		});

		const result = await run_cli(ctx, [
			'disable',
			'missing',
			'--client',
			'cursor',
			'--scope',
			'project',
			'--dry-run',
			'--json',
		]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('missing');
	});

	it('claude-code subprocess path reports dry-run as unsupported (exit 0)', async () => {
		const ctx = await fixture();
		// Seed the mcpick registry so the server lookup succeeds.
		const registry_path = join(
			ctx.root,
			'mcpick-state',
			'servers.json',
		);
		await mkdir(dirname(registry_path), { recursive: true });
		await writeFile(
			registry_path,
			JSON.stringify({
				version: 3,
				servers: [
					{
						name: 'seeded',
						transport: 'stdio',
						command: 'seeded-cmd',
					},
				],
			}),
			'utf-8',
		);

		const result = await run_cli(ctx, [
			'enable',
			'seeded',
			'--dry-run',
			'--json',
		]);

		expect(result.status, result.stderr).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.dry_run).toBe(true);
		expect(payload.supported).toBe(false);
		expect(payload.message).toContain('--client');
		// No claude config written, no backup.
		expect(await backup_files(ctx)).toEqual([]);
	});

	it('add --client cursor --dry-run still emits secret warnings', async () => {
		const ctx = await fixture();
		await write_cursor_config(ctx, {});

		const result = await run_cli(ctx, [
			'add',
			'--name',
			'secret-server',
			'--command',
			'npx',
			'--args',
			'-y,some-mcp@1.0.0',
			'--env',
			'GITHUB_TOKEN=ghp_0123456789abcdefghij0123456789abcdef',
			'--client',
			'cursor',
			'--scope',
			'project',
			'--dry-run',
			'--json',
		]);

		expect(result.status, result.stderr).toBe(0);
		expect(result.stderr).toContain('warning:');
		const payload = JSON.parse(result.stdout);
		expect(payload.dry_run).toBe(true);
		expect(payload.warnings.length).toBeGreaterThan(0);
		// The diff is redacted: the token value must not appear.
		expect(result.stdout).not.toContain(
			'ghp_0123456789abcdefghij0123456789abcdef',
		);
	});
});
