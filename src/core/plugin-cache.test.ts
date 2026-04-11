import { describe, expect, it } from 'vitest';
import { parse_plugin_key } from './plugin-cache.js';

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
