import { defineCommand, runMain } from 'citty';

const main = defineCommand({
	meta: {
		name: 'mcpick',
		description: 'MCP Server Configuration Manager',
	},
	subCommands: {
		list: () => import('./commands/list.js').then((m) => m.default),
		enable: () =>
			import('./commands/enable.js').then((m) => m.default),
		disable: () =>
			import('./commands/disable.js').then((m) => m.default),
		remove: () =>
			import('./commands/remove.js').then((m) => m.default),
		add: () => import('./commands/add.js').then((m) => m.default),
		'add-json': () =>
			import('./commands/add-json.js').then((m) => m.default),
		get: () => import('./commands/get.js').then((m) => m.default),
		'reset-project-choices': () =>
			import('./commands/reset-project-choices.js').then(
				(m) => m.default,
			),
		backup: () =>
			import('./commands/backup.js').then((m) => m.default),
		restore: () =>
			import('./commands/restore.js').then((m) => m.default),
		profile: () =>
			import('./commands/profile.js').then((m) => m.default),
		plugins: () =>
			import('./commands/plugins.js').then((m) => m.default),
		hooks: () => import('./commands/hooks.js').then((m) => m.default),
		cache: () => import('./commands/cache.js').then((m) => m.default),
		dev: () => import('./commands/dev.js').then((m) => m.default),
		marketplace: () =>
			import('./commands/marketplace.js').then((m) => m.default),
		reload: () =>
			import('./commands/reload.js').then((m) => m.default),
	},
});

export const run = () => runMain(main);
