import { confirm } from '@clack/prompts';
import { defineCommand } from 'citty';
import type {
	SkillValidationSummary,
	SkillsCliResult,
} from '../../utils/skills-cli.js';
import {
	install_skills,
	list_available_skills,
	list_skills,
	preview_skill,
	remove_skills,
	search_skills,
	split_cli_list,
	update_skills,
} from '../../utils/skills-cli.js';
import { error, output } from '../output.js';

function print_warnings(result: SkillsCliResult): void {
	for (const warning of result.warnings ?? []) {
		console.error(`warning: ${warning}`);
	}
}

function print_result(
	result: SkillsCliResult,
	json: boolean,
	fallback: string,
): void {
	print_warnings(result);
	if (json) {
		const { stdout, stderr, data, ...rest } = result;
		output(
			{
				...rest,
				...(data && typeof data === 'object' ? data : {}),
				...(stdout ? { stdout } : {}),
				...(stderr ? { stderr } : {}),
			},
			true,
		);
		return;
	}

	if (result.success) {
		output(result.stdout || fallback, false);
		return;
	}

	error(result.stderr || result.error || 'skills command failed');
}

function require_json_error(result: SkillsCliResult): void {
	if (result.success) return;
	error(result.stderr || result.error || 'skills command failed');
}

const list = defineCommand({
	meta: {
		name: 'list',
		description:
			'List installed skills across agent clients (gh skill backend)',
	},
	args: {
		agent: {
			type: 'string',
			description:
				'Agent/client to filter: claude-code, pi, opencode, codex, cursor, gemini-cli, universal, or * for all',
		},
		global: {
			type: 'boolean',
			description: 'List user-scope skills instead of project scope',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON (includes mcpick provenance)',
			default: false,
		},
	},
	async run({ args }) {
		const result = await list_skills({
			agent: args.agent,
			scope: args.global ? 'user' : undefined,
		});
		if (args.json) {
			print_result(result, true, '');
			if (!result.success) process.exit(1);
			return;
		}
		print_result(result, false, 'No skills found.');
	},
});

const add = defineCommand({
	meta: {
		name: 'add',
		description:
			'Install skills from a GitHub repo or local directory via gh skill, with check-skills validation before anything is written to agent directories',
	},
	args: {
		source: {
			type: 'positional',
			description:
				'Skill source: owner/repo, a GitHub URL, or a local directory path',
			required: true,
		},
		agent: {
			type: 'string',
			description:
				'Agent/client(s) to install to. Comma-separated values, or * for the shared universal location',
		},
		skill: {
			type: 'string',
			description:
				'Skill name(s), optionally pinned (name@v1.2.0). Comma-separated values',
		},
		all: {
			type: 'boolean',
			description: 'Install all skills discovered in the source',
			default: false,
		},
		pin: {
			type: 'string',
			description: 'Pin to a specific git tag or commit SHA',
		},
		global: {
			type: 'boolean',
			description: 'Install at user scope instead of project scope',
			default: false,
		},
		'from-local': {
			type: 'boolean',
			description: 'Treat the source as a local directory path',
			default: false,
		},
		'allow-hidden-dirs': {
			type: 'boolean',
			description:
				'Include skills in hidden directories (e.g. .claude/skills/)',
			default: false,
		},
		list: {
			type: 'boolean',
			description:
				'List available skills in the source without installing',
			default: false,
		},
		yes: {
			type: 'boolean',
			description:
				'Acknowledge check-skills validation errors programmatically and install anyway',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		if (args.list) {
			const result = await list_available_skills(args.source);
			if (args.json) {
				print_result(result, true, '');
				if (!result.success) process.exit(1);
				return;
			}
			print_result(result, false, 'No skills found.');
			return;
		}

		const is_tty = process.stdout.isTTY === true;
		const result = await install_skills({
			source: args.source,
			skills: split_cli_list(args.skill),
			all: args.all,
			agents: split_cli_list(args.agent),
			scope: args.global ? 'user' : 'project',
			pin: args.pin,
			from_local: args['from-local'],
			allow_hidden_dirs: args['allow-hidden-dirs'],
			yes: args.yes,
			confirm:
				is_tty && !args.yes
					? async (validation: SkillValidationSummary) => {
							console.error(
								`check-skills reported ${validation.errors} error(s):`,
							);
							for (const detail of validation.details) {
								console.error(`  ${detail}`);
							}
							const proceed = await confirm({
								message: 'Install anyway despite validation errors?',
								initialValue: false,
							});
							return proceed === true;
						}
					: undefined,
		});
		if (args.json) {
			print_result(result, true, '');
			if (!result.success) process.exit(1);
			return;
		}
		print_result(result, false, 'Skills installed.');
	},
});

const update = defineCommand({
	meta: {
		name: 'update',
		description:
			'Update installed skills to their latest versions (gh skill backend)',
	},
	args: {
		skills: {
			type: 'positional',
			description:
				'Optional comma-separated skill names. Omit to update all installed skills.',
			required: false,
		},
		'dry-run': {
			type: 'boolean',
			description: 'Report available updates without modifying files',
			default: false,
		},
		force: {
			type: 'boolean',
			description:
				'Re-download even if already up to date (restores locally modified files)',
			default: false,
		},
		unpin: {
			type: 'boolean',
			description:
				'Clear pinned versions and include pinned skills in the update',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await update_skills({
			skills: split_cli_list(args.skills),
			dry_run: args['dry-run'],
			force: args.force,
			unpin: args.unpin,
		});
		if (args.json) {
			print_result(result, true, '');
			if (!result.success) process.exit(1);
			return;
		}
		print_result(result, false, 'Skills updated.');
	},
});

const remove = defineCommand({
	meta: {
		name: 'remove',
		description:
			'Remove installed skills (not supported by the gh skill backend; reports manual locations)',
	},
	args: {
		skills: {
			type: 'positional',
			description: 'Skill name(s), comma-separated.',
			required: false,
		},
		agent: {
			type: 'string',
			description:
				'Agent/client to inspect. Comma-separated values, or * for all agents',
		},
		global: {
			type: 'boolean',
			description: 'Inspect user scope instead of project scope',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await remove_skills({
			skills: split_cli_list(args.skills),
			agent: args.agent,
			scope: args.global ? 'user' : undefined,
		});
		if (args.json) {
			print_result(result, true, '');
			process.exit(1);
		}
		require_json_error(result);
	},
});

const search = defineCommand({
	meta: {
		name: 'search',
		description: 'Search GitHub for skills (gh skill search)',
	},
	args: {
		query: {
			type: 'positional',
			description: 'Search query',
			required: true,
		},
		owner: {
			type: 'string',
			description: 'Limit results to a GitHub user or organization',
		},
		limit: {
			type: 'string',
			description: 'Maximum number of results (default 15)',
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const limit = args.limit
			? Number.parseInt(args.limit, 10)
			: undefined;
		const result = await search_skills(args.query, {
			owner: args.owner,
			limit:
				limit !== undefined && Number.isFinite(limit)
					? limit
					: undefined,
		});
		if (args.json) {
			print_result(result, true, '');
			if (!result.success) process.exit(1);
			return;
		}
		print_result(result, false, 'No skills found.');
	},
});

const preview = defineCommand({
	meta: {
		name: 'preview',
		description:
			"Render a skill's SKILL.md from a GitHub repo without installing",
	},
	args: {
		source: {
			type: 'positional',
			description: 'GitHub repo (owner/repo)',
			required: true,
		},
		skill: {
			type: 'positional',
			description: 'Skill name, optionally pinned (name@v1.2.0)',
			required: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const result = await preview_skill(args.source, args.skill);
		if (args.json) {
			print_result(result, true, '');
			if (!result.success) process.exit(1);
			return;
		}
		print_result(result, false, 'No preview available.');
	},
});

export default defineCommand({
	meta: {
		name: 'skills',
		description:
			'Manage portable agent skills via gh skill (GitHub CLI) with check-skills validation and provenance tracking. Examples: mcpick skills add spences10/skills --agent pi --skill svelte-runes; mcpick skills list --agent pi --json; mcpick skills search svelte',
	},
	subCommands: {
		list,
		add,
		update,
		remove,
		search,
		preview,
	},
});
