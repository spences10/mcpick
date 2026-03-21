import {
	confirm,
	isCancel,
	log,
	multiselect,
	note,
	select,
} from '@clack/prompts';
import {
	clean_orphaned_versions,
	clear_plugin_caches,
	get_cached_plugins_info,
	refresh_all_marketplaces,
} from '../core/plugin-cache.js';
import type { CachedPluginInfo } from '../types.js';

type CacheAction =
	| 'status'
	| 'clear'
	| 'clean-orphaned'
	| 'refresh'
	| 'back';

function format_status_line(p: CachedPluginInfo): string {
	const markers: string[] = [];
	if (p.isVersionStale) {
		markers.push(
			`version: ${p.installedVersion} → ${p.latestVersion}`,
		);
	}
	if (p.isShaStale) {
		markers.push('commits behind');
	}
	if (p.orphanedVersions.length > 0) {
		markers.push(`${p.orphanedVersions.length} orphaned`);
	}

	const status =
		markers.length > 0
			? `[stale: ${markers.join(', ')}]`
			: '[up to date]';

	return `${p.name}@${p.marketplace}  v${p.installedVersion}  ${status}`;
}

async function handle_status(): Promise<void> {
	const plugins = await get_cached_plugins_info();

	if (plugins.length === 0) {
		log.info('No cached plugins found.');
		return;
	}

	const lines = plugins.map(format_status_line).join('\n');
	note(lines, 'Plugin Cache Status');
}

async function handle_clear(): Promise<void> {
	const plugins = await get_cached_plugins_info();

	if (plugins.length === 0) {
		log.info('No cached plugins to clear.');
		return;
	}

	const selected = await multiselect({
		message: 'Select plugins to clear cache for:',
		options: plugins.map((p) => {
			const stale = p.isVersionStale || p.isShaStale;
			return {
				value: p.key,
				label: `${p.name}@${p.marketplace}`,
				hint: stale
					? `v${p.installedVersion} → ${p.latestVersion ?? 'unknown'} (stale)`
					: `v${p.installedVersion}`,
			};
		}),
		initialValues: plugins
			.filter((p) => p.isVersionStale || p.isShaStale)
			.map((p) => p.key),
	});

	if (isCancel(selected) || selected.length === 0) return;

	const should_clear = await confirm({
		message: `Clear cache for ${selected.length} plugin(s)? This will also refresh the marketplace.`,
	});

	if (isCancel(should_clear) || !should_clear) return;

	const result = await clear_plugin_caches(selected);

	for (const key of result.cleared) {
		log.success(`Cleared: ${key}`);
	}
	for (const err of result.errors) {
		log.error(`Error: ${err}`);
	}

	if (result.cleared.length > 0) {
		note(
			'Run /reload-plugins in Claude Code or restart your session to apply changes.',
			'Next Steps',
		);
	}
}

async function handle_clean_orphaned(): Promise<void> {
	const should_clean = await confirm({
		message: 'Remove all orphaned plugin version directories?',
	});

	if (isCancel(should_clean) || !should_clean) return;

	const result = await clean_orphaned_versions();

	if (result.cleaned === 0) {
		log.info('No orphaned versions found.');
	} else {
		for (const p of result.paths) {
			log.success(`Removed: ${p}`);
		}
		log.info(`Cleaned ${result.cleaned} orphaned version(s).`);
	}
}

async function handle_refresh(): Promise<void> {
	const should_refresh = await confirm({
		message: 'Refresh all marketplace clones (git pull)?',
	});

	if (isCancel(should_refresh) || !should_refresh) return;

	const results = await refresh_all_marketplaces();

	if (results.size === 0) {
		log.info('No marketplaces configured.');
		return;
	}

	for (const [name, result] of results) {
		if (result.success) {
			log.success(`${name}: refreshed`);
		} else {
			log.error(`${name}: ${result.error}`);
		}
	}
}

export async function manage_cache(): Promise<void> {
	while (true) {
		const action = await select<CacheAction>({
			message: 'Plugin cache management:',
			options: [
				{
					value: 'status' as CacheAction,
					label: 'View cache status',
					hint: 'Show plugins with staleness info',
				},
				{
					value: 'clear' as CacheAction,
					label: 'Clear plugin caches',
					hint: 'Refresh marketplace + clear selected caches',
				},
				{
					value: 'clean-orphaned' as CacheAction,
					label: 'Clean orphaned versions',
					hint: 'Remove old version directories',
				},
				{
					value: 'refresh' as CacheAction,
					label: 'Refresh marketplaces',
					hint: 'Git pull all marketplace clones',
				},
				{
					value: 'back' as CacheAction,
					label: 'Back',
					hint: 'Return to main menu',
				},
			],
		});

		if (isCancel(action) || action === 'back') return;

		switch (action) {
			case 'status':
				await handle_status();
				break;
			case 'clear':
				await handle_clear();
				break;
			case 'clean-orphaned':
				await handle_clean_orphaned();
				break;
			case 'refresh':
				await handle_refresh();
				break;
		}
	}
}
