import { defineCommand } from 'citty';
import {
	run_skills_cli,
	split_cli_list,
} from '../../utils/skills-cli.js';
import { error, output } from '../output.js';

function add_agent_args(cli_args: string[], agent?: string): void {
	const agents = split_cli_list(agent);
	if (agents.length > 0) cli_args.push('--agent', ...agents);
}

function add_skill_args(cli_args: string[], skill?: string): void {
	const skills = split_cli_list(skill);
	if (skills.length > 0) cli_args.push('--skill', ...skills);
}

async function print_result(
	result: Awaited<ReturnType<typeof run_skills_cli>>,
	json: boolean,
	fallback: string,
): Promise<void> {
	if (json) {
		if (result.stdout) {
			try {
				output(JSON.parse(result.stdout), true);
				return;
			} catch {
				// Output wrapper below handles non-JSON command output.
			}
		}
		output(result, true);
		return;
	}

	if (result.success) {
		output(result.stdout || fallback, false);
		return;
	}

	error(result.stderr || result.error || 'skills CLI failed');
}

const list = defineCommand({
	meta: {
		name: 'list',
		description:
			'List installed portable skills for supported agent clients',
	},
	args: {
		agent: {
			type: 'string',
			description:
				'Agent/client to filter: claude-code, pi, opencode, codex, cursor, windsurf, or *',
		},
		global: {
			type: 'boolean',
			description:
				'List global/user skills instead of project skills',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const cli_args = ['list'];
		if (args.global) cli_args.push('--global');
		add_agent_args(cli_args, args.agent);
		if (args.json) cli_args.push('--json');

		await print_result(
			await run_skills_cli(cli_args),
			args.json,
			'No skills found.',
		);
	},
});

const add = defineCommand({
	meta: {
		name: 'add',
		description:
			'Install portable skills from a repo/package using the external skills CLI',
	},
	args: {
		source: {
			type: 'positional',
			description:
				'Skill source, e.g. spences10/skills, a GitHub URL, npm package, or local path',
			required: true,
		},
		agent: {
			type: 'string',
			description:
				'Agent/client(s) to install to. Use comma-separated values or * for all agents',
		},
		skill: {
			type: 'string',
			description:
				'Skill name(s) to install. Use comma-separated values or * for all skills',
		},
		global: {
			type: 'boolean',
			description:
				'Install globally/user-level instead of project-level',
			default: false,
		},
		list: {
			type: 'boolean',
			description:
				'List available skills in the source without installing',
			default: false,
		},
		copy: {
			type: 'boolean',
			description:
				'Copy files instead of symlinking into agent directories',
			default: false,
		},
		'full-depth': {
			type: 'boolean',
			description:
				'Search all subdirectories even when a root SKILL.md exists',
			default: false,
		},
		yes: {
			type: 'boolean',
			description:
				'Skip confirmation prompts. Defaults true so LLM/CI use does not hang.',
			default: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const cli_args = ['add', args.source];
		if (args.global) cli_args.push('--global');
		if (args.list) cli_args.push('--list');
		if (args.copy) cli_args.push('--copy');
		if (args['full-depth']) cli_args.push('--full-depth');
		if (args.yes) cli_args.push('--yes');
		add_agent_args(cli_args, args.agent);
		add_skill_args(cli_args, args.skill);

		await print_result(
			await run_skills_cli(cli_args),
			args.json,
			'Skills command completed.',
		);
	},
});

const update = defineCommand({
	meta: {
		name: 'update',
		description:
			'Update installed portable skills to latest versions',
	},
	args: {
		skills: {
			type: 'positional',
			description:
				'Optional comma-separated skill names. Omit to update all selected skills.',
			required: false,
		},
		global: {
			type: 'boolean',
			description: 'Update global/user skills only',
			default: false,
		},
		project: {
			type: 'boolean',
			description: 'Update project skills only',
			default: false,
		},
		yes: {
			type: 'boolean',
			description:
				'Skip confirmation prompts. Defaults true so LLM/CI use does not hang.',
			default: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		const cli_args = ['update', ...split_cli_list(args.skills)];
		if (args.global) cli_args.push('--global');
		if (args.project) cli_args.push('--project');
		if (args.yes) cli_args.push('--yes');

		await print_result(
			await run_skills_cli(cli_args),
			args.json,
			'Skills updated.',
		);
	},
});

const remove = defineCommand({
	meta: {
		name: 'remove',
		description: 'Remove installed portable skills',
	},
	args: {
		skills: {
			type: 'positional',
			description:
				'Skill name(s), comma-separated. Use --all to remove all.',
			required: false,
		},
		agent: {
			type: 'string',
			description:
				'Agent/client(s) to remove from. Use comma-separated values or * for all agents',
		},
		global: {
			type: 'boolean',
			description:
				'Remove from global/user scope instead of project scope',
			default: false,
		},
		all: {
			type: 'boolean',
			description: 'Remove all matching skills',
			default: false,
		},
		yes: {
			type: 'boolean',
			description:
				'Skip confirmation prompts. Defaults true so LLM/CI use does not hang.',
			default: true,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		if (!args.skills && !args.all) {
			error(
				'Pass a skill name, comma-separated skill names, or --all.',
			);
		}

		const cli_args = ['remove', ...split_cli_list(args.skills)];
		if (args.global) cli_args.push('--global');
		if (args.all) cli_args.push('--all');
		if (args.yes) cli_args.push('--yes');
		add_agent_args(cli_args, args.agent);

		await print_result(
			await run_skills_cli(cli_args),
			args.json,
			'Skills removed.',
		);
	},
});

export default defineCommand({
	meta: {
		name: 'skills',
		description:
			'Manage portable agent skills via the external skills CLI. Examples: mcpick skills add spences10/skills --agent pi --skill svelte-runes; mcpick skills list --agent pi --json',
	},
	subCommands: {
		list,
		add,
		update,
		remove,
	},
});
