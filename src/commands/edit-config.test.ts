import { select } from '@clack/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get_client_adapter } from '../core/client-config.js';
import { select_config_location } from './edit-config.js';

vi.mock('@clack/prompts', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('@clack/prompts')>();
	return {
		...actual,
		select: vi.fn(),
	};
});

afterEach(() => {
	vi.mocked(select).mockReset();
});

function pick_labeled_scope(scope: string) {
	vi.mocked(select).mockImplementation(async (opts) => {
		const option = (
			opts as {
				options: Array<{ value: string; label: string }>;
			}
		).options.find((entry) => entry.label.startsWith(`${scope} `));
		if (!option) {
			throw new Error(`No ${scope} location option`);
		}
		return option.value;
	});
}

describe('select_config_location', () => {
	it('resolves Claude Code user scope when user and local share a path', async () => {
		const adapter = get_client_adapter('claude-code');
		expect(adapter).not.toBeNull();
		const locations = adapter!.locations();
		const user = locations.find(
			(location) => location.scope === 'user',
		);
		const local = locations.find(
			(location) => location.scope === 'local',
		);
		expect(user).toBeDefined();
		expect(local).toBeDefined();
		expect(user!.path).toBe(local!.path);

		pick_labeled_scope('user');
		const resolved = await select_config_location(adapter!);
		expect(resolved?.scope).toBe('user');
		expect(resolved?.description).toBe('~/.claude.json mcpServers');
	});

	it('still resolves Claude Code local scope when local is chosen', async () => {
		const adapter = get_client_adapter('claude-code');
		expect(adapter).not.toBeNull();

		pick_labeled_scope('local');
		const resolved = await select_config_location(adapter!);
		expect(resolved?.scope).toBe('local');
		expect(resolved?.description).toBe(
			'~/.claude.json projects[cwd].mcpServers',
		);
	});
});
