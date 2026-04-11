import { describe, expect, it } from 'vitest';
import {
	get_scope_description,
	get_scope_options,
} from './claude-cli.js';

describe('get_scope_description', () => {
	it('returns description for local scope', () => {
		expect(get_scope_description('local')).toContain('project');
	});

	it('returns description for project scope', () => {
		expect(get_scope_description('project')).toContain('.mcp.json');
	});

	it('returns description for user scope', () => {
		expect(get_scope_description('user')).toContain('Global');
	});
});

describe('get_scope_options', () => {
	it('returns all three scopes', () => {
		const options = get_scope_options();
		const values = options.map((o) => o.value);
		expect(values).toContain('local');
		expect(values).toContain('project');
		expect(values).toContain('user');
	});

	it('each option has label and hint', () => {
		const options = get_scope_options();
		for (const opt of options) {
			expect(opt.label).toBeTruthy();
			expect(opt.hint).toBeTruthy();
		}
	});
});
