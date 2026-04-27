import { describe, expect, it } from 'vitest';
import {
	build_enabled_plugins,
	get_all_plugins,
} from './settings.js';

describe('get_all_plugins', () => {
	it('parses enabledPlugins into structured list', () => {
		const result = get_all_plugins({
			enabledPlugins: {
				'code-review@acme-tools': true,
				'deploy@acme-tools': false,
			},
		});
		expect(result).toEqual([
			{
				name: 'code-review',
				marketplace: 'acme-tools',
				enabled: true,
			},
			{
				name: 'deploy',
				marketplace: 'acme-tools',
				enabled: false,
			},
		]);
	});

	it('returns empty array when no plugins', () => {
		expect(get_all_plugins({})).toEqual([]);
	});

	it('handles keys without @ separator', () => {
		const result = get_all_plugins({
			enabledPlugins: { 'orphan-plugin': true },
		});
		expect(result).toEqual([
			{
				name: 'orphan-plugin',
				marketplace: 'unknown',
				enabled: true,
			},
		]);
	});
});

describe('build_enabled_plugins', () => {
	it('converts plugin list back to record', () => {
		const result = build_enabled_plugins([
			{ name: 'foo', marketplace: 'bar', enabled: true },
			{ name: 'baz', marketplace: 'bar', enabled: false },
		]);
		expect(result).toEqual({
			'foo@bar': true,
			'baz@bar': false,
		});
	});

	it('roundtrips with get_all_plugins', () => {
		const original = {
			'plugin-a@market-1': true,
			'plugin-b@market-2': false,
		};
		const parsed = get_all_plugins({ enabledPlugins: original });
		const rebuilt = build_enabled_plugins(parsed);
		expect(rebuilt).toEqual(original);
	});
});
