import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	find_registry_server,
	search_registry,
} from './registry-api.js';

function registry_response(entries: unknown[]) {
	return {
		servers: entries,
		metadata: { count: entries.length },
	};
}

function entry(
	name: string,
	overrides: {
		version?: string;
		repository?: { url: string; source: string };
		packages?: unknown[];
		isLatest?: boolean;
		publishedAt?: string;
	} = {},
) {
	return {
		server: {
			name,
			description: `${name} description`,
			version: overrides.version ?? '1.0.0',
			...(overrides.repository
				? { repository: overrides.repository }
				: {}),
			...(overrides.packages ? { packages: overrides.packages } : {}),
		},
		_meta: {
			'io.modelcontextprotocol.registry/official': {
				status: 'active',
				publishedAt: overrides.publishedAt ?? '2025-10-01T00:00:00Z',
				updatedAt: '2025-10-02T00:00:00Z',
				isLatest: overrides.isLatest ?? true,
			},
		},
	};
}

function stub_fetch(body: unknown, status = 200) {
	const fetch_mock = vi.fn().mockResolvedValue(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' },
		}),
	);
	vi.stubGlobal('fetch', fetch_mock);
	return fetch_mock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('search_registry', () => {
	it('maps registry entries to the trust-signal shape', async () => {
		stub_fetch(
			registry_response([
				entry('io.example/github', {
					version: '2.1.0',
					repository: {
						url: 'https://github.com/example/github-mcp',
						source: 'github',
					},
					packages: [
						{
							registryType: 'npm',
							identifier: '@example/github-mcp',
							version: '2.1.0',
							runtimeHint: 'npx',
							transport: { type: 'stdio' },
						},
					],
					publishedAt: '2025-09-14T15:20:36Z',
				}),
			]),
		);

		const results = await search_registry('github');

		expect(results).toEqual([
			{
				name: 'io.example/github',
				description: 'io.example/github description',
				version: '2.1.0',
				source_repo: 'https://github.com/example/github-mcp',
				published_at: '2025-09-14T15:20:36Z',
				updated_at: '2025-10-02T00:00:00Z',
				status: 'active',
				packages: [
					{
						registryType: 'npm',
						identifier: '@example/github-mcp',
						version: '2.1.0',
						runtimeHint: 'npx',
						transport: { type: 'stdio' },
					},
				],
			},
		]);
	});

	it('finds an exact server name from search results', async () => {
		stub_fetch(
			registry_response([
				entry('io.example/similar'),
				entry('io.example/exact'),
			]),
		);

		await expect(
			find_registry_server('io.example/exact'),
		).resolves.toMatchObject({ name: 'io.example/exact' });
	});

	it('rejects search results without the exact server name', async () => {
		stub_fetch(registry_response([entry('io.example/similar')]));

		await expect(
			find_registry_server('io.example/missing'),
		).rejects.toThrow("Server 'io.example/missing' not found");
	});

	it('keeps only the latest version of each server', async () => {
		stub_fetch(
			registry_response([
				entry('io.example/dup', {
					version: '1.0.0',
					isLatest: false,
				}),
				entry('io.example/dup', {
					version: '1.1.0',
					isLatest: false,
				}),
				entry('io.example/dup', { version: '2.0.0', isLatest: true }),
			]),
		);

		const results = await search_registry('dup');
		expect(results).toHaveLength(1);
		expect(results[0].version).toBe('2.0.0');
	});

	it('surfaces missing source repos as absent, not hidden', async () => {
		stub_fetch(registry_response([entry('io.example/no-repo')]));
		const results = await search_registry('no-repo');
		expect(results[0].source_repo).toBeUndefined();
		expect(results[0].packages).toEqual([]);
	});

	it('sends query, limit, and a mcpick User-Agent', async () => {
		const fetch_mock = stub_fetch(registry_response([]));
		await search_registry('git hub', 25);

		const [url, init] = fetch_mock.mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(url).toContain('/v0/servers');
		expect(url).toContain('search=git%20hub');
		expect(url).toContain('limit=25');
		const headers = new Headers(init.headers);
		expect(headers.get('User-Agent')).toMatch(/^mcpick\//);
		expect(headers.get('Accept')).toBe('application/json');
	});

	it('throws with the status on non-200 responses', async () => {
		stub_fetch({ error: 'nope' }, 503);
		await expect(search_registry('x')).rejects.toThrow('HTTP 503');
	});

	it('throws a clear message when the registry is unreachable', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')),
		);
		await expect(search_registry('x')).rejects.toThrow(
			'Could not reach the MCP registry',
		);
	});

	it('throws a timeout message when the request aborts', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockRejectedValue(
					Object.assign(new Error('aborted'), { name: 'AbortError' }),
				),
		);
		await expect(search_registry('x')).rejects.toThrow('timed out');
	});

	it('throws on invalid JSON', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(new Response('not json', { status: 200 })),
		);
		await expect(search_registry('x')).rejects.toThrow(
			'invalid JSON',
		);
	});

	it('returns empty when the servers field is missing', async () => {
		stub_fetch({});
		expect(await search_registry('x')).toEqual([]);
	});
});
