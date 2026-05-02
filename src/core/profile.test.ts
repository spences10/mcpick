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
	apply_profile_to_claude,
	save_current_claude_profile,
} from './profile.js';

const original_claude_config_dir = process.env.CLAUDE_CONFIG_DIR;

async function temp_claude_dir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mcpick-profile-'));
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

describe('profile services', () => {
	it('applies Claude profiles through the shared service', async () => {
		const claude_dir = await temp_claude_dir();
		const profiles_dir = join(claude_dir, 'mcpick', 'profiles');
		await mkdir(profiles_dir, { recursive: true });
		await writeFile(
			join(profiles_dir, 'work.json'),
			JSON.stringify({
				mcpServers: {
					memory: { command: 'npx', args: ['memory'] },
				},
				enabledPlugins: { 'toolkit@example': true },
			}),
		);

		const result = await apply_profile_to_claude('work');

		expect(result).toEqual({
			profile: 'work',
			serverCount: 1,
			pluginCount: 1,
		});
		expect(
			JSON.parse(
				await readFile(join(claude_dir, '.claude.json'), 'utf-8'),
			).mcpServers.memory.command,
		).toBe('npx');
		expect(
			JSON.parse(
				await readFile(join(claude_dir, 'settings.json'), 'utf-8'),
			).enabledPlugins['toolkit@example'],
		).toBe(true);
	});

	it('saves current Claude config through the shared service', async () => {
		const claude_dir = await temp_claude_dir();
		await writeFile(
			join(claude_dir, '.claude.json'),
			JSON.stringify({
				mcpServers: {
					filesystem: { command: 'npx', args: ['filesystem'] },
				},
			}),
		);
		await writeFile(
			join(claude_dir, 'settings.json'),
			JSON.stringify({
				enabledPlugins: { 'toolkit@example': false },
			}),
		);

		const result = await save_current_claude_profile('saved');

		expect(result).toEqual({
			profile: 'saved',
			serverCount: 1,
			pluginCount: 1,
		});
		const profile = JSON.parse(
			await readFile(
				join(claude_dir, 'mcpick', 'profiles', 'saved.json'),
				'utf-8',
			),
		);
		expect(profile.mcpServers.filesystem.command).toBe('npx');
		expect(profile.enabledPlugins['toolkit@example']).toBe(false);
	});
});
