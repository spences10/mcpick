import { defineCommand } from 'citty';
import {
	apply_dev_override,
	list_dev_overrides,
	restore_all_dev_overrides,
	restore_dev_override,
} from '../../core/dev-override.js';
import type { McpScope } from '../../types.js';
import { error, output } from '../output.js';

const apply = defineCommand({
	meta: {
		name: 'apply',
		description:
			'Override an MCP server with a local dev command',
	},
	args: {
		name: {
			type: 'positional',
			description: 'Server name to override',
			required: true,
		},
		command: {
			type: 'string',
			description: 'Local command to run',
			required: true,
		},
		args: {
			type: 'string',
			description: 'Comma-separated arguments',
		},
		scope: {
			type: 'string',
			description:
				'Scope to search: local, project, or user (default: auto-detect)',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as McpScope | undefined;
		if (scope && !['local', 'project', 'user'].includes(scope)) {
			error(
				`Invalid scope: ${scope}. Use local, project, or user.`,
			);
		}

		const cmd_args = args.args
			? args.args.split(',')
			: [];

		const result = await apply_dev_override(
			args.name,
			args.command,
			cmd_args,
			scope,
		);

		if (args.json) {
			output(result, true);
		} else if (result.success) {
			console.log(
				`Dev override applied for '${args.name}' (scope: ${result.scope})`,
			);
			console.log(`  command: ${args.command}${cmd_args.length > 0 ? ` ${cmd_args.join(' ')}` : ''}`);
			console.log(
				'\nRestart Claude Code or run /reload-plugins to pick up changes.',
			);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

const restore = defineCommand({
	meta: {
		name: 'restore',
		description: 'Restore original server config from dev override',
	},
	args: {
		name: {
			type: 'positional',
			description:
				'Server name to restore (omit with --all to restore all)',
			required: false,
		},
		all: {
			type: 'boolean',
			description: 'Restore all dev overrides',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		if (args.all) {
			const result = await restore_all_dev_overrides();

			if (args.json) {
				output(result, true);
			} else {
				if (result.restored.length === 0 && result.errors.length === 0) {
					console.log('No dev overrides to restore.');
				} else {
					for (const name of result.restored) {
						console.log(`Restored: ${name}`);
					}
					for (const err of result.errors) {
						console.error(`Error: ${err}`);
					}
				}
			}
			return;
		}

		if (!args.name) {
			error(
				'Specify a server name or use --all. Run "mcpick dev list" to see active overrides.',
			);
		}

		const result = await restore_dev_override(args.name);

		if (args.json) {
			output(result, true);
		} else if (result.success) {
			console.log(`Restored original config for '${args.name}'`);
			console.log(
				'\nRestart Claude Code or run /reload-plugins to pick up changes.',
			);
		} else {
			error(result.error || 'Unknown error');
		}
	},
});

const list = defineCommand({
	meta: {
		name: 'list',
		description: 'List active dev overrides',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const overrides = await list_dev_overrides();

		if (args.json) {
			output(overrides, true);
			return;
		}

		if (overrides.length === 0) {
			console.log('No active dev overrides.');
			return;
		}

		for (const o of overrides) {
			const orig = o.original as Record<string, unknown>;
			const dev = o.dev as Record<string, unknown>;
			const original_cmd = orig.command
				? `${orig.command}${orig.args ? ' ' + (orig.args as string[]).join(' ') : ''}`
				: orig.url || '?';
			const dev_cmd = `${dev.command}${dev.args ? ' ' + (dev.args as string[]).join(' ') : ''}`;

			console.log(`${o.name}  (scope: ${o.scope})`);
			console.log(`  original: ${original_cmd}`);
			console.log(`  dev:      ${dev_cmd}`);
			console.log(`  since:    ${o.createdAt}`);
		}
	},
});

export default defineCommand({
	meta: {
		name: 'dev',
		description: 'MCP server local development workflow',
	},
	subCommands: {
		apply,
		restore,
		list,
	},
});
