import * as v from 'valibot';
import {
	mcp_server_schema,
	mcp_server_schema_base,
} from './core/validation.js';

export type McpServer = v.InferOutput<typeof mcp_server_schema>;
export type McpServerBase = v.InferOutput<
	typeof mcp_server_schema_base
>;

export interface ClaudeConfig {
	mcpServers?: {
		[key: string]: McpServerBase;
	};
}

export interface ServerRegistry {
	servers: McpServer[];
}

export interface BackupInfo {
	filename: string;
	timestamp: Date;
	path: string;
}

export type MenuAction =
	| 'edit-config'
	| 'backup'
	| 'add-server'
	| 'restore'
	| 'load-profile'
	| 'save-profile'
	| 'launch-claude'
	| 'exit';

// Scope for MCP server installation
// - local: Project-specific in ~/.claude.json (default)
// - project: Shared via .mcp.json in project root
// - user: Global in ~/.claude.json for all projects
export type McpScope = 'local' | 'project' | 'user';
