import { McpScope } from '../types.js';
import {
	get_claude_config_path,
	get_project_mcp_json_path,
} from '../utils/paths.js';

export interface CliMutationContext {
	operation: 'add' | 'remove' | 'enable' | 'disable';
	client: 'claude-code';
	scope: McpScope;
	location: string;
	servers: string[];
}

export function claude_mutation_context(
	operation: CliMutationContext['operation'],
	scope: McpScope,
	servers: string[],
): CliMutationContext {
	return {
		operation,
		client: 'claude-code',
		scope,
		location:
			scope === 'project'
				? get_project_mcp_json_path()
				: get_claude_config_path(),
		servers,
	};
}

export function print_mutation_details(input: {
	location?: string;
	backup_path?: string;
}): void {
	if (input.location) console.log(`Config: ${input.location}`);
	if (input.backup_path) console.log(`Backup: ${input.backup_path}`);
}
