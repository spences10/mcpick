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
	add_server_to_registry,
	read_server_registry,
} from './registry.js';

const original_claude_config_dir = process.env.CLAUDE_CONFIG_DIR;

async function temp_claude_dir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mcpick-registry-'));
	const claude_dir = join(dir, '.claude');
	await mkdir(join(claude_dir, 'mcpick'), { recursive: true });
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

describe('server registry', () => {
	it('migrates legacy Claude-shaped registries to portable version 3', async () => {
		const claude_dir = await temp_claude_dir();
		const registry_path = join(claude_dir, 'mcpick', 'servers.json');
		await writeFile(
			registry_path,
			JSON.stringify({
				servers: [
					{
						name: 'memory',
						command: 'npx',
						args: ['memory'],
					},
					{
						name: 'remote',
						type: 'http',
						url: 'https://mcp.example',
					},
				],
			}),
		);

		const registry = await read_server_registry();

		expect(registry).toEqual({
			version: 3,
			servers: [
				{
					name: 'memory',
					transport: 'stdio',
					command: 'npx',
					args: ['memory'],
				},
				{
					name: 'remote',
					transport: 'http',
					url: 'https://mcp.example',
				},
			],
		});
		expect(
			JSON.parse(await readFile(registry_path, 'utf-8')).version,
		).toBe(3);
	});

	it('stores newly added Claude servers as portable registry entries', async () => {
		const claude_dir = await temp_claude_dir();
		const registry_path = join(claude_dir, 'mcpick', 'servers.json');

		await add_server_to_registry({
			name: 'filesystem',
			command: 'npx',
			args: ['filesystem'],
		});

		const written = JSON.parse(
			await readFile(registry_path, 'utf-8'),
		);
		expect(written).toEqual({
			version: 3,
			servers: [
				{
					name: 'filesystem',
					transport: 'stdio',
					command: 'npx',
					args: ['filesystem'],
				},
			],
		});
	});
});
