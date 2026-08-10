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
const original_mcpick_config_dir = process.env.MCPICK_CONFIG_DIR;

async function temp_claude_dir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mcpick-registry-'));
	const claude_dir = join(dir, '.claude');
	await mkdir(join(claude_dir, 'mcpick'), { recursive: true });
	process.env.CLAUDE_CONFIG_DIR = claude_dir;
	process.env.MCPICK_CONFIG_DIR = join(claude_dir, 'mcpick');
	return claude_dir;
}

afterEach(() => {
	if (original_claude_config_dir === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = original_claude_config_dir;
	}
	if (original_mcpick_config_dir === undefined) {
		delete process.env.MCPICK_CONFIG_DIR;
	} else {
		process.env.MCPICK_CONFIG_DIR = original_mcpick_config_dir;
	}
});

describe('server registry', () => {
	it('reads legacy Claude-shaped registries as portable version 3 without rewriting them', async () => {
		const claude_dir = await temp_claude_dir();
		const registry_path = join(claude_dir, 'mcpick', 'servers.json');
		const legacy_content = JSON.stringify({
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
		});
		await writeFile(registry_path, legacy_content);

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
		expect(await readFile(registry_path, 'utf-8')).toBe(
			legacy_content,
		);
	});

	it('does not create a missing registry while reading', async () => {
		const claude_dir = await temp_claude_dir();
		const registry_path = join(claude_dir, 'mcpick', 'servers.json');

		await expect(read_server_registry()).resolves.toEqual({
			version: 3,
			servers: [],
		});
		await expect(
			readFile(registry_path, 'utf-8'),
		).rejects.toMatchObject({ code: 'ENOENT' });
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
