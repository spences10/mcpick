import { defineCommand } from 'citty';
import {
	build_enabled_plugins,
	get_all_plugins,
	read_claude_settings,
	write_claude_settings,
} from '../../core/settings.js';
import {
	install_plugin_via_cli,
	uninstall_plugin_via_cli,
	update_plugin_via_cli,
} from '../../utils/claude-cli.js';
import { error, output } from '../output.js';

const list = defineCommand({
	meta: {
		name: 'list',
		description: 'List all plugins and their status',
	},
	args: {
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const settings = await read_claude_settings();
		const plugins = get_all_plugins(settings);

		if (args.json) {
			output(plugins, true);
		} else {
			if (plugins.length === 0) {
				console.log('No plugins found.');
				return;
			}
			for (const p of plugins) {
				const status = p.enabled ? 'on' : 'off';
				console.log(`${p.name}@${p.marketplace}  ${status}`);
			}
		}
	},
});

const enable = defineCommand({
	meta: {
		name: 'enable',
		description: 'Enable a plugin',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace)',
			required: true,
		},
	},
	async run({ args }) {
		const settings = await read_claude_settings();
		const plugins = get_all_plugins(settings);
		const key = args.plugin;

		const plugin = plugins.find(
			(p) => `${p.name}@${p.marketplace}` === key,
		);
		if (!plugin) {
			error(
				`Plugin '${key}' not found. Run 'mcpick plugins list' to see available plugins.`,
			);
		}

		plugin.enabled = true;
		const updated = build_enabled_plugins(plugins);
		await write_claude_settings({ enabledPlugins: updated });

		console.log(`Enabled plugin '${key}'`);
	},
});

const disable = defineCommand({
	meta: {
		name: 'disable',
		description: 'Disable a plugin',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace)',
			required: true,
		},
	},
	async run({ args }) {
		const settings = await read_claude_settings();
		const plugins = get_all_plugins(settings);
		const key = args.plugin;

		const plugin = plugins.find(
			(p) => `${p.name}@${p.marketplace}` === key,
		);
		if (!plugin) {
			error(
				`Plugin '${key}' not found. Run 'mcpick plugins list' to see available plugins.`,
			);
		}

		plugin.enabled = false;
		const updated = build_enabled_plugins(plugins);
		await write_claude_settings({ enabledPlugins: updated });

		console.log(`Disabled plugin '${key}'`);
	},
});

const install = defineCommand({
	meta: {
		name: 'install',
		description: 'Install a plugin from a marketplace',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace)',
			required: true,
		},
		scope: {
			type: 'string',
			description: 'Installation scope: user, project, or local',
			default: 'user',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as 'user' | 'project' | 'local';
		const result = await install_plugin_via_cli(args.plugin, scope);

		if (args.json) {
			output(result, true);
		} else if (result.success) {
			console.log(
				`Installed plugin '${args.plugin}' (scope: ${scope})`,
			);
		} else {
			error(result.error ?? 'Unknown error');
		}
	},
});

const uninstall = defineCommand({
	meta: {
		name: 'uninstall',
		description: 'Uninstall a plugin',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace)',
			required: true,
		},
		scope: {
			type: 'string',
			description: 'Uninstall from scope: user, project, or local',
			default: 'user',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as 'user' | 'project' | 'local';
		const result = await uninstall_plugin_via_cli(args.plugin, scope);

		if (args.json) {
			output(result, true);
		} else if (result.success) {
			console.log(
				`Uninstalled plugin '${args.plugin}' (scope: ${scope})`,
			);
		} else {
			error(result.error ?? 'Unknown error');
		}
	},
});

const update = defineCommand({
	meta: {
		name: 'update',
		description: 'Update a plugin to latest version',
	},
	args: {
		plugin: {
			type: 'positional',
			description: 'Plugin key (name@marketplace)',
			required: true,
		},
		scope: {
			type: 'string',
			description: 'Scope to update: user, project, or local',
			default: 'user',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const scope = args.scope as 'user' | 'project' | 'local';
		const result = await update_plugin_via_cli(args.plugin, scope);

		if (args.json) {
			output(result, true);
		} else if (result.success) {
			console.log(
				`Updated plugin '${args.plugin}' (scope: ${scope})`,
			);
		} else {
			error(result.error ?? 'Unknown error');
		}
	},
});

export default defineCommand({
	meta: {
		name: 'plugins',
		description: 'Manage Claude Code plugins',
	},
	subCommands: { list, enable, disable, install, uninstall, update },
});
