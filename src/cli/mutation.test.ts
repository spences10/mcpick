import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { is_dry_run, safe_json_write } from '../utils/safe-apply.js';
import {
	is_dry_run_arg,
	previews_to_diff,
	print_dry_run_preview,
	print_dry_run_unsupported,
	run_dry_run,
} from './mutation.js';

async function temp_dir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'mcpick-mutation-'));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('is_dry_run_arg', () => {
	it('reads the citty --dry-run flag', () => {
		expect(is_dry_run_arg({ 'dry-run': true })).toBe(true);
		expect(is_dry_run_arg({ 'dry-run': false })).toBe(false);
		expect(is_dry_run_arg({})).toBe(false);
	});
});

describe('run_dry_run', () => {
	it('collects previews from intercepted safe_json_write calls', async () => {
		const dir = await temp_dir();
		const config_path = join(dir, 'config.json');
		await writeFile(config_path, '{"a":1}', 'utf-8');

		const { result, previews } = await run_dry_run(async () => {
			await safe_json_write(config_path, { a: 2 });
			return 'done';
		});

		expect(result).toBe('done');
		expect(previews).toHaveLength(1);
		expect(is_dry_run()).toBe(false);
		expect(await readFile(config_path, 'utf-8')).toBe('{"a":1}');
	});

	it('closes the session when the mutation throws', async () => {
		await expect(
			run_dry_run(async () => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		expect(is_dry_run()).toBe(false);
	});
});

describe('previews_to_diff', () => {
	it('joins per-file unified diffs', () => {
		const diff = previews_to_diff([
			{
				path: 'a.json',
				original_content: '{"x":1}',
				next_content: '{"x":2}',
			},
			{ path: 'b.json', next_content: '{"new":true}' },
		]);
		expect(diff).toContain('--- a/a.json');
		expect(diff).toContain('+++ b/a.json');
		expect(diff).toContain('--- /dev/null');
		expect(diff).toContain('+++ b/b.json');
	});
});

describe('print_dry_run_preview', () => {
	it('prints the redacted diff and a no-changes-written line in human mode', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		print_dry_run_preview(
			[
				{
					path: 'config.json',
					original_content: 'token=abc123def456ghi789',
					next_content: 'token=abc123def456ghi789\nother=1',
				},
			],
			{ json: false },
		);
		const printed = log.mock.calls.flat().join('\n');
		expect(printed).toContain('dry-run: no changes written');
		expect(printed).toContain('[REDACTED]');
		expect(printed).not.toContain('abc123def456ghi789');
	});

	it('emits the machine-readable JSON shape', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		print_dry_run_preview(
			[
				{
					path: 'config.json',
					original_content: 'a',
					next_content: 'b',
				},
			],
			{ json: true, warnings: [{ key: 'API_KEY' }] },
		);
		const payload = JSON.parse(log.mock.calls[0][0] as string);
		expect(payload.dry_run).toBe(true);
		expect(payload.path).toBe('config.json');
		expect(payload.diff).toContain('+++ b/config.json');
		expect(payload.warnings).toEqual([{ key: 'API_KEY' }]);
	});
});

describe('print_dry_run_unsupported', () => {
	it('explains the claude subprocess limitation in human mode', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		print_dry_run_unsupported(false);
		expect(log.mock.calls.flat().join(' ')).toContain(
			'unsupported for the claude-code CLI path',
		);
	});

	it('marks supported:false in JSON mode', () => {
		const log = vi
			.spyOn(console, 'log')
			.mockImplementation(() => undefined);
		print_dry_run_unsupported(true);
		const payload = JSON.parse(log.mock.calls[0][0] as string);
		expect(payload).toMatchObject({
			dry_run: true,
			supported: false,
		});
	});
});
