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
	clear_plugin_caches,
	parse_plugin_key,
} from './plugin-cache.js';

const original_claude_config_dir = process.env.CLAUDE_CONFIG_DIR;

async function temp_claude_dir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mcpick-plugin-cache-'));
	const claude_dir = join(dir, '.claude');
	await mkdir(claude_dir, { recursive: true });
	process.env.CLAUDE_CONFIG_DIR = claude_dir;
	return claude_dir;
}

afterEach(() => {
	if (original_claude_config_dir === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = original_claude_config_dir;
	}
});

describe('parse_plugin_key', () => {
	it('parses standard name@marketplace format', () => {
		const result = parse_plugin_key('my-plugin@my-marketplace');
		expect(result).toEqual({
			name: 'my-plugin',
			marketplace: 'my-marketplace',
		});
	});

	it('handles scoped npm-style names with @', () => {
		const result = parse_plugin_key(
			'@scope/my-plugin@my-marketplace',
		);
		expect(result).toEqual({
			name: '@scope/my-plugin',
			marketplace: 'my-marketplace',
		});
	});

	it('falls back to unknown marketplace when no @ present', () => {
		const result = parse_plugin_key('standalone-plugin');
		expect(result).toEqual({
			name: 'standalone-plugin',
			marketplace: 'unknown',
		});
	});

	it('uses last @ as separator', () => {
		const result = parse_plugin_key('a@b@c');
		expect(result).toEqual({ name: 'a@b', marketplace: 'c' });
	});
});

describe('clear_plugin_caches', () => {
	it('re-disables restored hooks before cache rebuilds can copy them', async () => {
		const claude_dir = await temp_claude_dir();
		const plugin_key = 'toolkit@example';
		const source_hooks_path = join(
			claude_dir,
			'plugins',
			'marketplaces',
			'example',
			'plugins',
			'toolkit',
			'hooks',
			'hooks.json',
		);
		const cache_hooks_path = join(
			claude_dir,
			'plugins',
			'cache',
			'example',
			'toolkit',
			'hooks',
			'hooks.json',
		);
		const handler = {
			type: 'command',
			command: 'echo restored',
		};

		await mkdir(join(source_hooks_path, '..'), { recursive: true });
		await mkdir(join(cache_hooks_path, '..'), { recursive: true });
		await mkdir(join(claude_dir, 'mcpick'), { recursive: true });
		await writeFile(
			join(claude_dir, 'mcpick', 'disabled-hooks.json'),
			JSON.stringify([
				{
					plugin_key,
					hooks_json_path: cache_hooks_path,
					event: 'PostToolUse',
					matcher_index: 0,
					hook_index: 0,
					original_handler: handler,
					disabled_at: new Date().toISOString(),
				},
			]),
		);
		await writeFile(
			source_hooks_path,
			JSON.stringify({
				hooks: { PostToolUse: [{ hooks: [handler] }] },
			}),
		);
		await writeFile(
			cache_hooks_path,
			JSON.stringify({
				hooks: { PostToolUse: [{ hooks: [handler] }] },
			}),
		);

		const result = await clear_plugin_caches([plugin_key]);

		expect(result.redisabledHooks).toEqual({ success: 1, failed: 0 });
		expect(result.cleared).toEqual([plugin_key]);
		const source_hooks = JSON.parse(
			await readFile(source_hooks_path, 'utf-8'),
		);
		expect(source_hooks.hooks.PostToolUse).toBeUndefined();
	});
});
