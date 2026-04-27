import { describe, expect, it } from 'vitest';
import type { McpServer, McpServerBase } from '../types.js';
import {
	redact_portable_server,
	redact_server,
	redact_server_base,
	redact_text,
	redact_url,
	redact_value,
} from './redact.js';

describe('redact_server_base', () => {
	it('redacts env values', () => {
		const input: McpServerBase = {
			command: 'node',
			args: ['server.js'],
			env: { API_KEY: 'sk-secret-123', NODE_ENV: 'production' },
		};
		const result = redact_server_base(input);
		expect(result.env).toEqual({
			API_KEY: '***',
			NODE_ENV: '***',
		});
	});

	it('redacts headers values on sse server', () => {
		const input: McpServerBase = {
			type: 'sse',
			url: 'https://example.com',
			headers: { Authorization: 'Bearer token123' },
		};
		const result = redact_server_base(input) as typeof input;
		expect(result.headers).toEqual({ Authorization: '***' });
	});

	it('preserves non-sensitive fields', () => {
		const input: McpServerBase = {
			command: 'npx',
			args: ['-y', 'my-mcp-server'],
		};
		const result = redact_server_base(input) as typeof input;
		expect(result.command).toBe('npx');
		expect(result.args).toEqual(['-y', 'my-mcp-server']);
	});

	it('handles server with no env or headers', () => {
		const input: McpServerBase = { command: 'node' };
		const result = redact_server_base(input);
		expect(result).toEqual({ command: 'node' });
	});
});

describe('redact_server', () => {
	it('preserves server name and redacts env', () => {
		const input: McpServer = {
			name: 'my-server',
			command: 'node',
			env: { SECRET: 'value' },
		};
		const result = redact_server(input);
		expect(result.name).toBe('my-server');
		expect(result.env).toEqual({ SECRET: '***' });
	});
});

describe('redact_portable_server', () => {
	it('redacts env, headers, and URL query values', () => {
		const result = redact_portable_server({
			name: 'remote',
			transport: 'http',
			url: 'https://example.com/mcp?token=secret',
			env: { API_KEY: 'secret' },
			headers: { Authorization: 'Bearer secret' },
		});

		expect(result.url).toBe('https://example.com/mcp?redacted');
		expect(result.env).toEqual({ API_KEY: '***' });
		expect(result.headers).toEqual({ Authorization: '***' });
	});
});

describe('redact_url', () => {
	it('removes credentials, query, and hash from URLs', () => {
		expect(
			redact_url(
				'https://user:pass@example.com/mcp?token=secret#hash',
			),
		).toBe('https://example.com/mcp?redacted');
	});
});

describe('redact_text', () => {
	it('redacts common secret patterns from arbitrary CLI output', () => {
		const output = [
			'Authorization: Bearer ' + 'a'.repeat(32),
			'DATABASE_URL=postgres://user:password@example.com/db',
			'api_key=sk-' + 'b'.repeat(32),
			'https://example.com/mcp?token=secret-token-value',
		].join('\n');

		const redacted = redact_text(output);
		expect(redacted).not.toContain('a'.repeat(32));
		expect(redacted).not.toContain('password@example.com');
		expect(redacted).not.toContain('sk-' + 'b'.repeat(32));
		expect(redacted).not.toContain('secret-token-value');
	});
});

describe('redact_value', () => {
	it('redacts nested sensitive fields and secret-looking strings', () => {
		const result = redact_value({
			server: {
				apiKey: 'plain-secret-value',
				args: ['--token', 'sk-' + 'c'.repeat(32)],
			},
		});

		expect(result).toEqual({
			server: {
				apiKey: '***',
				args: ['--token', '[REDACTED:API_KEY]'],
			},
		});
	});
});

it('redacts all env/header values in generic structured output', () => {
	expect(
		redact_value({
			env: { CUSTOM_NAME: 'value-that-should-not-leak' },
			headers: { 'X-Custom': 'another-sensitive-value' },
		}),
	).toEqual({
		env: { CUSTOM_NAME: '***' },
		headers: { 'X-Custom': '***' },
	});
});

it('strips ANSI control sequences from delegated CLI output', () => {
	expect(redact_text('\u001b[31mred\u001b[0m\u001b[?25l')).toBe(
		'red',
	);
});
