import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { safe_json_write } from './safe-apply.js';

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
	});
});
