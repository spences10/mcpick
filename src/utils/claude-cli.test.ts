import { describe, expect, it } from 'vitest';
import {
	build_add_args,
	get_scope_description,
	get_scope_options,
	is_valid_env_key,
} from './claude-cli.js';

describe('is_valid_env_key', () => {
	it('accepts standard env keys', () => {
		expect(is_valid_env_key('API_KEY')).toBe(true);
		expect(is_valid_env_key('NODE_ENV')).toBe(true);
		expect(is_valid_env_key('_PRIVATE')).toBe(true);
		expect(is_valid_env_key('a')).toBe(true);
	});

	it('rejects keys starting with numbers', () => {
		expect(is_valid_env_key('1BAD')).toBe(false);
	});

	it('rejects keys with special characters', () => {
		expect(is_valid_env_key('BAD-KEY')).toBe(false);
		expect(is_valid_env_key('BAD KEY')).toBe(false);
		expect(is_valid_env_key('BAD.KEY')).toBe(false);
		expect(is_valid_env_key("'; rm -rf /")).toBe(false);
	});

	it('rejects empty string', () => {
		expect(is_valid_env_key('')).toBe(false);
	});
});

describe('build_add_args', () => {
	it('builds args for stdio server', () => {
		const args = build_add_args(
			{ name: 'my-server', command: 'node', args: ['server.js'] },
			'local',
		);
		expect(args).toEqual([
			'mcp',
			'add',
			'my-server',
			'--scope',
			'local',
			'--',
			'node',
			'server.js',
		]);
	});

	it('omits --transport for stdio (default)', () => {
		const args = build_add_args(
			{ name: 'test', command: 'node' },
			'user',
		);
		expect(args).not.toContain('--transport');
	});

	it('includes --transport for sse', () => {
		const args = build_add_args(
			{
				name: 'test',
				type: 'sse' as const,
				url: 'https://example.com',
			},
			'user',
		);
		expect(args).toContain('--transport');
		expect(args[args.indexOf('--transport') + 1]).toBe('sse');
		expect(args).toContain('https://example.com');
	});

	it('includes env vars for stdio server', () => {
		const args = build_add_args(
			{
				name: 'test',
				command: 'node',
				env: { API_KEY: 'secret', NODE_ENV: 'prod' },
			},
			'local',
		);
		expect(args).toContain('-e');
		expect(args).toContain('API_KEY=secret');
		expect(args).toContain('NODE_ENV=prod');
	});

	it('skips invalid env keys', () => {
		const args = build_add_args(
			{
				name: 'test',
				command: 'node',
				env: { VALID_KEY: 'ok', 'bad-key': 'nope' },
			},
			'local',
		);
		expect(args).toContain('VALID_KEY=ok');
		expect(args.join(' ')).not.toContain('bad-key');
	});

	it('includes headers for http server', () => {
		const args = build_add_args(
			{
				name: 'test',
				type: 'http' as const,
				url: 'https://example.com/mcp',
				headers: { Authorization: 'Bearer tok' },
			},
			'user',
		);
		expect(args).toContain('-H');
		expect(args).toContain('Authorization: Bearer tok');
	});

	it('handles server with no args', () => {
		const args = build_add_args(
			{ name: 'test', command: 'npx' },
			'local',
		);
		expect(args).toContain('--');
		expect(args).toContain('npx');
	});

	it('does not shell-escape any values', () => {
		const args = build_add_args(
			{
				name: "server's name",
				command: 'node',
				args: ['--flag=value with spaces'],
			},
			'local',
		);
		// Raw values, no quotes added
		expect(args).toContain("server's name");
		expect(args).toContain('--flag=value with spaces');
	});
});

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
