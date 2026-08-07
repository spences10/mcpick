import { readFileSync } from 'node:fs';
import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { StdioTransport } from '@tmcp/transport-stdio';
import type { GenericSchema } from 'valibot';
import { register_mutation_tools } from './tools-mutations.js';
import { register_read_only_tools } from './tools-read-only.js';

/**
 * Resolve the mcpick version from package.json. The source tree is two
 * levels deep (src/mcp) while the bundled dist output is one (dist), so
 * try both.
 */
function mcpick_version(): string {
	for (const relative of ['../../package.json', '../package.json']) {
		try {
			const data: unknown = JSON.parse(
				readFileSync(new URL(relative, import.meta.url), 'utf-8'),
			);
			if (
				data &&
				typeof data === 'object' &&
				'version' in data &&
				typeof data.version === 'string'
			) {
				return data.version;
			}
		} catch {
			// try the next candidate path
		}
	}
	return '0.0.0';
}

/**
 * Build the mcpick MCP server: read-only tools (this module's sibling)
 * plus mutation tools (Peer B's module). Stateless per the 2026-07-28
 * spec — every tool call maps to a pure core-function invocation.
 */
export function create_mcp_server(): McpServer<GenericSchema> {
	const server = new McpServer(
		{
			name: 'mcpick',
			version: mcpick_version(),
			description:
				'Vendor-neutral MCP configuration manager: list, inspect, diagnose, and mutate MCP client configs as tools.',
		},
		{
			adapter: new ValibotJsonSchemaAdapter(),
			capabilities: { tools: { listChanged: false } },
		},
	);
	register_read_only_tools(server);
	register_mutation_tools(server);
	return server;
}

/**
 * Serve over stdio. The transport reads stdin and closes when it ends,
 * so the process shuts down cleanly on EOF instead of lingering.
 */
export function serve_stdio(): void {
	new StdioTransport(create_mcp_server()).listen();
}
