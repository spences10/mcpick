import { select } from '@clack/prompts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	get_client_adapter,
	type ClientConfigLocation,
} from '../core/client-config.js';
import { select_config_location } from './edit-config.js';

vi.mock('@clack/prompts', async (import_original) => ({
	...(await import_original<typeof import('@clack/prompts')>()),
	select: vi.fn(),
}));

afterEach(() => {
	vi.mocked(select).mockReset();
});

function choose_scope(scope: string) {
	vi.mocked(select).mockImplementation(async (opts) => {
		const option = (
			opts.options as Array<{ value: ClientConfigLocation }>
		).find((entry) => entry.value.scope === scope);
		if (!option) throw new Error(`No ${scope} location option`);
		return option.value;
	});
}

describe('select_config_location', () => {
	const adapter = get_client_adapter('claude-code')!;

	it('offers Claude Code user and local scopes on the same path', () => {
		const locations = adapter.locations();
		const user = locations.find((l) => l.scope === 'user');
		const local = locations.find((l) => l.scope === 'local');
		expect(user?.path).toBe(local?.path);
	});

	it('resolves user scope when user and local share a path', async () => {
		choose_scope('user');
		const location = await select_config_location(adapter);
		expect(location?.scope).toBe('user');
		expect(location?.description).toBe('~/.claude.json mcpServers');
	});

	it('resolves local scope when local is chosen', async () => {
		choose_scope('local');
		const location = await select_config_location(adapter);
		expect(location?.scope).toBe('local');
		expect(location?.description).toBe(
			'~/.claude.json projects[cwd].mcpServers',
		);
	});
});
