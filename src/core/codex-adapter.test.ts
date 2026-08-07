import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
	ClientConfigLocation,
	McpClientAdapter,
} from './client-config.js';
import { codex_adapter } from './codex-adapter.js';

// The adapter under test implements every optional write method.
const adapter = codex_adapter as Required<McpClientAdapter>;

const original_home = process.env.HOME;
let home: string;
let location: ClientConfigLocation;

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), 'mcpick-codex-'));
	process.env.HOME = home;
	location = codex_adapter.locations()[0];
});

afterEach(() => {
	if (original_home === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = original_home;
	}
});

async function read_config(): Promise<string> {
	return readFile(location.path, 'utf-8');
}

describe('codex_adapter locations', () => {
	it('is user-scope only at ~/.codex/config.toml', () => {
		const locations = codex_adapter.locations();
		expect(locations).toHaveLength(1);
		expect(locations[0].scope).toBe('user');
		expect(locations[0].path).toBe(
			join(home, '.codex', 'config.toml'),
		);
	});
});

describe('read', () => {
	it('returns empty when the file does not exist', async () => {
		expect(await adapter.readLocation(location)).toEqual([]);
	});

	it('reads stdio and http servers from mcp_servers tables', async () => {
		await mkdir(join(home, '.codex'), { recursive: true });
		await writeFile(
			location.path,
			[
				'[mcp_servers.probe]',
				'command = "npx"',
				'args = ["-y", "some-mcp@1.2.3"]',
				'',
				'[mcp_servers.probe.env]',
				'FOO = "bar"',
				'',
				'[mcp_servers.remote]',
				'url = "https://example.com/mcp"',
				'',
			].join('\n'),
		);

		const servers = await adapter.readLocation(location);
		expect(servers).toHaveLength(2);

		const probe = servers.find((s) => s.name === 'probe');
		expect(probe).toMatchObject({
			transport: 'stdio',
			command: 'npx',
			args: ['-y', 'some-mcp@1.2.3'],
			env: { FOO: 'bar' },
		});

		const remote = servers.find((s) => s.name === 'remote');
		expect(remote).toMatchObject({
			url: 'https://example.com/mcp',
		});
		expect(remote?.command).toBeUndefined();
	});

	it('maps enabled = false to disabled', async () => {
		await mkdir(join(home, '.codex'), { recursive: true });
		await writeFile(
			location.path,
			'[mcp_servers.off]\ncommand = "npx"\nenabled = false\n',
		);
		const servers = await adapter.readLocation(location);
		expect(servers[0].disabled).toBe(true);
	});
});

describe('write_server', () => {
	it('creates the config with a TOML table for the server', async () => {
		await adapter.write_server(location, {
			name: 'test',
			transport: 'stdio',
			command: 'npx',
			args: ['-y', 'some-mcp@1.0.0'],
			env: { API_KEY: '${API_KEY}' },
		});

		const content = await read_config();
		expect(content).toContain('[mcp_servers.test]');
		expect(content).toContain('command = "npx"');
		const servers = await adapter.readLocation(location);
		expect(servers[0]).toMatchObject({
			name: 'test',
			command: 'npx',
			args: ['-y', 'some-mcp@1.0.0'],
			env: { API_KEY: '${API_KEY}' },
		});
	});

	it('preserves unrelated top-level config on write', async () => {
		await mkdir(join(home, '.codex'), { recursive: true });
		await writeFile(
			location.path,
			'model = "gpt-5"\napproval_policy = "never"\n',
		);

		await adapter.write_server(location, {
			name: 'test',
			transport: 'stdio',
			command: 'npx',
		});

		const content = await read_config();
		expect(content).toContain('model = "gpt-5"');
		expect(content).toContain('approval_policy = "never"');
		expect(content).toContain('[mcp_servers.test]');
	});

	it('round-trips codex-specific extras via client_options', async () => {
		await adapter.write_server(location, {
			name: 'remote',
			transport: 'http',
			url: 'https://example.com/mcp',
			client_options: { bearer_token_env_var: 'MCP_TOKEN' },
		});

		const servers = await adapter.readLocation(location);
		expect(servers[0]).toMatchObject({
			url: 'https://example.com/mcp',
		});
		expect(servers[0].client_options).toMatchObject({
			bearer_token_env_var: 'MCP_TOKEN',
		});
	});
});

describe('writeEnabled', () => {
	it('writes native enabled keys', async () => {
		await adapter.write_server(location, {
			name: 'one',
			transport: 'stdio',
			command: 'npx',
		});
		await adapter.write_server(location, {
			name: 'two',
			transport: 'stdio',
			command: 'node',
		});

		await adapter.writeEnabled(location, ['one']);

		const servers = await adapter.readLocation(location);
		expect(
			servers.find((s) => s.name === 'one')?.disabled,
		).toBeFalsy();
		expect(servers.find((s) => s.name === 'two')?.disabled).toBe(
			true,
		);
	});
});

describe('remove_server', () => {
	it('removes the server table and keeps others', async () => {
		await adapter.write_server(location, {
			name: 'one',
			transport: 'stdio',
			command: 'npx',
		});
		await adapter.write_server(location, {
			name: 'two',
			transport: 'stdio',
			command: 'node',
		});

		await adapter.remove_server(location, 'one');

		const servers = await adapter.readLocation(location);
		expect(servers.map((s) => s.name)).toEqual(['two']);
	});
});

describe('write_server_config / write_servers', () => {
	it('writes raw config objects verbatim', async () => {
		await adapter.write_server_config(location, 'raw', {
			command: 'npx',
			args: ['-y', 'pkg@1.0.0'],
			startup_timeout_sec: 30,
		});
		const servers = await adapter.readLocation(location);
		expect(servers[0].command).toBe('npx');
		expect(servers[0].client_options).toMatchObject({
			startup_timeout_sec: 30,
		});
	});

	it('replaces the whole server map with write_servers', async () => {
		await adapter.write_server(location, {
			name: 'old',
			transport: 'stdio',
			command: 'npx',
		});
		await adapter.write_servers(location, [
			{ name: 'new', transport: 'stdio', command: 'node' },
		]);
		const servers = await adapter.readLocation(location);
		expect(servers.map((s) => s.name)).toEqual(['new']);
	});
});

describe('safe_toml_write', () => {
	it('creates a .toml backup of existing content', async () => {
		await adapter.write_server(location, {
			name: 'one',
			transport: 'stdio',
			command: 'npx',
		});
		const result = await adapter.write_server(location, {
			name: 'two',
			transport: 'stdio',
			command: 'node',
		});
		expect(result.backup_path).toBeDefined();
		expect(result.backup_path).toMatch(/\.toml$/);
		const backup = await readFile(result.backup_path!, 'utf-8');
		expect(backup).toContain('[mcp_servers.one]');
	});

	it('restores the original content when the write fails', async () => {
		await adapter.write_server(location, {
			name: 'one',
			transport: 'stdio',
			command: 'npx',
		});
		const before = await read_config();

		// smol-toml cannot serialize non-JSON values like functions —
		// force a stringify failure mid-write.
		await expect(
			adapter.write_server_config(location, 'broken', {
				command: () => undefined,
			} as never),
		).rejects.toThrow();

		expect(await read_config()).toBe(before);
	});
});
