import { defineCommand } from 'citty';
import { McpScope } from '../../types.js';
import { mcp_add_json_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'add-json',
		description: 'Add an MCP server from a JSON configuration string',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Server name',
			required: true,
		},
		config: {
			type: 'positional',
			description: 'JSON configuration string',
			required: true,
		},
		scope: {
			type: 'string',
			description: 'Scope: local, project, or user (default: local)',
			default: 'local',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as McpScope;
		if (!['local', 'project', 'user'].includes(scope)) {
			error(`Invalid scope: ${scope}. Use local, project, or user.`);
		}

		// Validate the JSON is parseable
		try {
			JSON.parse(args.config);
		} catch {
			error(
				'Invalid JSON configuration. Provide a valid JSON string.',
			);
		}

		const result = await mcp_add_json_via_cli(
			args.name,
			args.config,
			scope,
		);

		if (args.json) {
			output(
				{
					added: args.name,
					scope,
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(`Added '${args.name}' from JSON (scope: ${scope})`);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});
