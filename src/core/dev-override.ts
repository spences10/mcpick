import { readFile } from 'node:fs/promises';
import type {
	DevOverrideEntry,
	DevOverridesFile,
	McpScope,
	McpServerBase,
} from '../types.js';
import { atomic_json_write } from '../utils/atomic-write.js';
import {
	get_claude_config_path,
	get_current_project_path,
	get_dev_overrides_path,
	get_project_mcp_json_path,
} from '../utils/paths.js';
import {
	detect_server_scope,
	find_server_in_scope,
} from './config.js';

const EMPTY_OVERRIDES: DevOverridesFile = {
	version: 1,
	overrides: {},
};

export async function read_dev_overrides(): Promise<DevOverridesFile> {
	try {
		const content = await readFile(get_dev_overrides_path(), 'utf-8');
		return JSON.parse(content) as DevOverridesFile;
	} catch {
		return { ...EMPTY_OVERRIDES, overrides: {} };
	}
}

async function write_dev_overrides(
	data: DevOverridesFile,
): Promise<void> {
	await atomic_json_write(
		get_dev_overrides_path(),
		() => data as unknown as Record<string, unknown>,
	);
}

/**
 * Write a server config into the appropriate scope config file.
 */
async function write_server_to_scope(
	name: string,
	server: McpServerBase,
	scope: McpScope,
): Promise<void> {
	if (scope === 'user') {
		await atomic_json_write(get_claude_config_path(), (existing) => {
			if (!existing.mcpServers) {
				existing.mcpServers = {};
			}
			(existing.mcpServers as Record<string, unknown>)[name] = server;
			return existing;
		});
	} else if (scope === 'local') {
		const cwd = get_current_project_path();
		await atomic_json_write(get_claude_config_path(), (existing) => {
			if (!existing.projects) {
				existing.projects = {};
			}
			const projects = existing.projects as Record<
				string,
				Record<string, unknown>
			>;
			if (!projects[cwd]) {
				projects[cwd] = {};
			}
			if (!projects[cwd].mcpServers) {
				projects[cwd].mcpServers = {};
			}
			(projects[cwd].mcpServers as Record<string, unknown>)[name] =
				server;
			return existing;
		});
	} else if (scope === 'project') {
		await atomic_json_write(
			get_project_mcp_json_path(),
			(existing) => {
				if (!existing.mcpServers) {
					existing.mcpServers = {};
				}
				(existing.mcpServers as Record<string, unknown>)[name] =
					server;
				return existing;
			},
		);
	}
}

/**
 * Apply a dev override: store original config, swap in local dev command.
 */
export async function apply_dev_override(
	name: string,
	command: string,
	args: string[],
	scope?: McpScope,
): Promise<{ success: boolean; scope: McpScope; error?: string }> {
	// Find the server
	let found: { server: McpServerBase; scope: McpScope } | null;
	if (scope) {
		found = await find_server_in_scope(name, scope);
	} else {
		found = await detect_server_scope(name);
	}

	if (!found) {
		return {
			success: false,
			scope: scope || 'local',
			error: `Server '${name}' not found${scope ? ` in ${scope} scope` : ' in any scope'}`,
		};
	}

	// Check not already overridden
	const overrides = await read_dev_overrides();
	if (overrides.overrides[name]) {
		return {
			success: false,
			scope: found.scope,
			error: `Server '${name}' already has a dev override. Run 'mcpick dev --restore ${name}' first.`,
		};
	}

	// Build dev server config
	const dev_server: McpServerBase = {
		command,
		...(args.length > 0 ? { args } : {}),
	};

	// Store original
	overrides.overrides[name] = {
		original: found.server,
		dev: dev_server,
		scope: found.scope,
		createdAt: new Date().toISOString(),
	};
	await write_dev_overrides(overrides);

	// Write dev config
	await write_server_to_scope(name, dev_server, found.scope);

	return { success: true, scope: found.scope };
}

/**
 * Restore original server config from dev override.
 */
export async function restore_dev_override(
	name: string,
): Promise<{ success: boolean; error?: string }> {
	const overrides = await read_dev_overrides();
	const entry = overrides.overrides[name];

	if (!entry) {
		return {
			success: false,
			error: `No dev override found for '${name}'`,
		};
	}

	// Write original config back
	await write_server_to_scope(name, entry.original, entry.scope);

	// Remove override entry
	delete overrides.overrides[name];
	await write_dev_overrides(overrides);

	return { success: true };
}

/**
 * Restore all dev overrides.
 */
export async function restore_all_dev_overrides(): Promise<{
	restored: string[];
	errors: string[];
}> {
	const overrides = await read_dev_overrides();
	const restored: string[] = [];
	const errors: string[] = [];

	for (const name of Object.keys(overrides.overrides)) {
		const result = await restore_dev_override(name);
		if (result.success) {
			restored.push(name);
		} else {
			errors.push(`${name}: ${result.error}`);
		}
	}

	return { restored, errors };
}

/**
 * List all active dev overrides.
 */
export async function list_dev_overrides(): Promise<
	Array<{ name: string } & DevOverrideEntry>
> {
	const overrides = await read_dev_overrides();
	return Object.entries(overrides.overrides).map(([name, entry]) => ({
		name,
		...entry,
	}));
}
