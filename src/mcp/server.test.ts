import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import type { GenericSchema } from 'valibot';
import { afterEach, describe, expect, it } from 'vitest';
import { register_read_only_tools } from './tools-read-only.js';

const original_cwd = process.cwd();
const original_home = process.env.HOME;
const original_config_dir = process.env.CLAUDE_CONFIG_DIR;

afterEach(() => {
	process.chdir(original_cwd);
	if (original_home === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = original_home;
	}
	if (original_config_dir === undefined) {
		delete process.env.CLAUDE_CONFIG_DIR;
	} else {
		process.env.CLAUDE_CONFIG_DIR = original_config_dir;
	}
});

async function temp_env(): Promise<{
	home: string;
	project: string;
}> {
	const home = await mkdtemp(join(tmpdir(), 'mcpick-mcp-home-'));
	const project = await mkdtemp(join(tmpdir(), 'mcpick-mcp-proj-'));
	process.env.HOME = home;
	delete process.env.CLAUDE_CONFIG_DIR;
	process.chdir(project);
	return { home, project };
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number;
	result?: unknown;
	error?: { code: number; message: string };
}

let next_id = 0;

/**
 * Spin up a server with only the read-only tools (Peer B's module is
 * intentionally not involved) and round-trip JSON-RPC messages through
 * receive(), the same entry point the stdio transport uses.
 */
function create_read_only_server(): McpServer<GenericSchema> {
	const server = new McpServer(
		{ name: 'mcpick-test', version: '0.0.0' },
		{
			adapter: new ValibotJsonSchemaAdapter(),
			capabilities: { tools: { listChanged: false } },
		},
	);
	register_read_only_tools(server);
	return server;
}

async function rpc(
	server: McpServer<GenericSchema>,
	method: string,
	params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
	const response = (await server.receive({
		jsonrpc: '2.0',
		id: ++next_id,
		method,
		params,
	})) as JsonRpcResponse;
	expect(response.error).toBeUndefined();
	return response;
}

async function call_tool(
	server: McpServer<GenericSchema>,
	name: string,
	args: Record<string, unknown>,
): Promise<{
	isError?: boolean;
	content: Array<{ type: string; text: string }>;
	structuredContent?: Record<string, unknown>;
}> {
	const response = await rpc(server, 'tools/call', {
		name,
		arguments: args,
	});
	return response.result as {
		isError?: boolean;
		content: Array<{ type: string; text: string }>;
		structuredContent?: Record<string, unknown>;
	};
}

describe('read-only MCP tools', () => {
	it('lists the four read-only tools with safe annotations', async () => {
		await temp_env();
		const server = create_read_only_server();
		const response = await rpc(server, 'tools/list');
		const { tools } = response.result as {
			tools: Array<{
				name: string;
				annotations?: Record<string, boolean>;
			}>;
		};
		const names = tools.map((tool) => tool.name).sort();
		expect(names).toEqual([
			'mcpick_clients',
			'mcpick_doctor',
			'mcpick_get',
			'mcpick_list',
		]);
		for (const tool of tools) {
			expect(tool.annotations).toMatchObject({
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			});
		}
	});

	it('mcpick_clients returns the adapter matrix', async () => {
		await temp_env();
		const server = create_read_only_server();
		const result = await call_tool(server, 'mcpick_clients', {});
		const clients = result.structuredContent?.clients as Array<{
			id: string;
			label: string;
			locations: Array<{ scope: string; path: string }>;
		}>;
		const ids = clients.map((entry) => entry.id);
		expect(ids).toContain('claude-code');
		expect(ids).toContain('vscode');
		expect(ids).toContain('opencode');
		for (const entry of clients) {
			expect(entry.locations.length).toBeGreaterThan(0);
		}
	});

	it('mcpick_list reads a client config and redacts secrets', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.vscode'), { recursive: true });
		await writeFile(
			join(project, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					memory: {
						command: 'node',
						args: ['-y', 'server-memory@1.2.3'],
						env: { GITHUB_TOKEN: 'ghp_abcdefghijklmnopqrstuvwx' },
					},
				},
			}),
		);

		const server = create_read_only_server();
		const result = await call_tool(server, 'mcpick_list', {
			client: 'vscode',
		});
		const data = result.structuredContent ?? {};
		expect(data.client).toBe('vscode');
		const servers = data.servers as Array<{
			name: string;
			env?: Record<string, string>;
		}>;
		expect(servers).toHaveLength(1);
		expect(servers[0].name).toBe('memory');
		// the token value must never leave the tool
		expect(JSON.stringify(result)).not.toContain(
			'ghp_abcdefghijklmnopqrstuvwx',
		);
	});

	it('mcpick_list rejects unknown clients with an error result', async () => {
		await temp_env();
		const server = create_read_only_server();
		const result = await call_tool(server, 'mcpick_list', {
			client: 'nope',
		});
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Unknown client 'nope'");
	});

	it('mcpick_get finds a server in a client config', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.cursor'), { recursive: true });
		await writeFile(
			join(project, '.cursor/mcp.json'),
			JSON.stringify({
				mcpServers: {
					db: { command: 'node', args: ['db-server.js'] },
				},
			}),
		);

		const server = create_read_only_server();
		const found = await call_tool(server, 'mcpick_get', {
			name: 'db',
			client: 'cursor',
		});
		expect(found.structuredContent?.client).toBe('cursor');
		expect(found.structuredContent?.server).toMatchObject({
			name: 'db',
			command: 'node',
		});

		const missing = await call_tool(server, 'mcpick_get', {
			name: 'nope',
			client: 'cursor',
		});
		expect(missing.isError).toBe(true);
	});

	it('mcpick_doctor returns the full report as structured content', async () => {
		const { project } = await temp_env();
		await mkdir(join(project, '.vscode'), { recursive: true });
		await writeFile(join(project, '.vscode/mcp.json'), '{ broken ');

		const server = create_read_only_server();
		const result = await call_tool(server, 'mcpick_doctor', {
			client: 'vscode',
		});
		const data = result.structuredContent ?? {};
		expect(data.summary).toMatchObject({ errors: 1 });
		const issues = data.issues as Array<{
			check: string;
			client: string;
		}>;
		expect(issues[0]).toMatchObject({
			check: 'config-parse',
			client: 'vscode',
		});
	});
});
