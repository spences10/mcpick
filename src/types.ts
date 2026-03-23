import * as v from 'valibot';
import {
	mcp_server_schema,
	mcp_server_schema_base,
} from './core/validation.js';

export type McpServer = v.InferOutput<typeof mcp_server_schema>;
export type McpServerBase = v.InferOutput<
	typeof mcp_server_schema_base
>;

export interface ClaudeConfig {
	mcpServers?: {
		[key: string]: McpServerBase;
	};
}

export interface ServerRegistry {
	servers: McpServer[];
}

export interface BackupInfo {
	filename: string;
	timestamp: Date;
	path: string;
}

export type MenuAction =
	| 'edit-config'
	| 'edit-plugins'
	| 'manage-cache'
	| 'backup'
	| 'add-server'
	| 'restore'
	| 'load-profile'
	| 'save-profile'
	| 'exit';

// installed_plugins.json v2 format
export interface InstalledPluginEntry {
	scope: string;
	installPath: string;
	version: string;
	installedAt: string;
	lastUpdated: string;
	gitCommitSha: string;
}

export interface InstalledPluginsFile {
	version: number;
	plugins: Record<string, InstalledPluginEntry[]>;
}

// known_marketplaces.json format
export interface MarketplaceSource {
	source: 'github' | 'git';
	repo?: string;
	url?: string;
}

export interface KnownMarketplace {
	source: MarketplaceSource;
	installLocation: string;
	lastUpdated: string;
	autoUpdate?: boolean;
}

export type KnownMarketplacesFile = Record<string, KnownMarketplace>;

// marketplace.json plugin entry
export interface MarketplacePluginEntry {
	name: string;
	version: string;
	description?: string;
	source: string;
	[key: string]: unknown;
}

export interface MarketplaceManifest {
	name: string;
	metadata?: { version?: string };
	plugins: MarketplacePluginEntry[];
}

// Computed staleness info for display
export interface CachedPluginInfo {
	key: string;
	name: string;
	marketplace: string;
	installedVersion: string;
	latestVersion: string | null;
	installedSha: string;
	remoteSha: string | null;
	isVersionStale: boolean;
	isShaStale: boolean;
	orphanedVersions: string[];
	installPath: string;
}

export interface ClaudeSettings {
	enabledPlugins?: Record<string, boolean>;
	extraKnownMarketplaces?: Record<string, unknown>;
	[key: string]: unknown;
}

// Scope for MCP server installation
// - local: Project-specific in ~/.claude.json (default)
// - project: Shared via .mcp.json in project root
// - user: Global in ~/.claude.json for all projects
export type McpScope = 'local' | 'project' | 'user';

// Dev override types (issue #33)
export interface DevOverrideEntry {
	original: McpServerBase;
	dev: McpServerBase;
	scope: McpScope;
	createdAt: string;
}

export interface DevOverridesFile {
	version: number;
	overrides: Record<string, DevOverrideEntry>;
}

// Cache link types (issue #32)
export interface LinkResult {
	success: boolean;
	key: string;
	symlinkPath: string;
	targetPath: string;
	error?: string;
}

export interface UnlinkResult {
	success: boolean;
	key: string;
	restored: boolean;
	error?: string;
}

export interface LinkedPluginInfo {
	key: string;
	symlinkPath: string;
	targetPath: string;
}
