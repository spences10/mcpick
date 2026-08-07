import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	get_backup_filename,
	get_backups_dir,
	get_base_dir,
	get_claude_config_path,
	get_claude_settings_path,
	get_dev_overrides_path,
	get_disabled_hooks_path,
	get_global_mcp_json_path,
	get_installed_plugins_path,
	get_known_marketplaces_path,
	get_marketplace_manifest_path,
	get_marketplaces_dir,
	get_mcpick_dir,
	get_plugin_backup_filename,
	get_plugin_cache_dir,
	get_plugins_dir,
	get_profile_path,
	get_profiles_dir,
	get_server_registry_path,
} from './paths.js';

describe('get_base_dir', () => {
	it('returns ~/.claude by default', () => {
		const { baseDir, coLocatedConfig } = get_base_dir();
		if (!process.env.CLAUDE_CONFIG_DIR) {
			expect(baseDir).toBe(join(homedir(), '.claude'));
			expect(coLocatedConfig).toBe(false);
		}
	});
});

describe('path structure', () => {
	it('config path is sibling to base dir by default', () => {
		const path = get_claude_config_path();
		expect(path).toContain('.claude.json');
	});

	it('settings path is inside base dir', () => {
		const path = get_claude_settings_path();
		expect(path).toContain('settings.json');
	});

	it('mcpick dir is inside base dir', () => {
		const dir = get_mcpick_dir();
		expect(dir).toContain('mcpick');
	});

	it('dev overrides is inside mcpick dir', () => {
		const path = get_dev_overrides_path();
		expect(path).toContain('mcpick');
		expect(path).toContain('dev-overrides.json');
	});

	it('server registry is inside mcpick dir', () => {
		const path = get_server_registry_path();
		expect(path).toContain('mcpick');
		expect(path).toContain('servers.json');
	});

	it('backups dir is inside mcpick dir', () => {
		expect(get_backups_dir()).toContain('backups');
	});

	it('profiles dir is inside mcpick dir', () => {
		expect(get_profiles_dir()).toContain('profiles');
	});

	it('plugins dir is inside base dir', () => {
		expect(get_plugins_dir()).toContain('plugins');
	});

	it('installed plugins path is inside plugins dir', () => {
		expect(get_installed_plugins_path()).toContain(
			'installed_plugins.json',
		);
	});

	it('known marketplaces path is inside plugins dir', () => {
		expect(get_known_marketplaces_path()).toContain(
			'known_marketplaces.json',
		);
	});

	it('plugin cache dir is inside plugins dir', () => {
		expect(get_plugin_cache_dir()).toContain('cache');
	});

	it('marketplaces dir is inside plugins dir', () => {
		expect(get_marketplaces_dir()).toContain('marketplaces');
	});

	it('disabled hooks path is inside mcpick dir', () => {
		expect(get_disabled_hooks_path()).toContain(
			'disabled-hooks.json',
		);
	});

	it('global mcp json is in home dir', () => {
		expect(get_global_mcp_json_path()).toBe(
			join(homedir(), '.mcp.json'),
		);
	});
});

describe('get_profile_path', () => {
	it('adds .json extension when missing', () => {
		const path = get_profile_path('my-profile');
		expect(path).toMatch(/my-profile\.json$/);
	});

	it('does not double .json extension', () => {
		const path = get_profile_path('my-profile.json');
		expect(path).toMatch(/my-profile\.json$/);
		expect(path).not.toContain('.json.json');
	});
});

describe('get_marketplace_manifest_path', () => {
	it('builds correct path structure', () => {
		const path = get_marketplace_manifest_path('acme-tools');
		expect(path).toContain('acme-tools');
		expect(path).toContain('.claude-plugin');
		expect(path).toContain('marketplace.json');
	});
});

describe('backup filenames', () => {
	it('generates timestamped server backup filename', () => {
		const filename = get_backup_filename();
		expect(filename).toMatch(
			/^mcp-servers-\d{4}-\d{2}-\d{2}-\d{6}\.json$/,
		);
	});

	it('generates timestamped plugin backup filename', () => {
		const filename = get_plugin_backup_filename();
		expect(filename).toMatch(
			/^plugins-\d{4}-\d{2}-\d{2}-\d{6}\.json$/,
		);
	});

	it('generates unique filenames on successive calls', async () => {
		const a = get_backup_filename();
		// Wait a tick to get different timestamp
		await new Promise((r) => setTimeout(r, 1100));
		const b = get_backup_filename();
		expect(a).not.toBe(b);
	});
});

describe('mcpick dir XDG location and legacy migration', () => {
	async function fresh_paths() {
		vi.resetModules();
		return await import('./paths.js');
	}

	function make_env() {
		const root = mkdtempSync(join(tmpdir(), 'mcpick-paths-'));
		const claude = join(root, '.claude');
		const xdg = join(root, 'xdg');
		mkdirSync(claude, { recursive: true });
		vi.stubEnv('CLAUDE_CONFIG_DIR', claude);
		vi.stubEnv('XDG_CONFIG_HOME', xdg);
		vi.stubEnv('MCPICK_CONFIG_DIR', '');
		return { root, claude, xdg };
	}

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('prefers MCPICK_CONFIG_DIR override', async () => {
		const { root } = make_env();
		vi.stubEnv('MCPICK_CONFIG_DIR', join(root, 'custom'));
		const { get_mcpick_dir } = await fresh_paths();
		expect(get_mcpick_dir()).toBe(join(root, 'custom'));
	});

	it('uses XDG_CONFIG_HOME/mcpick and creates nothing eagerly', async () => {
		const { xdg } = make_env();
		const { get_mcpick_dir } = await fresh_paths();
		expect(get_mcpick_dir()).toBe(join(xdg, 'mcpick'));
		expect(existsSync(join(xdg, 'mcpick'))).toBe(false);
	});

	it('moves legacy ~/.claude/mcpick state into the XDG dir once', async () => {
		const { claude, xdg } = make_env();
		const legacy = join(claude, 'mcpick');
		mkdirSync(legacy, { recursive: true });
		writeFileSync(join(legacy, 'servers.json'), '{}');

		const { get_mcpick_dir } = await fresh_paths();
		expect(get_mcpick_dir()).toBe(join(xdg, 'mcpick'));
		expect(existsSync(join(xdg, 'mcpick', 'servers.json'))).toBe(
			true,
		);
		expect(existsSync(legacy)).toBe(false);
	});

	it('leaves legacy dir untouched when the XDG dir already exists', async () => {
		const { claude, xdg } = make_env();
		const legacy = join(claude, 'mcpick');
		mkdirSync(legacy, { recursive: true });
		mkdirSync(join(xdg, 'mcpick'), { recursive: true });

		const { get_mcpick_dir } = await fresh_paths();
		expect(get_mcpick_dir()).toBe(join(xdg, 'mcpick'));
		expect(existsSync(legacy)).toBe(true);
	});
});
