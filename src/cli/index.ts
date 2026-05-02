import { defineCommand, renderUsage, runMain } from 'citty';

const main = defineCommand({
	meta: {
		name: 'mcpick',
		description:
			'Vendor-neutral MCP configuration manager with first-class Claude Code support',
	},
	subCommands: {
		list: () => import('./commands/list.js').then((m) => m.default),
		enable: () =>
			import('./commands/enable.js').then((m) => m.default),
		disable: () =>
			import('./commands/disable.js').then((m) => m.default),
		clients: () =>
			import('./commands/clients.js').then((m) => m.default),
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
		skills: () =>
			import('./commands/skills.js').then((m) => m.default),
		plugins: () =>
			import('./commands/plugins.js').then((m) => m.default),
		hooks: () => import('./commands/hooks.js').then((m) => m.default),
		cache: () => import('./commands/cache.js').then((m) => m.default),
		dev: () => import('./commands/dev.js').then((m) => m.default),
		marketplace: () =>
			import('./commands/marketplace.js').then((m) => m.default),
		reload: () =>
			import('./commands/reload.js').then((m) => m.default),
		rollback: () =>
			import('./commands/rollback.js').then((m) => m.default),
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
\x1b[4m\x1b[1mWORKFLOW\x1b[22m\x1b[24m MCPick has two vendor-neutral layers and one Claude Code-specific layer.

  MCP servers: toggle configured servers per client with mcpick list/enable/disable/clients.
  Skills: install portable SKILL.md packs through the external skills CLI via mcpick skills.
  Claude Code plugins/hooks/marketplaces: client-specific commands under plugins/hooks/marketplace/cache.`;

const CONCEPTS_SECTION = `
\x1b[4m\x1b[1mCONCEPTS\x1b[22m\x1b[24m

  Marketplace   Claude Code-specific plugin catalog hosted on GitHub, GitLab, or locally
  Plugin        Claude Code bundle containing any mix of: skills, hooks, agents, MCP servers
  Skill         Portable SKILL.md instruction pack installed into one or more agent clients
  MCP server    A tool server providing external capabilities to an AI client
  MCP client    An application that loads MCP server config (Claude Code, Gemini CLI, VS Code, Cursor, OpenCode, Pi via pi-mcp-adapter, etc.)
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

  List all MCP servers for Claude Code:
    mcpick list

  List servers for another client:
    mcpick list --client gemini-cli --scope project
    mcpick list --client opencode --scope project
    mcpick list --client pi --scope user

  Show supported client config locations:
    mcpick clients

  List portable skills installed for Pi:
    mcpick skills list --agent pi --json

  See skills available from a repo without installing:
    mcpick skills add spences10/skills --list

  Install one portable skill for Pi:
    mcpick skills add spences10/skills --agent pi --skill svelte-runes --yes

  Install all portable skills for OpenCode globally:
    mcpick skills add spences10/skills --agent opencode --skill '*' --global --yes

  Update portable skills non-interactively:
    mcpick skills update --global --yes

  Remove a portable skill for Pi:
    mcpick skills remove svelte-runes --agent pi --yes

  Prefer --json for machine-readable output where supported. MCPick redacts known secret patterns before printing.
  Run without arguments to launch the interactive TUI (not suitable for LLM agents).`;

export const run = () =>
	runMain(main, {
		showUsage:
			show_usage_with_examples as typeof import('citty').showUsage,
	});
