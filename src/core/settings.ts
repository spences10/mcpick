import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
	ClaudeSettings,
	HookConfiguration,
	HookEventType,
	HookMatcher,
} from '../types.js';
import { atomic_json_write } from '../utils/atomic-write.js';
import { get_claude_settings_path } from '../utils/paths.js';

export async function read_claude_settings(): Promise<ClaudeSettings> {
	const settings_path = get_claude_settings_path();

	try {
		await access(settings_path);
		const content = await readFile(settings_path, 'utf-8');
		return JSON.parse(content) as ClaudeSettings;
	} catch (error) {
		if (
			error instanceof Error &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return {};
		}
		throw error;
	}
}

export async function write_claude_settings(
	updates: Partial<ClaudeSettings>,
): Promise<void> {
	await atomic_json_write(get_claude_settings_path(), (existing) => {
		for (const [key, value] of Object.entries(updates)) {
			existing[key] = value;
		}
		return existing;
	});
}

export interface PluginInfo {
	name: string;
	marketplace: string;
	enabled: boolean;
}

/**
 * Parse enabledPlugins into structured list.
 * Keys are in format "plugin-name@marketplace-name"
 */
export function get_all_plugins(
	settings: ClaudeSettings,
): PluginInfo[] {
	const enabled_plugins = settings.enabledPlugins || {};

	return Object.entries(enabled_plugins).map(([key, enabled]) => {
		const at_index = key.lastIndexOf('@');
		const name = at_index > 0 ? key.substring(0, at_index) : key;
		const marketplace =
			at_index > 0 ? key.substring(at_index + 1) : 'unknown';

		return { name, marketplace, enabled };
	});
}

/**
 * Build the enabledPlugins record from a list of PluginInfo
 */
export function build_enabled_plugins(
	plugins: PluginInfo[],
): Record<string, boolean> {
	const result: Record<string, boolean> = {};
	for (const plugin of plugins) {
		const key = `${plugin.name}@${plugin.marketplace}`;
		result[key] = plugin.enabled;
	}
	return result;
}

// ─── Hook management ────────────────────────────────────────

export type HookScope = 'user' | 'project' | 'project-local';

async function read_settings_file(
	path: string,
): Promise<Record<string, unknown>> {
	try {
		await access(path);
		const content = await readFile(path, 'utf-8');
		return JSON.parse(content);
	} catch {
		return {};
	}
}

function get_settings_paths(): { scope: HookScope; path: string }[] {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return [
		{
			scope: 'user' as HookScope,
			path: resolve(home, '.claude', 'settings.json'),
		},
		{
			scope: 'project' as HookScope,
			path: resolve(process.cwd(), '.claude', 'settings.json'),
		},
		{
			scope: 'project-local' as HookScope,
			path: resolve(process.cwd(), '.claude', 'settings.local.json'),
		},
	];
}

export type HookSource = HookScope | 'plugin';

export interface FlatHookEntry {
	event: HookEventType;
	matcher?: string;
	handler: import('../types.js').HookHandler;
	scope: HookScope;
	source: HookSource;
	/** Index within the matchers array for this event */
	matcher_index: number;
	/** Index within the hooks array for this matcher */
	hook_index: number;
	/** Plugin key (e.g. toolkit-skills@claude-code-toolkit) — only for plugin hooks */
	plugin_key?: string;
	/** Filesystem path to the plugin's hooks.json — only for plugin hooks */
	hooks_json_path?: string;
}

/**
 * Read all hooks across all scopes (settings + plugins), flattened for display.
 */
export async function get_all_hooks(): Promise<FlatHookEntry[]> {
	const entries: FlatHookEntry[] = [];

	// Settings-based hooks
	for (const { scope, path } of get_settings_paths()) {
		const data = await read_settings_file(path);
		const hooks = data.hooks as HookConfiguration | undefined;
		if (!hooks) continue;

		for (const [event, matchers] of Object.entries(hooks)) {
			if (!Array.isArray(matchers)) continue;

			for (let mi = 0; mi < matchers.length; mi++) {
				const m = matchers[mi] as HookMatcher;
				if (!m.hooks?.length) continue;

				for (let hi = 0; hi < m.hooks.length; hi++) {
					entries.push({
						event: event as HookEventType,
						matcher: m.matcher,
						handler: m.hooks[hi],
						scope,
						source: scope,
						matcher_index: mi,
						hook_index: hi,
					});
				}
			}
		}
	}

	// Plugin-based hooks
	const plugin_hooks = await get_all_plugin_hooks();
	entries.push(...plugin_hooks);

	return entries;
}

/**
 * Scan all installed plugins for hooks.json and return flattened hook entries.
 * Checks both cache and marketplace source paths since Claude Code reads from both.
 */
export async function get_all_plugin_hooks(): Promise<
	FlatHookEntry[]
> {
	const { read_installed_plugins } =
		await import('./plugin-cache.js');
	const { get_marketplaces_dir } = await import('../utils/paths.js');
	const installed = await read_installed_plugins();
	const entries: FlatHookEntry[] = [];
	const seen_hooks = new Set<string>();

	for (const [plugin_key, installs] of Object.entries(
		installed.plugins,
	)) {
		if (!installs?.length) continue;

		const install = installs[0];
		const at_index = plugin_key.lastIndexOf('@');
		const plugin_name =
			at_index > 0 ? plugin_key.substring(0, at_index) : plugin_key;
		const marketplace_name =
			at_index > 0 ? plugin_key.substring(at_index + 1) : '';

		// Collect all hooks.json paths for this plugin (cache + marketplace source)
		const hooks_paths: string[] = [
			join(install.installPath, 'hooks', 'hooks.json'),
		];

		// Also check marketplace source path
		if (marketplace_name) {
			hooks_paths.push(
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

		for (const hooks_path of hooks_paths) {
			let hooks_data: Record<string, unknown>;
			try {
				const content = await readFile(hooks_path, 'utf-8');
				hooks_data = JSON.parse(content);
			} catch {
				continue;
			}

			const hooks = (hooks_data.hooks || hooks_data) as Record<
				string,
				unknown
			>;

			for (const [event, matchers] of Object.entries(hooks)) {
				if (!Array.isArray(matchers)) continue;

				for (let mi = 0; mi < matchers.length; mi++) {
					const m = matchers[mi] as HookMatcher;
					if (!m.hooks?.length) continue;

					for (let hi = 0; hi < m.hooks.length; hi++) {
						// Deduplicate: same plugin + event + handler type + command
						const h = m.hooks[hi];
						const dedup_key = `${plugin_key}:${event}:${h.type}:${h.command || h.url || h.prompt}`;
						if (seen_hooks.has(dedup_key)) continue;
						seen_hooks.add(dedup_key);

						entries.push({
							event: event as HookEventType,
							matcher: m.matcher,
							handler: h,
							scope: 'user' as HookScope,
							source: 'plugin',
							matcher_index: mi,
							hook_index: hi,
							plugin_key,
							hooks_json_path: hooks_path,
						});
					}
				}
			}
		}
	}

	return entries;
}

/**
 * Remove a specific hook entry by scope/event/indices.
 */
export async function remove_hook(
	entry: FlatHookEntry,
): Promise<void> {
	const scope_path = get_settings_paths().find(
		(s) => s.scope === entry.scope,
	);
	if (!scope_path) throw new Error(`Unknown scope: ${entry.scope}`);

	await atomic_json_write(scope_path.path, (existing) => {
		const hooks = existing.hooks as HookConfiguration | undefined;
		if (!hooks) return existing;

		const matchers = hooks[entry.event];
		if (!matchers?.[entry.matcher_index]) return existing;

		const matcher = matchers[entry.matcher_index];
		matcher.hooks.splice(entry.hook_index, 1);

		// Clean up empty matchers
		if (matcher.hooks.length === 0) {
			matchers.splice(entry.matcher_index, 1);
		}

		// Clean up empty events
		if (matchers.length === 0) {
			delete hooks[entry.event];
		}

		// Clean up empty hooks object
		if (Object.keys(hooks).length === 0) {
			delete existing.hooks;
		}

		return existing;
	});
}

/**
 * Add a hook to a specific scope.
 */
export async function add_hook(
	scope: HookScope,
	event: HookEventType,
	matcher: string | undefined,
	handler: import('../types.js').HookHandler,
): Promise<void> {
	const scope_path = get_settings_paths().find(
		(s) => s.scope === scope,
	);
	if (!scope_path) throw new Error(`Unknown scope: ${scope}`);

	await atomic_json_write(scope_path.path, (existing) => {
		if (!existing.hooks) existing.hooks = {};
		const hooks = existing.hooks as HookConfiguration;

		if (!hooks[event]) hooks[event] = [];
		const matchers = hooks[event]!;

		// Find existing matcher group or create new
		const existing_matcher = matchers.find(
			(m) => (m.matcher || undefined) === matcher,
		);
		if (existing_matcher) {
			existing_matcher.hooks.push(handler);
		} else {
			const new_matcher: HookMatcher = { hooks: [handler] };
			if (matcher) new_matcher.matcher = matcher;
			matchers.push(new_matcher);
		}

		return existing;
	});
}
