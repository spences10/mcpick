import {
	confirm,
	isCancel,
	log,
	multiselect,
	note,
	select,
	text,
} from '@clack/prompts';
import {
	build_enabled_plugins,
	get_all_plugins,
	read_claude_settings,
	write_claude_settings,
} from '../core/settings.js';
import {
	install_plugin_via_cli,
	uninstall_plugin_via_cli,
	update_plugin_via_cli,
} from '../utils/claude-cli.js';

type PluginAction =
	| 'toggle'
	| 'install'
	| 'uninstall'
	| 'update'
	| 'back';

async function handle_toggle(): Promise<void> {
	const settings = await read_claude_settings();
	const plugins = get_all_plugins(settings);

	if (plugins.length === 0) {
		note(
			'No plugins found in ~/.claude/settings.json.\n' +
				'Install plugins via Claude Code: /plugin',
		);
		return;
	}

	const plugin_choices = plugins.map((plugin) => ({
		value: `${plugin.name}@${plugin.marketplace}`,
		label: plugin.name,
		hint: plugin.marketplace,
	}));

	const currently_enabled = plugins
		.filter((p) => p.enabled)
		.map((p) => `${p.name}@${p.marketplace}`);

	const selected = await multiselect({
		message: 'Select plugins to enable:',
		options: plugin_choices,
		initialValues: currently_enabled,
		required: false,
	});

	if (typeof selected === 'symbol') return;

	const selected_set = new Set(selected);
	const updated_plugins = plugins.map((plugin) => ({
		...plugin,
		enabled: selected_set.has(`${plugin.name}@${plugin.marketplace}`),
	}));

	const enabled_plugins = build_enabled_plugins(updated_plugins);
	await write_claude_settings({ enabledPlugins: enabled_plugins });

	const enabled_count = updated_plugins.filter(
		(p) => p.enabled,
	).length;
	const disabled_count = updated_plugins.filter(
		(p) => !p.enabled,
	).length;

	note(
		`Plugins updated!\n` +
			`Enabled: ${enabled_count}, Disabled: ${disabled_count}`,
	);

	const newly_enabled = updated_plugins.filter(
		(p) =>
			p.enabled &&
			!currently_enabled.includes(`${p.name}@${p.marketplace}`),
	);
	const newly_disabled = updated_plugins.filter(
		(p) =>
			!p.enabled &&
			currently_enabled.includes(`${p.name}@${p.marketplace}`),
	);

	if (newly_enabled.length > 0) {
		log.success(
			`Enabled: ${newly_enabled.map((p) => p.name).join(', ')}`,
		);
	}
	if (newly_disabled.length > 0) {
		log.warn(
			`Disabled: ${newly_disabled.map((p) => p.name).join(', ')}`,
		);
	}
}

async function handle_install(): Promise<void> {
	const key = await text({
		message: 'Plugin to install (name@marketplace):',
		placeholder: 'e.g. commit-commands@claude-plugins-official',
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'Plugin key is required';
			}
			if (!value.includes('@')) {
				return 'Format: plugin-name@marketplace-name';
			}
		},
	});

	if (isCancel(key)) return;

	const scope = await select({
		message: 'Installation scope:',
		options: [
			{ value: 'user', label: 'User', hint: 'Global (default)' },
			{
				value: 'project',
				label: 'Project',
				hint: 'Shared with team',
			},
			{
				value: 'local',
				label: 'Local',
				hint: 'This project only (gitignored)',
			},
		],
	});

	if (isCancel(scope)) return;

	const result = await install_plugin_via_cli(
		key,
		scope as 'user' | 'project' | 'local',
	);

	if (result.success) {
		log.success(`Installed '${key}' (scope: ${scope})`);
	} else {
		log.error(result.error ?? 'Unknown error');
	}
}

async function handle_uninstall(): Promise<void> {
	const settings = await read_claude_settings();
	const plugins = get_all_plugins(settings);

	if (plugins.length === 0) {
		log.info('No plugins installed.');
		return;
	}

	const selected = await select({
		message: 'Select plugin to uninstall:',
		options: plugins.map((p) => ({
			value: `${p.name}@${p.marketplace}`,
			label: p.name,
			hint: p.marketplace,
		})),
	});

	if (isCancel(selected)) return;

	const should_uninstall = await confirm({
		message: `Uninstall '${selected}'?`,
	});

	if (isCancel(should_uninstall) || !should_uninstall) return;

	const result = await uninstall_plugin_via_cli(selected);

	if (result.success) {
		log.success(`Uninstalled '${selected}'`);
	} else {
		log.error(result.error ?? 'Unknown error');
	}
}

async function handle_update(): Promise<void> {
	const settings = await read_claude_settings();
	const plugins = get_all_plugins(settings);

	if (plugins.length === 0) {
		log.info('No plugins installed.');
		return;
	}

	const selected = await select({
		message: 'Select plugin to update:',
		options: plugins.map((p) => ({
			value: `${p.name}@${p.marketplace}`,
			label: p.name,
			hint: p.marketplace,
		})),
	});

	if (isCancel(selected)) return;

	const result = await update_plugin_via_cli(selected);

	if (result.success) {
		log.success(`Updated '${selected}'`);
	} else {
		log.error(result.error ?? 'Unknown error');
	}
}

export async function edit_plugins(): Promise<void> {
	while (true) {
		const action = await select<PluginAction>({
			message: 'Plugin management:',
			options: [
				{
					value: 'toggle' as PluginAction,
					label: 'Enable / Disable plugins',
					hint: 'Toggle plugins on/off',
				},
				{
					value: 'install' as PluginAction,
					label: 'Install plugin',
					hint: 'Install from a marketplace',
				},
				{
					value: 'uninstall' as PluginAction,
					label: 'Uninstall plugin',
					hint: 'Remove a plugin entirely',
				},
				{
					value: 'update' as PluginAction,
					label: 'Update plugin',
					hint: 'Update to latest version',
				},
				{
					value: 'back' as PluginAction,
					label: 'Back',
					hint: 'Return to main menu',
				},
			],
		});

		if (isCancel(action) || action === 'back') return;

		try {
			switch (action) {
				case 'toggle':
					await handle_toggle();
					break;
				case 'install':
					await handle_install();
					break;
				case 'uninstall':
					await handle_uninstall();
					break;
				case 'update':
					await handle_update();
					break;
			}
		} catch (err) {
			log.error(err instanceof Error ? err.message : 'Unknown error');
		}
	}
}
