import { exec } from 'node:child_process';
import {
	lstat,
	readdir,
	readFile,
	readlink,
	rename,
	rm,
	symlink,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
	CachedPluginInfo,
	InstalledPluginsFile,
	KnownMarketplace,
	KnownMarketplacesFile,
	LinkedPluginInfo,
	LinkResult,
	MarketplaceManifest,
	UnlinkResult,
} from '../types.js';
import { atomic_json_write } from '../utils/atomic-write.js';
import {
	ensure_directory_exists,
	get_installed_plugins_path,
	get_known_marketplaces_path,
	get_marketplace_manifest_path,
	get_plugin_cache_dir,
} from '../utils/paths.js';

const execAsync = promisify(exec);

const EMPTY_INSTALLED: InstalledPluginsFile = {
	version: 2,
	plugins: {},
};

// --- Data reading ---

export async function read_installed_plugins(): Promise<InstalledPluginsFile> {
	try {
		const content = await readFile(
			get_installed_plugins_path(),
			'utf-8',
		);
		return JSON.parse(content) as InstalledPluginsFile;
	} catch {
		return { ...EMPTY_INSTALLED, plugins: {} };
	}
}

export async function write_installed_plugins(
	data: InstalledPluginsFile,
): Promise<void> {
	await atomic_json_write(
		get_installed_plugins_path(),
		() => data as unknown as Record<string, unknown>,
	);
}

export async function read_known_marketplaces(): Promise<KnownMarketplacesFile> {
	try {
		const content = await readFile(
			get_known_marketplaces_path(),
			'utf-8',
		);
		return JSON.parse(content) as KnownMarketplacesFile;
	} catch {
		return {};
	}
}

export async function read_marketplace_manifest(
	name: string,
): Promise<MarketplaceManifest | null> {
	try {
		const content = await readFile(
			get_marketplace_manifest_path(name),
			'utf-8',
		);
		return JSON.parse(content) as MarketplaceManifest;
	} catch {
		return null;
	}
}

// --- Git operations ---

async function get_marketplace_head_sha(
	marketplace_path: string,
): Promise<string | null> {
	try {
		const { stdout } = await execAsync(
			`git -C ${JSON.stringify(marketplace_path)} rev-parse HEAD`,
			{ timeout: 10_000 },
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

export interface RefreshResult {
	success: boolean;
	error?: string;
}

/**
 * Recover a marketplace clone stuck on a deleted branch.
 * Resets the fetch refspec, fetches all branches, and checks out the default branch.
 */
async function recover_deleted_branch(
	dir: string,
): Promise<{ recovered: boolean; error?: string }> {
	const q = JSON.stringify(dir);
	try {
		// Reset narrow refspec to fetch all branches
		await execAsync(`git -C ${q} remote set-branches origin '*'`, {
			timeout: 10_000,
		});
		await execAsync(`git -C ${q} fetch origin`, {
			timeout: 30_000,
		});

		// Detect default branch
		let default_branch = 'main';
		try {
			const { stdout } = await execAsync(
				`git -C ${q} symbolic-ref refs/remotes/origin/HEAD`,
				{ timeout: 5_000 },
			);
			const match = stdout
				.trim()
				.match(/refs\/remotes\/origin\/(.+)/);
			if (match) default_branch = match[1];
		} catch {
			// symbolic-ref not set — try main, then master
			try {
				await execAsync(
					`git -C ${q} rev-parse --verify origin/main`,
					{ timeout: 5_000 },
				);
				default_branch = 'main';
			} catch {
				default_branch = 'master';
			}
		}

		await execAsync(`git -C ${q} checkout ${default_branch}`, {
			timeout: 10_000,
		});
		await execAsync(
			`git -C ${q} reset --hard origin/${default_branch}`,
			{ timeout: 10_000 },
		);

		return { recovered: true };
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		return { recovered: false, error: msg };
	}
}

export async function refresh_marketplace(
	name: string,
	marketplace: KnownMarketplace,
): Promise<RefreshResult> {
	const dir = marketplace.installLocation;
	try {
		await execAsync(`git -C ${JSON.stringify(dir)} pull --ff-only`, {
			timeout: 30_000,
		});
		return { success: true };
	} catch {
		// Fast-forward failed — attempt recovery from deleted branch
		const recovery = await recover_deleted_branch(dir);
		if (recovery.recovered) {
			return { success: true };
		}
		return {
			success: false,
			error: `${name}: recovery failed: ${recovery.error}`,
		};
	}
}

export async function refresh_all_marketplaces(): Promise<
	Map<string, RefreshResult>
> {
	const marketplaces = await read_known_marketplaces();
	const results = new Map<string, RefreshResult>();

	for (const [name, info] of Object.entries(marketplaces)) {
		results.set(name, await refresh_marketplace(name, info));
	}

	return results;
}

// --- Orphaned version detection ---

async function find_orphaned_versions(
	marketplace: string,
	plugin_name: string,
): Promise<string[]> {
	const cache_dir = get_plugin_cache_dir();
	const plugin_dir = join(cache_dir, marketplace, plugin_name);
	const orphaned: string[] = [];

	try {
		const versions = await readdir(plugin_dir, {
			withFileTypes: true,
		});
		for (const entry of versions) {
			if (!entry.isDirectory()) continue;
			try {
				const marker = join(plugin_dir, entry.name, '.orphaned_at');
				await readFile(marker);
				orphaned.push(entry.name);
			} catch {
				// No .orphaned_at marker — not orphaned
			}
		}
	} catch {
		// Plugin dir doesn't exist
	}

	return orphaned;
}

// --- Staleness analysis ---

export function parse_plugin_key(key: string): {
	name: string;
	marketplace: string;
} {
	const at_index = key.lastIndexOf('@');
	return {
		name: at_index > 0 ? key.substring(0, at_index) : key,
		marketplace:
			at_index > 0 ? key.substring(at_index + 1) : 'unknown',
	};
}

export async function get_cached_plugins_info(): Promise<
	CachedPluginInfo[]
> {
	const installed = await read_installed_plugins();
	const marketplaces = await read_known_marketplaces();

	// Load all marketplace manifests
	const manifests = new Map<string, MarketplaceManifest>();
	for (const name of Object.keys(marketplaces)) {
		const manifest = await read_marketplace_manifest(name);
		if (manifest) manifests.set(name, manifest);
	}

	// Get HEAD SHAs for each marketplace clone
	const sha_cache = new Map<string, string | null>();
	for (const [name, info] of Object.entries(marketplaces)) {
		sha_cache.set(
			name,
			await get_marketplace_head_sha(info.installLocation),
		);
	}

	const results: CachedPluginInfo[] = [];

	for (const [key, entries] of Object.entries(installed.plugins)) {
		const entry = entries[0];
		if (!entry) continue;

		const { name, marketplace } = parse_plugin_key(key);

		// Version comparison
		const manifest = manifests.get(marketplace);
		const manifest_plugin = manifest?.plugins.find(
			(p) => p.name === name,
		);
		const latest_version = manifest_plugin?.version ?? null;
		const is_version_stale =
			latest_version !== null && latest_version !== entry.version;

		// SHA comparison
		const remote_sha = sha_cache.get(marketplace) ?? null;
		const is_sha_stale =
			remote_sha !== null &&
			entry.gitCommitSha !== '' &&
			remote_sha !== entry.gitCommitSha;

		// Orphaned versions
		const orphaned = await find_orphaned_versions(marketplace, name);

		results.push({
			key,
			name,
			marketplace,
			installedVersion: entry.version,
			latestVersion: latest_version,
			installedSha: entry.gitCommitSha,
			remoteSha: remote_sha,
			isVersionStale: is_version_stale,
			isShaStale: is_sha_stale,
			orphanedVersions: orphaned,
			installPath: entry.installPath,
		});
	}

	return results;
}

// --- Cache scanning ---

/**
 * Scan the cache directory on disk to find all plugin keys,
 * including marketplace-sourced plugins not tracked in installed_plugins.json.
 */
export async function scan_all_cache_keys(): Promise<string[]> {
	const cache_dir = get_plugin_cache_dir();
	const keys: string[] = [];

	try {
		const marketplaces = await readdir(cache_dir, {
			withFileTypes: true,
		});
		for (const mkt of marketplaces) {
			if (!mkt.isDirectory() && !mkt.isSymbolicLink()) continue;
			const mkt_path = join(cache_dir, mkt.name);

			try {
				const plugins = await readdir(mkt_path, {
					withFileTypes: true,
				});
				for (const plugin of plugins) {
					if (!plugin.isDirectory() && !plugin.isSymbolicLink())
						continue;
					keys.push(`${plugin.name}@${mkt.name}`);
				}
			} catch {
				// Skip unreadable marketplace dirs
			}
		}
	} catch {
		// Cache dir doesn't exist
	}

	return keys;
}

// --- Cache clearing ---

function is_safe_cache_path(path: string): boolean {
	const cache_dir = resolve(get_plugin_cache_dir());
	const target = resolve(path);
	return target.startsWith(cache_dir + '/');
}

export async function clear_plugin_caches(
	keys: string[],
): Promise<{ cleared: string[]; errors: string[] }> {
	const installed = await read_installed_plugins();
	const marketplaces = await read_known_marketplaces();
	const cleared: string[] = [];
	const errors: string[] = [];

	// Collect unique marketplaces to refresh
	const marketplace_names = new Set<string>();
	for (const key of keys) {
		const { marketplace } = parse_plugin_key(key);
		marketplace_names.add(marketplace);
	}

	// Refresh relevant marketplaces first
	for (const mkt_name of marketplace_names) {
		const mkt_info = marketplaces[mkt_name];
		if (mkt_info) {
			const result = await refresh_marketplace(mkt_name, mkt_info);
			if (!result.success) {
				errors.push(`Marketplace refresh failed: ${result.error}`);
			}
		}
	}

	// Delete cache dirs and remove from installed_plugins.json
	const cache_dir = get_plugin_cache_dir();
	for (const key of keys) {
		const { name, marketplace } = parse_plugin_key(key);
		const plugin_cache_path = join(cache_dir, marketplace, name);

		if (!is_safe_cache_path(plugin_cache_path)) {
			errors.push(`Unsafe path, skipped: ${plugin_cache_path}`);
			continue;
		}

		try {
			await rm(plugin_cache_path, {
				recursive: true,
				force: true,
			});
			delete installed.plugins[key];
			cleared.push(key);
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : 'Unknown error';
			errors.push(`Failed to clear ${key}: ${msg}`);
		}
	}

	// Write back updated installed_plugins.json
	await write_installed_plugins(installed);

	return { cleared, errors };
}

// --- Orphaned cleanup ---

export async function clean_orphaned_versions(): Promise<{
	cleaned: number;
	paths: string[];
}> {
	const cache_dir = get_plugin_cache_dir();
	const cleaned_paths: string[] = [];

	try {
		const marketplaces = await readdir(cache_dir, {
			withFileTypes: true,
		});
		for (const mkt of marketplaces) {
			if (!mkt.isDirectory()) continue;
			const mkt_path = join(cache_dir, mkt.name);

			const plugins = await readdir(mkt_path, {
				withFileTypes: true,
			});
			for (const plugin of plugins) {
				if (!plugin.isDirectory()) continue;
				const plugin_path = join(mkt_path, plugin.name);

				const versions = await readdir(plugin_path, {
					withFileTypes: true,
				});
				for (const version of versions) {
					if (!version.isDirectory()) continue;
					const version_path = join(plugin_path, version.name);

					try {
						await readFile(join(version_path, '.orphaned_at'));
						// Has orphaned marker — safe to delete
						if (is_safe_cache_path(version_path)) {
							await rm(version_path, {
								recursive: true,
								force: true,
							});
							cleaned_paths.push(
								`${mkt.name}/${plugin.name}/${version.name}`,
							);
						}
					} catch {
						// No marker — keep it
					}
				}
			}
		}
	} catch {
		// Cache dir doesn't exist
	}

	return { cleaned: cleaned_paths.length, paths: cleaned_paths };
}

// --- Cache linking ---

/**
 * Symlink a local directory into the plugin cache.
 * Backs up existing cache directory if present.
 */
export async function link_local_plugin(
	local_path: string,
	key: string,
): Promise<LinkResult> {
	const resolved_path = resolve(local_path);
	const { name, marketplace } = parse_plugin_key(key);

	// Validate local path exists
	try {
		const stat = await lstat(resolved_path);
		if (!stat.isDirectory()) {
			return {
				success: false,
				key,
				symlinkPath: '',
				targetPath: resolved_path,
				error: `Path is not a directory: ${resolved_path}`,
			};
		}
	} catch {
		return {
			success: false,
			key,
			symlinkPath: '',
			targetPath: resolved_path,
			error: `Path does not exist: ${resolved_path}`,
		};
	}

	const cache_dir = get_plugin_cache_dir();
	const plugin_dir = join(cache_dir, marketplace, name);

	// Ensure parent directory exists
	await ensure_directory_exists(join(cache_dir, marketplace));

	// If plugin_dir exists and is not a symlink, back it up
	try {
		const stat = await lstat(plugin_dir);
		if (stat.isSymbolicLink()) {
			// Already a symlink — remove it
			await rm(plugin_dir);
		} else if (stat.isDirectory()) {
			// Back up existing directory
			const backup_path = `${plugin_dir}.backup`;
			await rename(plugin_dir, backup_path);
		}
	} catch {
		// Doesn't exist — fine
	}

	// Create symlink
	try {
		await symlink(resolved_path, plugin_dir, 'dir');
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		return {
			success: false,
			key,
			symlinkPath: plugin_dir,
			targetPath: resolved_path,
			error: `Failed to create symlink: ${msg}`,
		};
	}

	return {
		success: true,
		key,
		symlinkPath: plugin_dir,
		targetPath: resolved_path,
	};
}

/**
 * Remove a symlink from the plugin cache and restore backup if present.
 */
export async function unlink_local_plugin(
	key: string,
): Promise<UnlinkResult> {
	const { name, marketplace } = parse_plugin_key(key);
	const cache_dir = get_plugin_cache_dir();
	const plugin_dir = join(cache_dir, marketplace, name);

	// Verify it's actually a symlink
	try {
		const stat = await lstat(plugin_dir);
		if (!stat.isSymbolicLink()) {
			return {
				success: false,
				key,
				restored: false,
				error: `'${key}' is not a symlink — nothing to unlink`,
			};
		}
	} catch {
		return {
			success: false,
			key,
			restored: false,
			error: `'${key}' not found in cache`,
		};
	}

	// Remove symlink
	await rm(plugin_dir);

	// Restore backup if present
	const backup_path = `${plugin_dir}.backup`;
	let restored = false;
	try {
		await lstat(backup_path);
		await rename(backup_path, plugin_dir);
		restored = true;
	} catch {
		// No backup to restore
	}

	return { success: true, key, restored };
}

/**
 * List all symlinked entries in the plugin cache.
 */
export async function list_linked_plugins(): Promise<
	LinkedPluginInfo[]
> {
	const cache_dir = get_plugin_cache_dir();
	const links: LinkedPluginInfo[] = [];

	try {
		const marketplaces = await readdir(cache_dir, {
			withFileTypes: true,
		});
		for (const mkt of marketplaces) {
			if (!mkt.isDirectory() && !mkt.isSymbolicLink()) continue;
			const mkt_path = join(cache_dir, mkt.name);

			let entries;
			try {
				entries = await readdir(mkt_path, { withFileTypes: true });
			} catch {
				continue;
			}

			for (const entry of entries) {
				const entry_path = join(mkt_path, entry.name);
				try {
					const stat = await lstat(entry_path);
					if (stat.isSymbolicLink()) {
						const target = await readlink(entry_path);
						links.push({
							key: `${entry.name}@${mkt.name}`,
							symlinkPath: entry_path,
							targetPath: resolve(join(cache_dir, mkt.name), target),
						});
					}
				} catch {
					// Skip on error
				}
			}
		}
	} catch {
		// Cache dir doesn't exist
	}

	return links;
}
