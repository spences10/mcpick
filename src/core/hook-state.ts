import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HookHandler, HookMatcher } from '../types.js';
import {
	ensure_directory_exists,
	get_disabled_hooks_path,
	get_marketplaces_dir,
	get_mcpick_dir,
} from '../utils/paths.js';
import { safe_json_write } from '../utils/safe-apply.js';
import { FlatHookEntry } from './settings.js';

export interface DisabledHookEntry {
	plugin_key: string;
	hooks_json_path: string;
	event: string;
	matcher?: string;
	matcher_index: number;
	hook_index: number;
	original_handler: HookHandler;
	disabled_at: string;
}

export async function read_disabled_hooks(): Promise<
	DisabledHookEntry[]
> {
	try {
		const content = await readFile(
			get_disabled_hooks_path(),
			'utf-8',
		);
		return JSON.parse(content) as DisabledHookEntry[];
	} catch {
		return [];
	}
}

async function write_disabled_hooks(
	entries: DisabledHookEntry[],
): Promise<void> {
	await ensure_directory_exists(get_mcpick_dir());
	await safe_json_write(get_disabled_hooks_path(), entries, '\t');
}

/**
 * Remove a specific hook handler from a hooks.json file by matching the handler.
 * Returns true if the hook was found and removed.
 */
async function remove_hook_from_file(
	hooks_path: string,
	event: string,
	handler: HookHandler,
): Promise<boolean> {
	let content: string;
	try {
		content = await readFile(hooks_path, 'utf-8');
	} catch {
		return false;
	}

	const hooks_data = JSON.parse(content) as Record<string, unknown>;
	const hooks_obj = (hooks_data.hooks || hooks_data) as Record<
		string,
		HookMatcher[]
	>;
	const matchers = hooks_obj[event];
	if (!matchers) return false;

	let removed = false;
	for (const m of matchers) {
		const idx = m.hooks?.findIndex(
			(h) =>
				h.type === handler.type &&
				h.command === handler.command &&
				h.url === handler.url &&
				h.prompt === handler.prompt,
		);
		if (idx !== undefined && idx >= 0) {
			m.hooks.splice(idx, 1);
			removed = true;
			if (m.hooks.length === 0) {
				matchers.splice(matchers.indexOf(m), 1);
			}
			break;
		}
	}

	if (!removed) return false;

	if (matchers.length === 0) {
		delete hooks_obj[event];
	}

	await safe_json_write(hooks_path, hooks_data, '\t');
	return true;
}

/**
 * Get all hooks.json paths for a plugin (cache + marketplace source).
 */
function get_all_hooks_paths(
	plugin_key: string,
	primary_path: string,
): string[] {
	const paths = [primary_path];
	const at_index = plugin_key.lastIndexOf('@');
	if (at_index > 0) {
		const plugin_name = plugin_key.substring(0, at_index);
		const marketplace_name = plugin_key.substring(at_index + 1);
		paths.push(
			join(
				get_marketplaces_dir(),
				marketplace_name,
				'plugins',
				plugin_name,
				'hooks',
				'hooks.json',
			),
		);
	}
	return [...new Set(paths)]; // deduplicate
}

/**
 * Disable a specific hook from a plugin.
 * Removes from both cache and marketplace source hooks.json files.
 */
export async function disable_plugin_hook(
	entry: FlatHookEntry,
): Promise<void> {
	if (!entry.hooks_json_path || !entry.plugin_key) {
		throw new Error('Not a plugin hook');
	}

	// Save to disabled state
	const disabled = await read_disabled_hooks();
	disabled.push({
		plugin_key: entry.plugin_key,
		hooks_json_path: entry.hooks_json_path,
		event: entry.event,
		matcher: entry.matcher,
		matcher_index: entry.matcher_index,
		hook_index: entry.hook_index,
		original_handler: entry.handler,
		disabled_at: new Date().toISOString(),
	});
	await write_disabled_hooks(disabled);

	// Remove from all hooks.json files (cache + marketplace source)
	const all_paths = get_all_hooks_paths(
		entry.plugin_key,
		entry.hooks_json_path,
	);
	for (const hooks_path of all_paths) {
		await remove_hook_from_file(
			hooks_path,
			entry.event,
			entry.handler,
		);
	}
}

/**
 * Add a hook handler back into a hooks.json file.
 */
async function add_hook_to_file(
	hooks_path: string,
	event: string,
	matcher_pattern: string | undefined,
	handler: HookHandler,
): Promise<void> {
	let hooks_data: Record<string, unknown>;
	try {
		const content = await readFile(hooks_path, 'utf-8');
		hooks_data = JSON.parse(content);
	} catch {
		hooks_data = { hooks: {} };
	}

	const hooks_obj = (hooks_data.hooks ||
		(hooks_data.hooks = {})) as Record<string, HookMatcher[]>;

	if (!hooks_obj[event]) hooks_obj[event] = [];
	const matchers = hooks_obj[event];

	let matcher = matchers.find(
		(m) => (m.matcher || undefined) === matcher_pattern,
	);
	if (!matcher) {
		matcher = { hooks: [] } as HookMatcher;
		if (matcher_pattern) matcher.matcher = matcher_pattern;
		matchers.push(matcher);
	}

	// Only add if not already present (avoids duplicates)
	const already_exists = matcher.hooks.some(
		(h) =>
			h.type === handler.type &&
			h.command === handler.command &&
			h.url === handler.url &&
			h.prompt === handler.prompt,
	);
	if (already_exists) return;

	matcher.hooks.push(handler);

	await safe_json_write(hooks_path, hooks_data, '\t');
}

/**
 * Re-enable a previously disabled plugin hook.
 * Restores to both cache and marketplace source hooks.json files.
 */
export async function enable_plugin_hook(
	disabled_entry: DisabledHookEntry,
): Promise<void> {
	const all_paths = get_all_hooks_paths(
		disabled_entry.plugin_key,
		disabled_entry.hooks_json_path,
	);

	for (const hooks_path of all_paths) {
		await add_hook_to_file(
			hooks_path,
			disabled_entry.event,
			disabled_entry.matcher,
			disabled_entry.original_handler,
		);
	}

	// Remove from disabled state
	const disabled = await read_disabled_hooks();
	const updated = disabled.filter(
		(d) =>
			!(
				d.plugin_key === disabled_entry.plugin_key &&
				d.event === disabled_entry.event &&
				d.disabled_at === disabled_entry.disabled_at
			),
	);
	await write_disabled_hooks(updated);
}

/**
 * Check if any previously disabled hooks have been restored (e.g. by marketplace update).
 * Returns entries that were re-added and need to be re-disabled.
 */
export async function check_restored_hooks(): Promise<
	DisabledHookEntry[]
> {
	const disabled = await read_disabled_hooks();
	if (disabled.length === 0) return [];

	const restored: DisabledHookEntry[] = [];

	for (const entry of disabled) {
		const all_paths = get_all_hooks_paths(
			entry.plugin_key,
			entry.hooks_json_path,
		);

		let found = false;
		for (const hooks_path of all_paths) {
			let hooks_data: Record<string, unknown>;
			try {
				const content = await readFile(hooks_path, 'utf-8');
				hooks_data = JSON.parse(content);
			} catch {
				continue;
			}

			const hooks_obj = (hooks_data.hooks || hooks_data) as Record<
				string,
				HookMatcher[]
			>;
			const matchers = hooks_obj[entry.event];
			if (!matchers) continue;

			for (const m of matchers) {
				if ((m.matcher || undefined) !== entry.matcher) continue;

				const has_match = m.hooks?.some(
					(h) =>
						h.type === entry.original_handler.type &&
						(h.command === entry.original_handler.command ||
							h.url === entry.original_handler.url ||
							h.prompt === entry.original_handler.prompt),
				);

				if (has_match) {
					found = true;
					break;
				}
			}
			if (found) break;
		}

		if (found) restored.push(entry);
	}

	return restored;
}

/**
 * Re-disable hooks that were restored by a marketplace update.
 */
export async function redisable_restored_hooks(
	restored: DisabledHookEntry[],
): Promise<{ success: number; failed: number }> {
	let success = 0;
	let failed = 0;

	for (const entry of restored) {
		try {
			const all_paths = get_all_hooks_paths(
				entry.plugin_key,
				entry.hooks_json_path,
			);
			let any_removed = false;
			for (const hooks_path of all_paths) {
				const removed = await remove_hook_from_file(
					hooks_path,
					entry.event,
					entry.original_handler,
				);
				if (removed) any_removed = true;
			}
			if (any_removed) {
				success++;
			} else {
				failed++;
			}
		} catch {
			failed++;
		}
	}

	return { success, failed };
}
