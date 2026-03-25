import { isCancel, log, multiselect, note } from '@clack/prompts';
import {
	disable_plugin_hook,
	enable_plugin_hook,
	read_disabled_hooks,
} from '../core/hook-state.js';
import { FlatHookEntry, get_all_hooks } from '../core/settings.js';

function format_hook(entry: FlatHookEntry): string {
	const detail =
		entry.handler.command ||
		entry.handler.url ||
		entry.handler.prompt ||
		'(unknown)';
	const truncated =
		detail.length > 50 ? detail.substring(0, 47) + '...' : detail;
	return `${entry.event} → ${entry.handler.type}: ${truncated}`;
}

function format_source(entry: FlatHookEntry): string {
	if (entry.source === 'plugin' && entry.plugin_key) {
		return entry.plugin_key;
	}
	return entry.scope;
}

export async function manage_hooks(): Promise<void> {
	// Get all active hooks + disabled hooks
	const active_hooks = await get_all_hooks();
	const disabled = await read_disabled_hooks();

	// Build unified list: active hooks are "on", disabled are "off"
	type HookItem = {
		id: string;
		active_entry?: FlatHookEntry;
		disabled_index?: number;
		label: string;
		hint: string;
	};

	const items: HookItem[] = [];

	// Active hooks
	for (let i = 0; i < active_hooks.length; i++) {
		const h = active_hooks[i];
		items.push({
			id: `active:${i}`,
			active_entry: h,
			label: format_hook(h),
			hint: format_source(h),
		});
	}

	// Disabled hooks
	for (let i = 0; i < disabled.length; i++) {
		const d = disabled[i];
		const detail =
			d.original_handler.command ||
			d.original_handler.url ||
			d.original_handler.prompt ||
			'(unknown)';
		const truncated =
			detail.length > 50 ? detail.substring(0, 47) + '...' : detail;
		items.push({
			id: `disabled:${i}`,
			disabled_index: i,
			label: `${d.event} → ${d.original_handler.type}: ${truncated}`,
			hint: `${d.plugin_key} (disabled)`,
		});
	}

	if (items.length === 0) {
		note('No hooks found (settings or plugins).');
		return;
	}

	// Currently enabled = active hooks
	const currently_enabled = items
		.filter((item) => item.active_entry)
		.map((item) => item.id);

	const selected = await multiselect({
		message: 'Toggle hooks on/off:',
		options: items.map((item) => ({
			value: item.id,
			label: item.label,
			hint: item.hint,
		})),
		initialValues: currently_enabled,
		required: false,
	});

	if (isCancel(selected)) return;

	const selected_set = new Set(selected);
	let changes = 0;

	// Disable hooks that were deselected (active → disabled)
	for (const item of items) {
		if (!item.active_entry) continue;
		if (selected_set.has(item.id)) continue;

		// Only plugin hooks can be disabled — settings hooks get removed
		if (item.active_entry.source === 'plugin') {
			await disable_plugin_hook(item.active_entry);
			changes++;
		}
	}

	// Enable hooks that were selected (disabled → active)
	for (const item of items) {
		if (item.disabled_index === undefined) continue;
		if (!selected_set.has(item.id)) continue;

		await enable_plugin_hook(disabled[item.disabled_index]);
		changes++;
	}

	if (changes > 0) {
		log.success(`${changes} hook(s) updated.`);
		log.info('Restart Claude Code for changes to take effect.');
	} else {
		log.info('No changes.');
	}
}
