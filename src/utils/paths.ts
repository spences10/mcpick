import { existsSync } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

type BaseDir = string;
type ParentDir = string;
type CoLocatedConfig = boolean;

export function get_base_dir(): {
	baseDir: BaseDir;
	parentDir: ParentDir;
	coLocatedConfig: CoLocatedConfig;
} {
	const configDir = process.env.CLAUDE_CONFIG_DIR;
	if (configDir && configDir.length > 0 && existsSync(configDir)) {
		return {
			baseDir: configDir,
			parentDir: dirname(configDir),
			coLocatedConfig: true,
		};
	}
	const defaultDir = join(homedir(), '.claude');
	return {
		baseDir: defaultDir,
		parentDir: dirname(defaultDir),
		coLocatedConfig: false,
	};
}

export function get_claude_config_path(): string {
	const { baseDir, parentDir, coLocatedConfig } = get_base_dir();
	if (coLocatedConfig) {
		return join(baseDir, '.claude.json');
	}
	return join(parentDir, '.claude.json');
}

export function get_claude_settings_path(): string {
	return join(get_base_dir().baseDir, 'settings.json');
}

export function get_mcpick_dir(): string {
	return join(get_base_dir().baseDir, 'mcpick');
}

export function get_server_registry_path(): string {
	return join(get_mcpick_dir(), 'servers.json');
}

export function get_backups_dir(): string {
	return join(get_mcpick_dir(), 'backups');
}

export function get_profiles_dir(): string {
	return join(get_mcpick_dir(), 'profiles');
}

export function get_profile_path(name: string): string {
	// Allow .json extension or add it
	const filename = name.endsWith('.json') ? name : `${name}.json`;
	return join(get_profiles_dir(), filename);
}

function format_backup_timestamp(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hour = String(now.getHours()).padStart(2, '0');
	const minute = String(now.getMinutes()).padStart(2, '0');
	const second = String(now.getSeconds()).padStart(2, '0');

	return `${year}-${month}-${day}-${hour}${minute}${second}`;
}

export function get_backup_filename(): string {
	return `mcp-servers-${format_backup_timestamp()}.json`;
}

export function get_plugin_backup_filename(): string {
	return `plugins-${format_backup_timestamp()}.json`;
}

export async function ensure_directory_exists(
	dir_path: string,
): Promise<void> {
	try {
		await access(dir_path);
	} catch {
		await mkdir(dir_path, { recursive: true });
	}
}

/**
 * Get the current working directory (project path)
 */
export function get_current_project_path(): string {
	return process.cwd();
}

/**
 * Get the path to .mcp.json in the current project directory (project scope)
 */
export function get_project_mcp_json_path(): string {
	return join(get_current_project_path(), '.mcp.json');
}

/**
 * Get the path to the global .mcp.json in home directory (user scope)
 */
export function get_global_mcp_json_path(): string {
	return join(homedir(), '.mcp.json');
}

export function get_plugins_dir(): string {
	return join(get_base_dir().baseDir, 'plugins');
}

export function get_installed_plugins_path(): string {
	return join(get_plugins_dir(), 'installed_plugins.json');
}

export function get_known_marketplaces_path(): string {
	return join(get_plugins_dir(), 'known_marketplaces.json');
}

export function get_plugin_cache_dir(): string {
	return join(get_plugins_dir(), 'cache');
}

export function get_marketplaces_dir(): string {
	return join(get_plugins_dir(), 'marketplaces');
}

export function get_marketplace_manifest_path(name: string): string {
	return join(
		get_marketplaces_dir(),
		name,
		'.claude-plugin',
		'marketplace.json',
	);
}
