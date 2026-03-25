import { defineCommand } from 'citty';
import {
	check_restored_hooks,
	disable_plugin_hook,
	enable_plugin_hook,
	read_disabled_hooks,
	redisable_restored_hooks,
} from '../../core/hook-state.js';
import {
	add_hook,
	get_all_hooks,
	HookScope,
	remove_hook,
} from '../../core/settings.js';
import { HookEventType, HookHandler } from '../../types.js';
import { error, output } from '../output.js';

const list = defineCommand({
	meta: {
		name: 'list',
		description:
			'List all configured hooks (settings + plugins + disabled)',
	},
	args: {
		scope: {
			type: 'string',
			description:
				'Filter by source: user, project, project-local, or plugin',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const hooks = await get_all_hooks();
		const disabled = await read_disabled_hooks();

		const filtered = args.scope
			? hooks.filter(
					(h) => h.source === args.scope || h.scope === args.scope,
				)
			: hooks;

		if (args.json) {
			output({ active: filtered, disabled }, true);
		} else {
			if (filtered.length === 0 && disabled.length === 0) {
				console.log('No hooks configured.');
				return;
			}

			if (filtered.length > 0) {
				for (let i = 0; i < filtered.length; i++) {
					const h = filtered[i];
					const detail =
						h.handler.command ||
						h.handler.url ||
						h.handler.prompt ||
						'(unknown)';
					const matcher_str = h.matcher ? ` [${h.matcher}]` : '';
					const source =
						h.source === 'plugin'
							? `plugin: ${h.plugin_key}`
							: h.scope;
					console.log(
						`${i}: [${source}] ${h.event}${matcher_str} → ${h.handler.type}: ${detail}`,
					);
				}
			}

			if (disabled.length > 0) {
				console.log('\nDisabled:');
				for (let i = 0; i < disabled.length; i++) {
					const d = disabled[i];
					const detail =
						d.original_handler.command ||
						d.original_handler.url ||
						d.original_handler.prompt ||
						'(unknown)';
					const matcher_str = d.matcher ? ` [${d.matcher}]` : '';
					console.log(
						`${i}: [${d.plugin_key}] ${d.event}${matcher_str} → ${d.original_handler.type}: ${detail}`,
					);
				}
			}
		}
	},
});

const disable = defineCommand({
	meta: {
		name: 'disable',
		description:
			'Disable a hook by index (use "hooks list" to see indices)',
	},
	args: {
		index: {
			type: 'positional',
			description: 'Hook index from "hooks list" (0-based)',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const hooks = await get_all_hooks();
		const idx = parseInt(args.index, 10);

		if (isNaN(idx) || idx < 0 || idx >= hooks.length) {
			error(
				`Invalid index: ${args.index}. Run "mcpick hooks list" to see available hooks (0-${hooks.length - 1}).`,
			);
		}

		const entry = hooks[idx];

		if (entry.source === 'plugin') {
			await disable_plugin_hook(entry);
			if (args.json) {
				output(
					{
						disabled: true,
						event: entry.event,
						plugin_key: entry.plugin_key,
					},
					true,
				);
			} else {
				console.log(
					`Disabled: ${entry.event} from ${entry.plugin_key}`,
				);
				console.log(
					'Restart Claude Code for changes to take effect.',
				);
			}
		} else {
			// Settings hook — remove it
			await remove_hook(entry);
			if (args.json) {
				output(
					{
						removed: true,
						event: entry.event,
						scope: entry.scope,
					},
					true,
				);
			} else {
				console.log(`Removed: ${entry.event} (${entry.scope})`);
			}
		}
	},
});

const enable = defineCommand({
	meta: {
		name: 'enable',
		description:
			'Re-enable a disabled hook by index (use "hooks list" to see disabled hooks)',
	},
	args: {
		index: {
			type: 'positional',
			description: 'Disabled hook index from "hooks list" (0-based)',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const disabled = await read_disabled_hooks();
		const idx = parseInt(args.index, 10);

		if (isNaN(idx) || idx < 0 || idx >= disabled.length) {
			error(
				`Invalid index: ${args.index}. Run "mcpick hooks list" to see disabled hooks (0-${disabled.length - 1}).`,
			);
		}

		const entry = disabled[idx];
		await enable_plugin_hook(entry);

		if (args.json) {
			output(
				{
					enabled: true,
					event: entry.event,
					plugin_key: entry.plugin_key,
				},
				true,
			);
		} else {
			console.log(
				`Re-enabled: ${entry.event} for ${entry.plugin_key}`,
			);
			console.log('Restart Claude Code for changes to take effect.');
		}
	},
});

const add = defineCommand({
	meta: {
		name: 'add',
		description: 'Add a new settings-based hook',
	},
	args: {
		event: {
			type: 'positional',
			description:
				'Hook event type (e.g. UserPromptSubmit, PreToolUse)',
			required: true,
		},
		handler_type: {
			type: 'positional',
			description: 'Handler type: command, prompt, http, or agent',
			required: true,
		},
		value: {
			type: 'positional',
			description:
				'Handler value (command string, prompt text, URL, or agent prompt)',
			required: true,
		},
		matcher: {
			type: 'string',
			description:
				'Matcher pattern (e.g. Bash, Edit|Write) — only for tool/session events',
		},
		scope: {
			type: 'string',
			description:
				'Scope: user, project, or project-local (default: user)',
			default: 'user',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as HookScope;
		if (!['user', 'project', 'project-local'].includes(scope)) {
			error(
				`Invalid scope: ${scope}. Use user, project, or project-local.`,
			);
		}

		const handler_type = args.handler_type as HookHandler['type'];
		if (
			!['command', 'prompt', 'http', 'agent'].includes(handler_type)
		) {
			error(
				`Invalid handler type: ${handler_type}. Use command, prompt, http, or agent.`,
			);
		}

		const handler: HookHandler = { type: handler_type };
		if (handler_type === 'command') handler.command = args.value;
		else if (handler_type === 'prompt') handler.prompt = args.value;
		else if (handler_type === 'http') handler.url = args.value;
		else if (handler_type === 'agent') handler.prompt = args.value;

		await add_hook(
			scope,
			args.event as HookEventType,
			args.matcher || undefined,
			handler,
		);

		if (args.json) {
			output(
				{
					added: true,
					event: args.event,
					handler_type,
					scope,
					matcher: args.matcher || null,
				},
				true,
			);
		} else {
			console.log(
				`Hook added: ${args.event} → ${handler_type} (${scope})`,
			);
		}
	},
});

const remove = defineCommand({
	meta: {
		name: 'remove',
		description:
			'Remove a settings hook by index (use "hooks list" to see indices)',
	},
	args: {
		index: {
			type: 'positional',
			description: 'Hook index from "hooks list" (0-based)',
			required: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const hooks = await get_all_hooks();
		const settings_hooks = hooks.filter((h) => h.source !== 'plugin');
		const idx = parseInt(args.index, 10);

		if (isNaN(idx) || idx < 0 || idx >= settings_hooks.length) {
			error(
				`Invalid index: ${args.index}. Use "mcpick hooks list" to see settings hooks.`,
			);
		}

		const entry = settings_hooks[idx];
		await remove_hook(entry);

		if (args.json) {
			output(
				{
					removed: true,
					event: entry.event,
					scope: entry.scope,
				},
				true,
			);
		} else {
			const detail =
				entry.handler.command ||
				entry.handler.url ||
				entry.handler.prompt ||
				'(unknown)';
			console.log(
				`Removed: [${entry.scope}] ${entry.event} → ${entry.handler.type}: ${detail}`,
			);
		}
	},
});

const check = defineCommand({
	meta: {
		name: 'check',
		description:
			'Check if marketplace updates restored any disabled hooks',
	},
	args: {
		fix: {
			type: 'boolean',
			description: 'Automatically re-disable restored hooks',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const restored = await check_restored_hooks();

		if (args.json) {
			output({ restored: restored.length, hooks: restored }, true);
			return;
		}

		if (restored.length === 0) {
			console.log('No disabled hooks were restored. All good.');
			return;
		}

		console.log(`${restored.length} disabled hook(s) were restored:`);
		for (const r of restored) {
			console.log(`  ${r.plugin_key}: ${r.event}`);
		}

		if (args.fix) {
			const result = await redisable_restored_hooks(restored);
			console.log(
				`Re-disabled ${result.success} hook(s).${result.failed > 0 ? ` Failed: ${result.failed}` : ''}`,
			);
		} else {
			console.log(
				'Run with --fix to re-disable, or use "mcpick hooks disable".',
			);
		}
	},
});

export default defineCommand({
	meta: {
		name: 'hooks',
		description:
			'Manage hooks (settings + plugin). Disable individual plugin hooks, add/remove settings hooks.',
	},
	subCommands: { list, disable, enable, add, remove, check },
});
