/**
 * Official MCP Registry client (registry.modelcontextprotocol.io).
 *
 * Verified live against the v0 API (2026-08):
 *   GET /v0/servers?search=<query>&limit=<n>
 * returns {
 *   servers: [{
 *     server: {
 *       name, description, version,
 *       repository?: { url, source },
 *       packages?: [{
 *         registryType ('npm'|'oci'|...), identifier, version,
 *         runtimeHint?, transport?, runtimeArguments?,
 *         environmentVariables?,
 *       }],
 *       remotes?: [{ type, url, headers? }],
 *     },
 *     _meta: {
 *       'io.modelcontextprotocol.registry/official': {
 *         status, publishedAt, updatedAt, isLatest,
 *       },
 *     },
 *   }],
 *   metadata: { nextCursor?, count },
 * }
 *
 * The registry is minimally moderated, so this client surfaces trust
 * signals (source repo presence, package provenance) rather than
 * hiding them.
 */
import { readFileSync } from 'node:fs';

const REGISTRY_BASE_URL =
	process.env.MCPICK_REGISTRY_URL ??
	'https://registry.modelcontextprotocol.io';
const REQUEST_TIMEOUT_MS = 10_000;

export interface RegistryPackage {
	registryType: string;
	identifier: string;
	version?: string;
	runtimeHint?: string;
	transport?: { type: string };
	runtimeArguments?: Array<{
		type: string;
		name?: string;
		value?: string;
		isRequired?: boolean;
	}>;
	environmentVariables?: Array<{
		name: string;
		description?: string;
		default?: string;
		isRequired?: boolean;
		isSecret?: boolean;
	}>;
}

export interface RegistryServer {
	name: string;
	description?: string;
	version?: string;
	source_repo?: string;
	published_at?: string;
	updated_at?: string;
	status?: string;
	packages: RegistryPackage[];
}

/**
 * Resolve the mcpick version from package.json (src/core is two
 * levels deep, bundled dist is one — try both).
 */
function mcpick_version(): string {
	for (const relative of ['../../package.json', '../package.json']) {
		try {
			const data: unknown = JSON.parse(
				readFileSync(new URL(relative, import.meta.url), 'utf-8'),
			);
			if (
				data &&
				typeof data === 'object' &&
				'version' in data &&
				typeof data.version === 'string'
			) {
				return data.version;
			}
		} catch {
			// try the next candidate path
		}
	}
	return '0.0.0';
}

interface OfficialMeta {
	status?: string;
	publishedAt?: string;
	updatedAt?: string;
	isLatest?: boolean;
}

interface RawServerEntry {
	server?: {
		name?: string;
		description?: string;
		version?: string;
		repository?: { url?: string; source?: string };
		packages?: RegistryPackage[];
	};
	_meta?: Record<string, OfficialMeta | undefined>;
}

function map_entry(entry: RawServerEntry): RegistryServer | null {
	const server = entry.server;
	if (!server || typeof server.name !== 'string' || !server.name) {
		return null;
	}
	return {
		name: server.name,
		...(server.description
			? { description: server.description }
			: {}),
		...(server.version ? { version: server.version } : {}),
		...(server.repository?.url
			? { source_repo: server.repository.url }
			: {}),
		packages: Array.isArray(server.packages) ? server.packages : [],
	};
}

function official_meta(entry: RawServerEntry): OfficialMeta {
	return (
		entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {}
	);
}

/** Find an exact server name through the registry search API. */
export async function find_registry_server(
	name: string,
): Promise<RegistryServer> {
	const results = await search_registry(name, 100);
	const exact = results.find((server) => server.name === name);
	if (!exact) {
		throw new Error(
			`Server '${name}' not found in the MCP registry.`,
		);
	}
	return exact;
}

/**
 * Search the official MCP Registry. Returns latest-version entries
 * only, deduplicated by name. Throws with a clear message on network
 * failure, timeout, or non-200 response.
 */
export async function search_registry(
	query: string,
	limit = 10,
): Promise<RegistryServer[]> {
	const url =
		`${REGISTRY_BASE_URL}/v0/servers` +
		`?search=${encodeURIComponent(query)}&limit=${limit}`;

	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		REQUEST_TIMEOUT_MS,
	);

	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': `mcpick/${mcpick_version()}`,
			},
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error(
				`Registry request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
			);
		}
		throw new Error(
			`Could not reach the MCP registry: ${err instanceof Error ? err.message : 'network error'}`,
		);
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		throw new Error(
			`Registry request failed: HTTP ${response.status}.`,
		);
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new Error('Registry returned invalid JSON.');
	}

	const raw_entries =
		body &&
		typeof body === 'object' &&
		Array.isArray((body as { servers?: unknown }).servers)
			? (body as { servers: RawServerEntry[] }).servers
			: [];

	const seen = new Set<string>();
	const results: RegistryServer[] = [];
	for (const entry of raw_entries) {
		// The registry returns one entry per published version;
		// keep only the latest of each server.
		if (official_meta(entry).isLatest === false) continue;
		const meta = official_meta(entry);
		const mapped = map_entry(entry);
		if (!mapped || seen.has(mapped.name)) continue;
		seen.add(mapped.name);
		if (meta.publishedAt) mapped.published_at = meta.publishedAt;
		if (meta.updatedAt) mapped.updated_at = meta.updatedAt;
		if (meta.status) mapped.status = meta.status;
		results.push(mapped);
	}
	return results;
}
