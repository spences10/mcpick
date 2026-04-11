import { defineCommand, renderUsage, runMain } from 'citty';

const main = defineCommand({
	meta: {
		name: 'mcpick',
		description:
			'Claude Code extension manager — MCP servers, plugins (skills, hooks, agents), and marketplaces',
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
		clone: () => import('./commands/clone.js').then((m) => m.default),
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

/**
 * Custom help renderer that appends workflow guidance and examples
 * after citty's standard help output. This is critical for LLM agents
 * that rely on --help output to understand multi-step workflows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function show_usage_with_examples(cmd: any, parent?: any) {
	const base = await renderUsage(cmd, parent);
	const resolved_meta = await (typeof cmd.meta === 'function'
		? cmd.meta()
		: cmd.meta);
	const is_top_level = resolved_meta?.name === 'mcpick';

	if (is_top_level) {
		console.log(
			base +
				'\n' +
				WORKFLOW_SECTION +
				'\n' +
				CONCEPTS_SECTION +
				'\n' +
				EXAMPLES_SECTION +
				'\n',
		);
	} else {
		console.log(base + '\n');
	}
}

const WORKFLOW_SECTION = `
\x1b[4m\x1b[1mWORKFLOW\x1b[22m\x1b[24m Marketplaces contain plugins. Plugins contain skills (/slash-commands), hooks, agents, and MCP servers.

  To install skills from a marketplace, follow these steps:

  1. Add a marketplace:    mcpick marketplace add <source>
  2. Install a plugin:     mcpick plugins install <name>@<marketplace>
  3. Skills are now available as /slash-commands in Claude Code`;

const CONCEPTS_SECTION = `
\x1b[4m\x1b[1mCONCEPTS\x1b[22m\x1b[24m

  Marketplace   A catalog of plugins, hosted on GitHub, GitLab, or locally
  Plugin        A bundle containing any mix of: skills, hooks, agents, MCP servers
  Skill         A SKILL.md file that extends Claude's behaviour, invocable as /slash-command
  MCP server    A tool server providing external capabilities to Claude Code
  Hook          An event handler that runs on tool use, session start, etc.
  Profile       A saved snapshot of your MCP server and plugin configuration`;

const EXAMPLES_SECTION = `
\x1b[4m\x1b[1mEXAMPLES\x1b[22m\x1b[24m

  Add a marketplace from GitHub (owner/repo):
    mcpick marketplace add spences10/claude-code-toolkit

  Add a marketplace from a full URL:
    mcpick marketplace add https://github.com/spences10/claude-code-toolkit

  Install a plugin from a marketplace:
    mcpick plugins install my-plugin@claude-code-toolkit

  List all installed plugins and their status:
    mcpick plugins list

  Toggle an MCP server on or off:
    mcpick enable my-server
    mcpick disable my-server

  List all MCP servers:
    mcpick list

  All commands support --json for machine-readable output.
  Run without arguments to launch the interactive TUI (not suitable for LLM agents).`;

export const run = () =>
	runMain(main, {
		showUsage: show_usage_with_examples as typeof import('citty').showUsage,
	});
