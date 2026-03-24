import { defineCommand } from 'citty';
import { mcp_get_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'get',
		description: 'Get details about an MCP server',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Server name',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await mcp_get_via_cli(args.name);

		if (args.json) {
			try {
				const parsed = JSON.parse(result.stdout || '{}');
				output(parsed, true);
			} catch {
				output(
					{
						name: args.name,
						success: result.success,
						output: result.stdout,
						error: result.error,
					},
					true,
				);
			}
		} else if (result.success) {
			console.log(result.stdout || 'No details available.');
		} else {
			error(result.error || 'Unknown error');
		}
	},
});
