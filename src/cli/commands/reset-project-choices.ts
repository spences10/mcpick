import { defineCommand } from 'citty';
import { mcp_reset_project_choices_via_cli } from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'reset-project-choices',
		description:
			'Reset all approved and rejected project-scoped MCP servers',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await mcp_reset_project_choices_via_cli();

		if (args.json) {
			output(
				{
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log('Project MCP server choices have been reset.');
		} else {
			error(result.error || 'Unknown error');
		}
	},
});
