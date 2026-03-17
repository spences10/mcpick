import { access, readFile, writeFile } from 'node:fs/promises';
import { ClaudeSettings } from '../types.js';
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
	const settings_path = get_claude_settings_path();

	let existing: ClaudeSettings = {};
	try {
		const content = await readFile(settings_path, 'utf-8');
		existing = JSON.parse(content);
	} catch {
		// Start with empty if file doesn't exist
	}

	// Merge only the keys we're updating
	for (const [key, value] of Object.entries(updates)) {
		existing[key] = value;
	}

	await writeFile(
		settings_path,
		JSON.stringify(existing, null, 2),
		'utf-8',
	);
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
