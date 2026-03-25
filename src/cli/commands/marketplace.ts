import { defineCommand } from 'citty';
import {
	check_restored_hooks,
	redisable_restored_hooks,
} from '../../core/hook-state.js';
import { read_marketplace_manifest } from '../../core/plugin-cache.js';
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
		description:
			'Add a plugin marketplace (a catalog of installable plugins)',
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
			// Try to include available plugins in JSON output
			let available_plugins: string[] = [];
			if (result.success) {
				const manifests =
					await find_marketplace_plugins(args.source);
				available_plugins = manifests;
			}
			output(
				{
					added: args.source,
					success: result.success,
					error: result.error,
					available_plugins,
				},
				true,
			);
		} else if (result.success) {
			console.log(`Marketplace added: ${args.source}`);
			await show_available_plugins(args.source);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

/**
 * Try to find and display available plugins from a newly added marketplace.
 * The marketplace name in the filesystem may differ from the source string,
 * so we try common derivations.
 */
async function find_marketplace_plugins(
	source: string,
): Promise<string[]> {
	// Try the source as-is, then extract repo name from various formats
	const candidates: string[] = [];

	// Extract repo name from owner/repo, URLs, etc.
	const repo_match = source.match(/([^/]+?)(?:\.git)?$/);
	if (repo_match) {
		candidates.push(repo_match[1].toLowerCase());
		candidates.push(repo_match[1]);
	}

	// Try the full source as a name
	candidates.push(source);

	for (const name of candidates) {
		const manifest = await read_marketplace_manifest(name);
		if (manifest?.plugins?.length) {
			return manifest.plugins.map((p) => {
				const desc = p.description
					? ` - ${p.description}`
					: '';
				return `${p.name}${desc}`;
			});
		}
	}

	return [];
}

async function show_available_plugins(source: string): Promise<void> {
	const plugins = await find_marketplace_plugins(source);

	if (plugins.length > 0) {
		console.log(
			`\nAvailable plugins (${plugins.length}):`,
		);
		for (const p of plugins) {
			console.log(`  - ${p}`);
		}
		console.log(
			'\nInstall with: mcpick plugins install <name>@<marketplace>',
		);
	} else {
		console.log(
			'\nTo browse and install plugins: mcpick plugins install <name>@<marketplace>',
		);
	}
}

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

			// Check if update restored any disabled hooks
			const restored = await check_restored_hooks();
			if (restored.length > 0) {
				console.log(
					`\nWarning: ${restored.length} disabled hook(s) were restored by the update.`,
				);
				const redisable_result =
					await redisable_restored_hooks(restored);
				console.log(
					`Re-disabled ${redisable_result.success} hook(s).${redisable_result.failed > 0 ? ` Failed: ${redisable_result.failed}` : ''}`,
				);
			}
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

export default defineCommand({
	meta: {
		name: 'marketplace',
		description:
			'Manage plugin marketplaces (catalogs of installable plugins). Add a marketplace first, then install plugins from it with: mcpick plugins install <name>@<marketplace>',
	},
	subCommands: {
		list,
		add,
		remove,
		update,
	},
});
