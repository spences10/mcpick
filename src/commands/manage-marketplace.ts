import {
	confirm,
	isCancel,
	log,
	multiselect,
	note,
	select,
	text,
} from '@clack/prompts';
import {
	check_restored_hooks,
	redisable_restored_hooks,
} from '../core/hook-state.js';
import {
	read_known_marketplaces,
	read_marketplace_manifest,
} from '../core/plugin-cache.js';
import {
	get_all_plugins,
	read_claude_settings,
} from '../core/settings.js';
import {
	install_plugin_via_cli,
	marketplace_add_via_cli,
	marketplace_remove_via_cli,
	marketplace_update_via_cli,
	uninstall_plugin_via_cli,
} from '../utils/claude-cli.js';

type MarketplaceAction =
	| 'browse'
	| 'add'
	| 'remove'
	| 'update'
	| 'back';

/**
 * Browse all available plugins across all marketplaces.
 * Shows a multiselect with installed plugins pre-selected — toggle to install/uninstall.
 */
async function handle_browse(): Promise<void> {
	const known = await read_known_marketplaces();
	const marketplace_names = Object.keys(known);

	if (marketplace_names.length === 0) {
		note(
			'No marketplaces configured.\nAdd one first to browse plugins.',
		);
		return;
	}

	// Build list of all available plugins across marketplaces
	const all_available: {
		key: string;
		name: string;
		marketplace: string;
		description?: string;
	}[] = [];

	for (const mkt_name of marketplace_names) {
		const manifest = await read_marketplace_manifest(mkt_name);
		if (!manifest?.plugins?.length) continue;

		for (const p of manifest.plugins) {
			all_available.push({
				key: `${p.name}@${mkt_name}`,
				name: p.name,
				marketplace: mkt_name,
				description: p.description,
			});
		}
	}

	if (all_available.length === 0) {
		note('No plugins found in any marketplace.');
		return;
	}

	// Get currently installed plugins
	const settings = await read_claude_settings();
	const installed = get_all_plugins(settings);
	const installed_keys = new Set(
		installed.map((p) => `${p.name}@${p.marketplace}`),
	);

	const selected = await multiselect({
		message: `Available plugins (${all_available.length}) — toggle to install/uninstall:`,
		options: all_available.map((p) => ({
			value: p.key,
			label: p.name,
			hint: `${p.marketplace}${p.description ? ` · ${p.description}` : ''}`,
		})),
		initialValues: all_available
			.filter((p) => installed_keys.has(p.key))
			.map((p) => p.key),
		required: false,
	});

	if (isCancel(selected)) return;

	const selected_set = new Set(selected);

	// Determine what to install and uninstall
	const to_install = all_available.filter(
		(p) => selected_set.has(p.key) && !installed_keys.has(p.key),
	);
	const to_uninstall = all_available.filter(
		(p) => !selected_set.has(p.key) && installed_keys.has(p.key),
	);

	if (to_install.length === 0 && to_uninstall.length === 0) {
		log.info('No changes.');
		return;
	}

	// Install new plugins
	for (const p of to_install) {
		log.info(`Installing ${p.key}...`);
		const result = await install_plugin_via_cli(p.key);
		if (result.success) {
			log.success(`Installed: ${p.key}`);
		} else {
			log.error(`Failed: ${p.key} - ${result.error}`);
		}
	}

	// Uninstall deselected plugins
	for (const p of to_uninstall) {
		log.info(`Uninstalling ${p.key}...`);
		const result = await uninstall_plugin_via_cli(p.key);
		if (result.success) {
			log.success(`Uninstalled: ${p.key}`);
		} else {
			log.error(`Failed: ${p.key} - ${result.error}`);
		}
	}

	const parts: string[] = [];
	if (to_install.length > 0)
		parts.push(`${to_install.length} installed`);
	if (to_uninstall.length > 0)
		parts.push(`${to_uninstall.length} uninstalled`);
	note(parts.join(', '), 'Plugins updated');
}

async function handle_add(): Promise<void> {
	const source = await text({
		message: 'Marketplace source:',
		placeholder: 'e.g. owner/repo or https://github.com/owner/repo',
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'Marketplace source is required';
			}
		},
	});

	if (isCancel(source)) return;

	log.info(`Adding marketplace: ${source}`);
	const result = await marketplace_add_via_cli(source);

	if (!result.success) {
		log.error(result.error || 'Unknown error');
		return;
	}

	log.success(`Marketplace added: ${source}`);

	// Try to find and offer available plugins
	const marketplace_name = derive_marketplace_name(source);
	const manifest = marketplace_name
		? await read_marketplace_manifest(marketplace_name)
		: null;

	if (!manifest?.plugins?.length) {
		log.info(
			'Install plugins with: mcpick plugins install <name>@<marketplace>',
		);
		return;
	}

	const should_install = await confirm({
		message: `${manifest.plugins.length} plugins available. Install now?`,
	});

	if (isCancel(should_install) || !should_install) return;

	const to_install = await multiselect({
		message: 'Select plugins to install:',
		options: manifest.plugins.map((p) => ({
			value: `${p.name}@${marketplace_name}`,
			label: p.name,
			hint: p.description,
		})),
		required: false,
	});

	if (isCancel(to_install) || to_install.length === 0) return;

	for (const key of to_install) {
		log.info(`Installing ${key}...`);
		const install_result = await install_plugin_via_cli(key);
		if (install_result.success) {
			log.success(`Installed: ${key}`);
		} else {
			log.error(`Failed: ${key} - ${install_result.error}`);
		}
	}
}

function derive_marketplace_name(source: string): string | null {
	const match = source.match(/([^/]+?)(?:\.git)?$/);
	return match ? match[1].toLowerCase() : null;
}

async function handle_remove(): Promise<void> {
	const known = await read_known_marketplaces();
	const names = Object.keys(known);

	if (names.length === 0) {
		note('No marketplaces configured.');
		return;
	}

	const name = await select({
		message: 'Select marketplace to remove:',
		options: names.map((n) => ({
			value: n,
			label: n,
			hint: known[n].source.repo || known[n].source.url,
		})),
	});

	if (isCancel(name)) return;

	const should_remove = await confirm({
		message: `Remove marketplace '${name}'? Its plugins will also be removed.`,
	});

	if (isCancel(should_remove) || !should_remove) return;

	const remove_result = await marketplace_remove_via_cli(name);

	if (remove_result.success) {
		log.success(`Marketplace removed: ${name}`);
	} else {
		log.error(remove_result.error || 'Unknown error');
	}
}

async function handle_update(): Promise<void> {
	const known = await read_known_marketplaces();
	const names = Object.keys(known);

	if (names.length === 0) {
		note('No marketplaces configured.');
		return;
	}

	const choice = await select({
		message: 'What to update:',
		options: [
			{ value: '__all__', label: 'All marketplaces' },
			...names.map((n) => ({
				value: n,
				label: n,
				hint: known[n].source.repo || known[n].source.url,
			})),
		],
	});

	if (isCancel(choice)) return;

	if (choice === '__all__') {
		log.info('Updating all marketplaces...');
		const result = await marketplace_update_via_cli();
		if (result.success) {
			log.success('All marketplaces updated.');
		} else {
			log.error(result.error || 'Unknown error');
		}
	} else {
		log.info(`Updating ${choice}...`);
		const result = await marketplace_update_via_cli(choice);
		if (result.success) {
			log.success(`Marketplace updated: ${choice}`);
		} else {
			log.error(result.error || 'Unknown error');
		}
	}

	// Check if update restored any disabled hooks
	const restored = await check_restored_hooks();
	if (restored.length > 0) {
		log.warn(
			`${restored.length} disabled hook(s) were restored by the update.`,
		);
		const should_redisable = await confirm({
			message: 'Re-disable these hooks?',
		});
		if (!isCancel(should_redisable) && should_redisable) {
			const redisable_result =
				await redisable_restored_hooks(restored);
			if (redisable_result.success > 0) {
				log.success(
					`Re-disabled ${redisable_result.success} hook(s).`,
				);
			}
			if (redisable_result.failed > 0) {
				log.error(
					`Failed to re-disable ${redisable_result.failed} hook(s).`,
				);
			}
		}
	}
}

export async function manage_marketplace(): Promise<void> {
	while (true) {
		const action = await select<MarketplaceAction>({
			message: 'Marketplace & plugins:',
			options: [
				{
					value: 'browse' as MarketplaceAction,
					label: 'Browse & install plugins',
					hint: 'Toggle plugins on/off across all marketplaces',
				},
				{
					value: 'add' as MarketplaceAction,
					label: 'Add marketplace',
					hint: 'Add a plugin catalog, then install plugins from it',
				},
				{
					value: 'remove' as MarketplaceAction,
					label: 'Remove marketplace',
					hint: 'Remove a marketplace and its plugins',
				},
				{
					value: 'update' as MarketplaceAction,
					label: 'Update marketplace(s)',
					hint: 'Pull latest from source',
				},
				{
					value: 'back' as MarketplaceAction,
					label: 'Back',
					hint: 'Return to main menu',
				},
			],
		});

		if (isCancel(action) || action === 'back') return;

		try {
			switch (action) {
				case 'browse':
					await handle_browse();
					break;
				case 'add':
					await handle_add();
					break;
				case 'remove':
					await handle_remove();
					break;
				case 'update':
					await handle_update();
					break;
			}
		} catch (err) {
			log.error(err instanceof Error ? err.message : 'Unknown error');
		}
	}
}
