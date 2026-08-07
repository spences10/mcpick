import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	collect_dry_run,
	is_dry_run,
	list_config_backups,
	restore_config_backup,
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
