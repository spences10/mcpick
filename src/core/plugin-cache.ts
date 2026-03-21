import { exec } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type {
	CachedPluginInfo,
	InstalledPluginsFile,
	KnownMarketplace,
	KnownMarketplacesFile,
	MarketplaceManifest,
} from '../types.js';
import { atomic_json_write } from '../utils/atomic-write.js';
import {
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
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Unknown error';
		return { success: false, error: `${name}: ${message}` };
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

function parse_plugin_key(key: string): {
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
