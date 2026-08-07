import { defineCommand } from 'citty';
import { serve_stdio } from '../../mcp/server.js';

export default defineCommand({
	meta: {
		name: 'serve',
		description: `Expose mcpick as an MCP server over stdio.

For LLM agents: this speaks JSON-RPC (MCP) on stdin/stdout, so stdout is
protocol traffic — never print anything else here. Point a client at it
with a config block like:

  {"mcpServers": {"mcpick": {"command": "mcpick", "args": ["serve"]}}}

Tools exposed: mcpick_list, mcpick_clients, mcpick_get, mcpick_doctor
(read-only) plus mcpick's mutation tools. Prefer these over shelling out
to the CLI when running inside an MCP-capable client.`,
	},
	async run() {
		// listen() keeps the event loop alive on stdin; it closes on EOF.
		serve_stdio();
	},
});
