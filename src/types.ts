export interface McpServer {
	name: string;
	type?: 'stdio' | 'sse' | 'http';
	command: string;
	args: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	description?: string;
	estimated_tokens?: number;
}

export interface ClaudeConfig {
	mcpServers?: {
		[key: string]: Omit<McpServer, 'name'>;
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
	| 'launch'
	| 'exit';
