import { defineCommand } from 'citty';
import { output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'reload',
		description: 'Reload plugins in Claude Code',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const info = {
			supported: false,
			message:
				'Claude Code does not expose a programmatic reload API.',
			instructions: [
				'Run /reload-plugins inside an active Claude Code session',
				'Or restart your Claude Code session to pick up changes',
			],
		};

		if (args.json) {
			output(info, true);
		} else {
			console.log(info.message);
			console.log('\nTo reload plugins:');
			for (const instruction of info.instructions) {
				console.log(`  - ${instruction}`);
			}
		}
	},
});
