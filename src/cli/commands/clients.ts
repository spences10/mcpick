import { defineCommand } from 'citty';
import { list_client_locations } from '../../core/client-config.js';
import { output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'clients',
		description:
			'List supported MCP clients and known config locations',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const locations = await list_client_locations();

		if (args.json) {
			output(locations, true);
			return;
		}

		for (const location of locations) {
			const status = location.exists ? 'found' : 'missing';
			console.log(
				`${location.client}:${location.scope}  ${status}  ${location.path}`,
			);
		}
	},
});
