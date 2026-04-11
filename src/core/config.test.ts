import { describe, expect, it } from 'vitest';
import {
	create_config_from_servers,
	get_enabled_servers,
} from './config.js';

describe('get_enabled_servers', () => {
	it('extracts servers with names from config', () => {
		const result = get_enabled_servers({
			mcpServers: {
				'my-server': { command: 'node', args: ['s.js'] },
				'my-sse': {
					type: 'sse' as const,
					url: 'https://example.com',
				},
			},
		});
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe('my-server');
		expect(result[1].name).toBe('my-sse');
	});

	it('returns empty array for empty config', () => {
		expect(get_enabled_servers({})).toEqual([]);
		expect(get_enabled_servers({ mcpServers: {} })).toEqual([]);
	});
});

describe('create_config_from_servers', () => {
	it('builds config from server list', () => {
		const result = create_config_from_servers([
			{ name: 'a', command: 'node', args: ['x.js'] },
			{ name: 'b', type: 'sse' as const, url: 'https://x.com' },
		]);
		expect(Object.keys(result.mcpServers!)).toEqual(['a', 'b']);
		expect(result.mcpServers!['a']).not.toHaveProperty('name');
	});

	it('roundtrips with get_enabled_servers', () => {
		const servers = [
			{ name: 'test', command: 'npx', args: ['-y', 'my-server'] },
		];
		const config = create_config_from_servers(servers);
		const extracted = get_enabled_servers(config);
		expect(extracted).toEqual(servers);
	});
});
