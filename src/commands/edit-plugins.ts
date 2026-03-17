import { log, multiselect, note } from '@clack/prompts';
import {
	build_enabled_plugins,
	get_all_plugins,
	read_claude_settings,
	write_claude_settings,
} from '../core/settings.js';

export async function edit_plugins(): Promise<void> {
	try {
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

		if (typeof selected === 'symbol') {
			return;
		}

		const selected_set = new Set(selected);
		const updated_plugins = plugins.map((plugin) => ({
			...plugin,
			enabled: selected_set.has(
				`${plugin.name}@${plugin.marketplace}`,
			),
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

		// Show what changed
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
	} catch (error) {
		throw new Error(
			`Failed to edit plugins: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
