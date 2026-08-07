import {
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { register_mutation_tools as register_type } from './tools-mutations.js';
import { register_mutation_tools } from './tools-mutations.js';

type ToolHandler = (
	args: Record<string, unknown>,
	extra?: unknown,
) => Promise<{
	content: Array<{ type: string; text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}>;

interface RegisteredTool {
	config: {
		description?: string;
		annotations?: Record<string, unknown>;
	};
	handler: ToolHandler;
}

function fake_server(): Map<string, RegisteredTool> {
	const tools = new Map<string, RegisteredTool>();
	const server = {
		tool(
			options: RegisteredTool['config'] & { name: string },
			handler: ToolHandler,
		) {
			tools.set(options.name, { config: options, handler });
		},
	};
	register_mutation_tools(
		server as unknown as Parameters<typeof register_type>[0],
	);
	return tools;
}

async function call(
	tools: Map<string, RegisteredTool>,
	name: string,
	args: Record<string, unknown>,
) {
	const tool = tools.get(name);
	if (!tool) throw new Error(`tool ${name} not registered`);
	return tool.handler(args, {});
}

const original_home = process.env.HOME;
let home: string;

async function cursor_config_path(): Promise<string> {
	return join(home, '.cursor', 'mcp.json');
}

async function read_cursor_config(): Promise<{
	mcpServers: Record<string, Record<string, unknown>>;
}> {
	const path = await cursor_config_path();
	return JSON.parse(await readFile(path, 'utf8'));
}

async function seed_cursor_config(
	servers: Record<string, Record<string, unknown>>,
): Promise<void> {
	const path = await cursor_config_path();
	await mkdir(join(home, '.cursor'), { recursive: true });
	await writeFile(path, JSON.stringify({ mcpServers: servers }));
}

beforeEach(async () => {
	home = await mkdtemp(join(tmpdir(), 'mcpick-mcp-tools-'));
	process.env.HOME = home;
});

afterEach(() => {
	if (original_home === undefined) {
		delete process.env.HOME;
	} else {
		process.env.HOME = original_home;
	}
	delete process.env.MCPICK_TEST_TOKEN;
});

describe('register_mutation_tools', () => {
	it('registers exactly the five mutation tools', () => {
		const tools = fake_server();
		expect([...tools.keys()].sort()).toEqual([
			'mcpick_add',
			'mcpick_add_json',
			'mcpick_disable',
			'mcpick_enable',
			'mcpick_remove',
		]);
	});

	it('annotates enable/disable as idempotent non-destructive', () => {
		const tools = fake_server();
		for (const name of ['mcpick_enable', 'mcpick_disable']) {
			expect(tools.get(name)?.config.annotations).toEqual({
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			});
		}
	});

	it('annotates remove/add/add-json as destructive', () => {
		const tools = fake_server();
		for (const name of [
			'mcpick_remove',
			'mcpick_add',
			'mcpick_add_json',
		]) {
			expect(
				tools.get(name)?.config.annotations?.destructiveHint,
			).toBe(true);
		}
	});

	it('mentions rollback backups in tool descriptions', () => {
		const tools = fake_server();
		for (const tool of tools.values()) {
			expect(tool.config.description).toContain('backup');
			expect(tool.config.description).toContain('rollback');
		}
	});
});

describe('mcpick_add', () => {
	it('adds a stdio server to a client config', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'test-server',
			command: 'npx',
			args: ['-y', 'some-mcp@1.2.3'],
			client: 'cursor',
			scope: 'user',
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent?.added).toBe('test-server');
		expect(result.structuredContent?.client).toBe('cursor');
		expect(result.structuredContent?.scope).toBe('user');
		expect(result.structuredContent?.location).toContain('.cursor');

		const config = await read_cursor_config();
		expect(config.mcpServers['test-server']).toMatchObject({
			command: 'npx',
			args: ['-y', 'some-mcp@1.2.3'],
		});
	});

	it('resolves from_env values into the written config', async () => {
		process.env.MCPICK_TEST_TOKEN = 'plain-test-value';
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'env-server',
			command: 'npx',
			args: ['-y', 'some-mcp@1.0.0'],
			client: 'cursor',
			scope: 'user',
			from_env: ['MCPICK_TEST_TOKEN'],
		});

		expect(result.isError).toBeUndefined();
		const config = await read_cursor_config();
		expect(
			(config.mcpServers['env-server'].env as Record<string, string>)
				.MCPICK_TEST_TOKEN,
		).toBe('plain-test-value');
	});

	it('fails before any write when a from_env variable is missing', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'env-server',
			command: 'npx',
			client: 'cursor',
			scope: 'user',
			from_env: ['MCPICK_TEST_TOKEN'],
		});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('MCPICK_TEST_TOKEN');
		expect(result.content[0].text).toContain('not set');
		await expect(read_cursor_config()).rejects.toThrow();
	});

	it('returns warnings for secret-looking values without leaking them', async () => {
		const secret = 'ghp_mcpicktesttoken1234567890';
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'secret-server',
			command: 'npx',
			args: ['-y', 'some-mcp@1.0.0'],
			env: { GITHUB_TOKEN: secret },
			client: 'cursor',
			scope: 'user',
		});

		expect(result.isError).toBeUndefined();
		const warnings = result.structuredContent?.warnings as Array<{
			key: string;
			pattern: string;
			remediation: string;
		}>;
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0].key).toBe('GITHUB_TOKEN');
		expect(JSON.stringify(result)).not.toContain(secret);

		// The real value is still written to the config (that is the
		// point of the write path; warnings are advisory).
		const config = await read_cursor_config();
		expect(
			(
				config.mcpServers['secret-server'].env as Record<
					string,
					string
				>
			).GITHUB_TOKEN,
		).toBe(secret);
	});

	it('warns on unpinned packages', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'unpinned',
			command: 'npx',
			args: ['-y', 'some-mcp'],
			client: 'cursor',
			scope: 'user',
		});

		const warnings = result.structuredContent?.warnings as Array<{
			pattern: string;
		}>;
		expect(warnings.map((w) => w.pattern)).toContain(
			'unpinned-version',
		);
	});

	it('returns isError for stdio without a command', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add', {
			name: 'broken',
			client: 'cursor',
			scope: 'user',
		});
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('command');
	});
});

describe('mcpick_add_json', () => {
	it('adds a server from a config object', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add_json', {
			name: 'json-server',
			config: {
				command: 'npx',
				args: ['-y', 'some-mcp@2.0.0'],
			},
			client: 'cursor',
			scope: 'user',
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent?.added).toBe('json-server');
		const config = await read_cursor_config();
		expect(config.mcpServers['json-server']).toMatchObject({
			command: 'npx',
			args: ['-y', 'some-mcp@2.0.0'],
		});
	});

	it('merges from_env into the config env object', async () => {
		process.env.MCPICK_TEST_TOKEN = 'merged-value';
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add_json', {
			name: 'json-env-server',
			config: {
				command: 'npx',
				args: ['-y', 'some-mcp@2.0.0'],
				env: { LOG_LEVEL: 'debug' },
			},
			client: 'cursor',
			scope: 'user',
			from_env: ['MCPICK_TEST_TOKEN'],
		});

		expect(result.isError).toBeUndefined();
		const config = await read_cursor_config();
		expect(config.mcpServers['json-env-server'].env).toEqual({
			LOG_LEVEL: 'debug',
			MCPICK_TEST_TOKEN: 'merged-value',
		});
	});

	it('fails before any write when a from_env variable is missing', async () => {
		const tools = fake_server();
		const result = await call(tools, 'mcpick_add_json', {
			name: 'json-env-server',
			config: { command: 'npx' },
			client: 'cursor',
			scope: 'user',
			from_env: ['MCPICK_TEST_TOKEN'],
		});

		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('MCPICK_TEST_TOKEN');
		await expect(read_cursor_config()).rejects.toThrow();
	});
});

describe('mcpick_enable / mcpick_disable', () => {
	it('disables and re-enables a server in a client config', async () => {
		await seed_cursor_config({
			'test-server': { command: 'npx', args: ['-y', 'pkg@1.0.0'] },
		});
		const tools = fake_server();

		const disabled = await call(tools, 'mcpick_disable', {
			name: 'test-server',
			client: 'cursor',
			scope: 'user',
		});
		expect(disabled.isError).toBeUndefined();
		expect(disabled.structuredContent?.disabled).toBe('test-server');
		let config = await read_cursor_config();
		expect(config.mcpServers['test-server'].disabled).toBe(true);

		const enabled = await call(tools, 'mcpick_enable', {
			name: 'test-server',
			client: 'cursor',
			scope: 'user',
		});
		expect(enabled.isError).toBeUndefined();
		expect(enabled.structuredContent?.enabled).toBe('test-server');
		config = await read_cursor_config();
		expect(config.mcpServers['test-server'].disabled ?? false).toBe(
			false,
		);
	});

	it('returns isError for an unknown server', async () => {
		await seed_cursor_config({});
		const tools = fake_server();
		const result = await call(tools, 'mcpick_enable', {
			name: 'missing',
			client: 'cursor',
			scope: 'user',
		});
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain('missing');
	});
});

describe('mcpick_remove', () => {
	it('removes a server from a client config', async () => {
		await seed_cursor_config({
			'test-server': { command: 'npx' },
			'other-server': { command: 'node' },
		});
		const tools = fake_server();
		const result = await call(tools, 'mcpick_remove', {
			name: 'test-server',
			client: 'cursor',
			scope: 'user',
		});

		expect(result.isError).toBeUndefined();
		expect(result.structuredContent?.removed).toBe('test-server');
		const config = await read_cursor_config();
		expect(config.mcpServers['test-server']).toBeUndefined();
		expect(config.mcpServers['other-server']).toBeDefined();
	});
});
