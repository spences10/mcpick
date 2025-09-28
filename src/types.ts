export interface McpServer {
	name: string;
	command: string;
	args: string[];
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
