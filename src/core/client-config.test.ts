import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	add_client_server,
	add_client_server_config,
	get_client_adapter,
	list_client_locations,
	normalize_mcp_server,
	remove_client_server,
	resolve_client_location,
	set_client_enabled_servers,
	set_client_server_enabled,
} from './client-config.js';

let original_cwd = process.cwd();

afterEach(() => {
	process.chdir(original_cwd);
});

async function temp_project(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'mcpick-client-config-'));
	process.chdir(dir);
	return dir;
}

describe('normalize_mcp_server', () => {
	it('normalizes stdio servers', () => {
		expect(
			normalize_mcp_server('filesystem', {
				command: 'npx',
				args: ['-y', '@modelcontextprotocol/server-filesystem'],
				env: { NODE_ENV: 'production', ignored: 123 },
				disabled: false,
				alwaysAllow: ['read_file'],
			}),
		).toEqual({
			name: 'filesystem',
			transport: 'stdio',
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-filesystem'],
			env: { NODE_ENV: 'production' },
			disabled: false,
			client_options: { alwaysAllow: ['read_file'] },
		});
	});

	it('normalizes Gemini httpUrl as HTTP', () => {
		expect(
			normalize_mcp_server('google-docs', {
				httpUrl: 'https://developerknowledge.googleapis.com/mcp',
				headers: { 'X-Goog-Api-Key': '$GOOGLE_API_KEY' },
			}),
		).toEqual({
			name: 'google-docs',
			transport: 'http',
			url: 'https://developerknowledge.googleapis.com/mcp',
			headers: { 'X-Goog-Api-Key': '$GOOGLE_API_KEY' },
		});
	});

	it('normalizes explicit SSE transport', () => {
		expect(
			normalize_mcp_server('legacy', {
				type: 'sse',
				url: 'https://example.com/sse',
			}),
		).toEqual({
			name: 'legacy',
			transport: 'sse',
			url: 'https://example.com/sse',
		});
	});

	it('normalizes OpenCode local servers', () => {
		expect(
			normalize_mcp_server('everything', {
				type: 'local',
				command: [
					'npx',
					'-y',
					'@modelcontextprotocol/server-everything',
				],
				environment: { DEBUG: 'true' },
				enabled: false,
				timeout: 5000,
			}),
		).toEqual({
			name: 'everything',
			transport: 'stdio',
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-everything'],
			env: { DEBUG: 'true' },
			disabled: true,
			client_options: { timeout: 5000 },
		});
	});

	it('normalizes OpenCode remote servers', () => {
		expect(
			normalize_mcp_server('sentry', {
				type: 'remote',
				url: 'https://mcp.sentry.dev/mcp',
				enabled: true,
				oauth: { scopes: ['project:read'] },
			}),
		).toEqual({
			name: 'sentry',
			transport: 'http',
			url: 'https://mcp.sentry.dev/mcp',
			disabled: false,
			client_options: { oauth: { scopes: ['project:read'] } },
		});
	});
});

describe('client adapters', () => {
	it('reads Gemini project settings', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.gemini'), { recursive: true });
		await writeFile(
			join(dir, '.gemini/settings.json'),
			JSON.stringify({
				mcpServers: {
					context7: {
						command: 'npx',
						args: ['-y', '@upstash/context7-mcp'],
					},
				},
			}),
		);

		const adapter = get_client_adapter('gemini-cli');
		expect(adapter).not.toBeNull();
		await expect(adapter!.read('project')).resolves.toEqual([
			{
				name: 'context7',
				transport: 'stdio',
				command: 'npx',
				args: ['-y', '@upstash/context7-mcp'],
			},
		]);
	});

	it('reads VS Code project mcp.json servers', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.vscode'), { recursive: true });
		await writeFile(
			join(dir, '.vscode/mcp.json'),
			JSON.stringify({
				servers: {
					memory: {
						type: 'stdio',
						command: 'npx',
						args: ['-y', '@modelcontextprotocol/server-memory'],
					},
				},
			}),
		);

		const adapter = get_client_adapter('vscode');
		expect(adapter).not.toBeNull();
		await expect(adapter!.read('project')).resolves.toEqual([
			{
				name: 'memory',
				transport: 'stdio',
				command: 'npx',
				args: ['-y', '@modelcontextprotocol/server-memory'],
			},
		]);
	});

	it('reads OpenCode project JSONC config', async () => {
		const dir = await temp_project();
		await writeFile(
			join(dir, 'opencode.json'),
			`{
				// OpenCode supports JSONC config files.
				"mcp": {
					"everything": {
						"type": "local",
						"command": [
							"npx",
							"-y",
							"@modelcontextprotocol/server-everything",
						],
						"enabled": true,
					},
				},
			}`,
		);

		const adapter = get_client_adapter('opencode');
		expect(adapter).not.toBeNull();
		await expect(adapter!.read('project')).resolves.toEqual([
			{
				name: 'everything',
				transport: 'stdio',
				command: 'npx',
				args: ['-y', '@modelcontextprotocol/server-everything'],
				disabled: false,
			},
		]);
	});

	it('toggles JSON client servers with disabled flags', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.vscode'), { recursive: true });
		const config_path = join(dir, '.vscode/mcp.json');
		await writeFile(
			config_path,
			JSON.stringify({
				servers: {
					memory: { command: 'npx', args: ['memory'] },
					filesystem: { command: 'npx', args: ['filesystem'] },
				},
			}),
		);

		const adapter = get_client_adapter('vscode');
		expect(adapter?.writeEnabled).toBeDefined();
		await adapter!.writeEnabled!(adapter!.locations()[0], ['memory']);

		const written = JSON.parse(await readFile(config_path, 'utf-8'));
		expect(written.servers.memory.disabled).toBe(false);
		expect(written.servers.filesystem.disabled).toBe(true);
	});

	it('toggles OpenCode servers with enabled flags', async () => {
		const dir = await temp_project();
		const config_path = join(dir, 'opencode.json');
		await writeFile(
			config_path,
			JSON.stringify({
				mcp: {
					everything: { command: ['npx', 'everything'] },
					sentry: { type: 'remote', url: 'https://mcp.example' },
				},
			}),
		);

		const adapter = get_client_adapter('opencode');
		expect(adapter?.writeEnabled).toBeDefined();
		await adapter!.writeEnabled!(adapter!.locations()[0], ['sentry']);

		const written = JSON.parse(await readFile(config_path, 'utf-8'));
		expect(written.mcp.everything.enabled).toBe(false);
		expect(written.mcp.everything.disabled).toBeUndefined();
		expect(written.mcp.sentry.enabled).toBe(true);
	});

	it('sets enabled servers through the shared adapter service', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.vscode'), { recursive: true });
		const config_path = join(dir, '.vscode/mcp.json');
		await writeFile(
			config_path,
			JSON.stringify({
				servers: {
					memory: { command: 'npx', args: ['memory'] },
					filesystem: { command: 'npx', args: ['filesystem'] },
				},
			}),
		);

		const adapter = get_client_adapter('vscode');
		expect(adapter).not.toBeNull();
		const enabled_count = await set_client_enabled_servers(
			adapter!,
			adapter!.locations()[0],
			['filesystem'],
		);

		const written = JSON.parse(await readFile(config_path, 'utf-8'));
		expect(enabled_count).toBe(1);
		expect(written.servers.memory.disabled).toBe(true);
		expect(written.servers.filesystem.disabled).toBe(false);
	});

	it('adds and removes JSON client servers', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.vscode'), { recursive: true });
		const config_path = join(dir, '.vscode/mcp.json');
		const adapter = get_client_adapter('vscode');
		expect(adapter).not.toBeNull();
		const location = resolve_client_location(adapter!, 'project');

		await add_client_server(adapter!, location, {
			name: 'memory',
			transport: 'stdio',
			command: 'npx',
			args: ['memory'],
		});
		await add_client_server_config(adapter!, location, 'remote', {
			type: 'http',
			url: 'https://mcp.example',
		});
		await set_client_server_enabled(
			adapter!,
			location,
			'remote',
			false,
		);
		await remove_client_server(adapter!, location, 'memory');

		const written = JSON.parse(await readFile(config_path, 'utf-8'));
		expect(written.servers.memory).toBeUndefined();
		expect(written.servers.remote).toEqual({
			type: 'http',
			url: 'https://mcp.example',
			disabled: true,
		});
	});

	it('adds OpenCode servers with enabled flags', async () => {
		const dir = await temp_project();
		const config_path = join(dir, 'opencode.json');
		const adapter = get_client_adapter('opencode');
		expect(adapter).not.toBeNull();
		const location = resolve_client_location(adapter!, 'project');

		await add_client_server(adapter!, location, {
			name: 'sentry',
			transport: 'http',
			url: 'https://mcp.example',
			disabled: false,
		});

		const written = JSON.parse(await readFile(config_path, 'utf-8'));
		expect(written.mcp.sentry).toEqual({
			type: 'http',
			url: 'https://mcp.example',
			enabled: true,
		});
	});

	it('reads Pi MCP Adapter project config', async () => {
		const dir = await temp_project();
		await mkdir(join(dir, '.pi'), { recursive: true });
		await writeFile(
			join(dir, '.pi/mcp.json'),
			JSON.stringify({
				settings: { directTools: false },
				mcpServers: {
					chrome: {
						command: 'npx',
						args: ['-y', 'chrome-devtools-mcp@latest'],
						lifecycle: 'lazy',
						directTools: true,
					},
				},
			}),
		);

		const adapter = get_client_adapter('pi');
		expect(adapter).not.toBeNull();
		await expect(adapter!.read('project')).resolves.toEqual([
			{
				name: 'chrome',
				transport: 'stdio',
				command: 'npx',
				args: ['-y', 'chrome-devtools-mcp@latest'],
				client_options: { lifecycle: 'lazy', directTools: true },
			},
		]);
	});

	it('reports known client locations', async () => {
		await temp_project();
		const locations = await list_client_locations();
		expect(locations.map((location) => location.client)).toContain(
			'claude-code',
		);
		expect(locations.map((location) => location.client)).toContain(
			'gemini-cli',
		);
		expect(locations.map((location) => location.client)).toContain(
			'vscode',
		);
		expect(locations.map((location) => location.client)).toContain(
			'opencode',
		);
		expect(locations.map((location) => location.client)).toContain(
			'pi',
		);
		expect(
			locations.map((location) => location.client),
		).not.toContain('cline');
	});
});
