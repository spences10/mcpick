import { describe, expect, it } from 'vitest';
import type { McpServer, McpServerBase } from '../types.js';
import { redact_server, redact_server_base } from './redact.js';

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
