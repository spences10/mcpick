import { defineCommand } from 'citty';
import {
	marketplace_add_via_cli,
	marketplace_list_via_cli,
	marketplace_remove_via_cli,
	marketplace_update_via_cli,
} from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

const list = defineCommand({
	meta: {
		name: 'list',
		description: 'List configured marketplaces',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await marketplace_list_via_cli();

		if (!result.success) {
			error(result.error || 'Unknown error');
		}

		if (args.json) {
			// Try to parse CLI JSON output, fallback to raw
			try {
				const parsed = JSON.parse(result.stdout || '[]');
				output(parsed, true);
			} catch {
				output({ marketplaces: result.stdout }, true);
			}
		} else {
			console.log(result.stdout || 'No marketplaces configured.');
		}
	},
});

const add = defineCommand({
	meta: {
		name: 'add',
		description: 'Add a marketplace from URL, path, or GitHub repo',
	},
	args: {
		source: {
			type: 'positional',
			description:
				'Marketplace source (GitHub repo, URL, or local path)',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await marketplace_add_via_cli(args.source);

		if (args.json) {
			output(
				{
					added: args.source,
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(`Marketplace added: ${args.source}`);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

const remove = defineCommand({
	meta: {
		name: 'remove',
		description: 'Remove a marketplace',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Marketplace name to remove',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await marketplace_remove_via_cli(args.name);

		if (args.json) {
			output(
				{
					removed: args.name,
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(`Marketplace removed: ${args.name}`);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

const update = defineCommand({
	meta: {
		name: 'update',
		description: 'Update marketplace(s) from source',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Marketplace name to update (omit to update all)',
			required: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await marketplace_update_via_cli(
			args.name || undefined,
		);

		if (args.json) {
			output(
				{
					updated: args.name || 'all',
					success: result.success,
					error: result.error,
				},
				true,
			);
		} else if (result.success) {
			console.log(
				args.name
					? `Marketplace updated: ${args.name}`
					: 'All marketplaces updated.',
			);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

export default defineCommand({
	meta: {
		name: 'marketplace',
		description: 'Manage Claude Code plugin marketplaces',
	},
	subCommands: {
		list,
		add,
		remove,
		update,
	},
});
