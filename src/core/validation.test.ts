import { describe, expect, it } from 'vitest';
import {
	validate_claude_config,
	validate_mcp_server,
	validate_server_registry,
} from './validation.js';

describe('validate_mcp_server', () => {
	it('validates stdio server', () => {
		const result = validate_mcp_server({
			name: 'test',
			command: 'node',
			args: ['server.js'],
		});
		expect(result.name).toBe('test');
	});

	it('validates stdio server with env', () => {
		const result = validate_mcp_server({
			name: 'test',
			command: 'node',
			env: { API_KEY: 'abc' },
		});
		expect(result.env).toEqual({ API_KEY: 'abc' });
	});

	it('validates sse server', () => {
		const result = validate_mcp_server({
			name: 'test',
			type: 'sse',
			url: 'https://example.com/sse',
		});
		expect(result.type).toBe('sse');
	});

	it('validates http server', () => {
		const result = validate_mcp_server({
			name: 'test',
			type: 'http',
			url: 'https://example.com/mcp',
			headers: { Authorization: 'Bearer tok' },
		});
		expect(result.type).toBe('http');
	});

	it('rejects server without name', () => {
		expect(() => validate_mcp_server({ command: 'node' })).toThrow();
	});

	it('rejects server without command or url', () => {
		expect(() => validate_mcp_server({ name: 'test' })).toThrow();
	});

	it('rejects empty command', () => {
		expect(() =>
			validate_mcp_server({ name: 'test', command: '' }),
		).toThrow();
	});
});

describe('validate_claude_config', () => {
	it('validates config with servers', () => {
		const result = validate_claude_config({
			mcpServers: {
				'my-server': { command: 'node', args: ['s.js'] },
			},
		});
		const server = result.mcpServers?.['my-server'];
		expect(server).toBeDefined();
		expect('command' in server! && server.command).toBe('node');
	});

	it('validates empty config', () => {
		const result = validate_claude_config({});
		expect(result.mcpServers).toBeUndefined();
	});
});

describe('validate_server_registry', () => {
	it('validates registry with portable servers', () => {
		const result = validate_server_registry({
			version: 3,
			servers: [
				{ name: 'a', transport: 'stdio', command: 'node' },
				{ name: 'b', transport: 'sse', url: 'https://x.com' },
			],
		});
		expect(result.servers).toHaveLength(2);
	});

	it('validates empty registry', () => {
		const result = validate_server_registry({
			version: 3,
			servers: [],
		});
		expect(result.servers).toEqual([]);
	});

	it('rejects registry without servers array', () => {
		expect(() => validate_server_registry({})).toThrow();
	});
});
