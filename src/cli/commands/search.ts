import { defineCommand } from 'citty';
import {
	RegistryPackage,
	RegistryServer,
	search_registry,
} from '../../core/registry-api.js';
import { error, output } from '../output.js';

/**
 * Pick the most useful install hint: an npm package with a runtime
 * hint beats everything else. Result feeds a future `add
 * --from-registry` flow, so keep it machine-readable.
 */
function install_hint(
	packages: RegistryPackage[],
): { command: string; package: RegistryPackage } | undefined {
	const npm = packages.find((pkg) => pkg.registryType === 'npm');
	const selected = npm ?? packages[0];
	if (!selected) return undefined;
	const version = selected.version ? `@${selected.version}` : '';
	switch (selected.registryType) {
		case 'npm': {
			const runner = selected.runtimeHint ?? 'npx';
			return {
				command: `${runner} -y ${selected.identifier}${version}`,
				package: selected,
			};
		}
		case 'oci':
			return {
				command: `docker run ${selected.identifier}`,
				package: selected,
			};
		default:
			return {
				command: `${selected.registryType}: ${selected.identifier}${version}`,
				package: selected,
			};
	}
}

function format_date(iso?: string): string {
	if (!iso) return 'unknown';
	return iso.slice(0, 10);
}

function format_human(server: RegistryServer): string {
	const lines: string[] = [];
	const version = server.version ? `@${server.version}` : '';
	lines.push(`${server.name}${version}`);
	if (server.description) {
		lines.push(`  ${server.description.split('\n')[0]}`);
	}
	lines.push(
		server.source_repo
			? `  source: ${server.source_repo}`
			: '  source: ⚠ no source repo linked',
	);
	lines.push(`  published: ${format_date(server.published_at)}`);
	const hint = install_hint(server.packages);
	if (hint) {
		lines.push(`  install: ${hint.command}`);
	} else {
		lines.push('  install: ⚠ no package published');
	}
	return lines.join('\n');
}

export default defineCommand({
	meta: {
		name: 'search',
		description: 'Search the official MCP Registry for servers',
	},
	args: {
		query: {
			type: 'positional',
			description: 'Search query',
			required: true,
		},
		limit: {
			type: 'string',
			description: 'Maximum results (default: 10)',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const limit = args.limit ? Number.parseInt(args.limit, 10) : 10;
		if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
			error('Invalid --limit. Use a number between 1 and 100.');
		}

		let results: RegistryServer[];
		try {
			results = await search_registry(args.query, limit);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Registry search failed';
			if (args.json) {
				output({ error: message }, true);
				process.exit(1);
			}
			error(message);
		}

		if (args.json) {
			output(results, true);
			return;
		}

		if (results.length === 0) {
			console.log(
				`No servers found for '${args.query}' in the official MCP Registry.`,
			);
			return;
		}

		console.log(
			`Found ${results.length} server(s) in the official MCP Registry:\n`,
		);
		for (const server of results) {
			console.log(format_human(server));
			console.log('');
		}
		console.log(
			'Note: the registry is minimally moderated — prefer entries with a linked source repo and pinned versions.',
		);
	},
});
