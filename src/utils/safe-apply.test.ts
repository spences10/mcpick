import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	collect_dry_run,
	is_dry_run,
	list_config_backups,
	restore_config_backup,
	safe_content_write,
	safe_json_write,
	start_dry_run,
} from './safe-apply.js';

const original_env = process.env.CLAUDE_CONFIG_DIR;

afterEach(() => {
	if (original_env === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = original_env;
	}
});

async function temp_dir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'mcpick-safe-apply-'));
}

describe('safe_json_write', () => {
	it('writes JSON and backs up existing content', async () => {
		const dir = await temp_dir();
		process.env.CLAUDE_CONFIG_DIR = dir;
		const config_path = join(dir, 'settings.json');
		await writeFile(config_path, '{"old":true}', 'utf-8');

		const result = await safe_json_write(config_path, { next: true });

		expect(JSON.parse(await readFile(config_path, 'utf-8'))).toEqual({
			next: true,
		});
		expect(result.backup_path).toBeDefined();
		expect(
			JSON.parse(await readFile(result.backup_path!, 'utf-8')),
		).toEqual({ old: true });

		const backups = await list_config_backups();
		expect(backups[0]).toMatchObject({
			path: result.backup_path,
			original_path: config_path,
		});
	});

	it('restores config backups by filename', async () => {
		const dir = await temp_dir();
		process.env.CLAUDE_CONFIG_DIR = dir;
		const config_path = join(dir, 'settings.json');
		await writeFile(config_path, '{"old":true}', 'utf-8');
		const result = await safe_json_write(config_path, { next: true });

		await restore_config_backup(
			result.backup_path!.split('/').at(-1)!,
		);

		expect(JSON.parse(await readFile(config_path, 'utf-8'))).toEqual({
			old: true,
		});
	});
});

describe('dry-run session', () => {
	const original_mcpick_dir = process.env.MCPICK_CONFIG_DIR;

	afterEach(() => {
		if (original_mcpick_dir === undefined) {
			delete process.env.MCPICK_CONFIG_DIR;
		} else {
			process.env.MCPICK_CONFIG_DIR = original_mcpick_dir;
		}
	});

	it('records the preview without writing or backing up', async () => {
		const dir = await temp_dir();
		process.env.MCPICK_CONFIG_DIR = join(dir, 'mcpick');
		const config_path = join(dir, 'settings.json');
		await writeFile(config_path, '{"old":true}', 'utf-8');

		start_dry_run();
		const result = await safe_json_write(config_path, {
			next: true,
		});
		const previews = collect_dry_run();

		expect(result.backup_path).toBeUndefined();
		expect(previews).toHaveLength(1);
		expect(previews[0].path).toBe(config_path);
		expect(previews[0].original_content).toBe('{"old":true}');
		expect(previews[0].next_content).toBe(
			JSON.stringify({ next: true }, null, 2),
		);

		// File untouched, no backup created.
		expect(await readFile(config_path, 'utf-8')).toBe('{"old":true}');
		expect(await list_config_backups()).toEqual([]);
	});

	it('records original_content as undefined for a new file and creates nothing', async () => {
		const dir = await temp_dir();
		process.env.CLAUDE_CONFIG_DIR = dir;
		const config_path = join(dir, 'new.json');

		start_dry_run();
		await safe_json_write(config_path, { created: true });
		const previews = collect_dry_run();

		expect(previews[0].original_content).toBeUndefined();
		expect(previews[0].next_content).toContain('"created": true');
		await expect(readFile(config_path, 'utf-8')).rejects.toThrow();
	});

	it('collect_dry_run resets the session so real writes resume', async () => {
		const dir = await temp_dir();
		process.env.CLAUDE_CONFIG_DIR = dir;
		const config_path = join(dir, 'settings.json');

		start_dry_run();
		await safe_json_write(config_path, { staged: true });
		collect_dry_run();
		expect(is_dry_run()).toBe(false);

		await safe_json_write(config_path, { staged: true });
		expect(JSON.parse(await readFile(config_path, 'utf-8'))).toEqual({
			staged: true,
		});
	});

	it('collect_dry_run without a session returns an empty list', () => {
		expect(collect_dry_run()).toEqual([]);
	});
});

describe('TOML backups and restore', () => {
	const original_mcpick_dir = process.env.MCPICK_CONFIG_DIR;

	afterEach(() => {
		if (original_mcpick_dir === undefined) {
			delete process.env.MCPICK_CONFIG_DIR;
		} else {
			process.env.MCPICK_CONFIG_DIR = original_mcpick_dir;
		}
	});

	it('lists .toml backups alongside .json ones', async () => {
		const dir = await temp_dir();
		process.env.MCPICK_CONFIG_DIR = join(dir, 'mcpick');
		const toml_path = join(dir, 'config.toml');
		await writeFile(
			toml_path,
			'[mcpServers.a]\ncommand = "a"\n',
			'utf-8',
		);

		await safe_content_write(
			toml_path,
			'[mcpServers.b]\ncommand = "b"\n',
			'toml',
		);

		const backups = await list_config_backups();
		expect(backups).toHaveLength(1);
		expect(backups[0].path).toMatch(/\.toml$/);
		expect(backups[0].original_path).toBe(toml_path);
	});

	it('restores TOML backups byte-identical', async () => {
		const dir = await temp_dir();
		process.env.MCPICK_CONFIG_DIR = join(dir, 'mcpick');
		const toml_path = join(dir, 'config.toml');
		const original = '[mcpServers.a]\ncommand = "a"\n';
		await writeFile(toml_path, original, 'utf-8');

		const write_result = await safe_content_write(
			toml_path,
			'[mcpServers.b]\ncommand = "b"\n',
			'toml',
		);
		expect(write_result.backup_path).toMatch(/\.toml$/);

		const restored = await restore_config_backup(
			write_result.backup_path!,
		);
		expect(restored.original_path).toBe(toml_path);
		expect(await readFile(toml_path, 'utf-8')).toBe(original);
	});

	it('rejects an invalid TOML backup without touching the file', async () => {
		const dir = await temp_dir();
		process.env.MCPICK_CONFIG_DIR = join(dir, 'mcpick');
		const toml_path = join(dir, 'config.toml');
		const current = '[mcpServers.a]\ncommand = "a"\n';
		await writeFile(toml_path, current, 'utf-8');

		// Hand-craft a corrupt backup with valid metadata.
		const backups_dir = join(dir, 'mcpick', 'backups');
		await mkdir(backups_dir, { recursive: true });
		const backup_path = join(
			backups_dir,
			'config-config.toml-20260101T000000Z-deadbeef00.toml',
		);
		await writeFile(backup_path, 'not = [valid toml', 'utf-8');
		await writeFile(
			`${backup_path}.meta.json`,
			JSON.stringify({
				original_path: toml_path,
				created_at: '2026-01-01T00:00:00Z',
			}),
			'utf-8',
		);

		await expect(
			restore_config_backup(backup_path),
		).rejects.toThrow();
		expect(await readFile(toml_path, 'utf-8')).toBe(current);
	});

	it('dry-run interception records TOML previews without writing', async () => {
		const dir = await temp_dir();
		process.env.MCPICK_CONFIG_DIR = join(dir, 'mcpick');
		const toml_path = join(dir, 'config.toml');
		await writeFile(toml_path, 'a = 1\n', 'utf-8');

		start_dry_run();
		await safe_content_write(toml_path, 'a = 2\n', 'toml');
		const previews = collect_dry_run();

		expect(previews).toHaveLength(1);
		expect(previews[0].next_content).toBe('a = 2\n');
		expect(await readFile(toml_path, 'utf-8')).toBe('a = 1\n');
		expect(await list_config_backups()).toEqual([]);
	});
});
