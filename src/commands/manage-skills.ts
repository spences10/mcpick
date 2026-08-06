import { confirm, log, note, select, text } from '@clack/prompts';
import type { SkillsCliResult } from '../utils/skills-cli.js';
import {
	install_skills,
	list_available_skills,
	list_skills,
	search_skills,
	update_skills,
} from '../utils/skills-cli.js';

const SKILL_AGENTS = [
	{ value: 'claude-code', label: 'Claude Code' },
	{ value: 'pi', label: 'Pi' },
	{ value: 'opencode', label: 'OpenCode' },
	{ value: 'codex', label: 'Codex' },
	{ value: 'cursor', label: 'Cursor' },
	{ value: 'gemini-cli', label: 'Gemini CLI' },
];

export async function manage_skills(): Promise<void> {
	const action = await select({
		message: 'Portable skills (gh skill backend)',
		options: [
			{ value: 'list', label: 'List installed skills' },
			{
				value: 'available',
				label: 'List skills available from source',
			},
			{ value: 'search', label: 'Search GitHub for skills' },
			{ value: 'install', label: 'Install skills' },
			{ value: 'update', label: 'Update skills' },
			{ value: 'back', label: 'Back' },
		],
	});

	if (typeof action === 'symbol' || action === 'back') return;

	if (action === 'list') {
		const agent = await select_agent();
		if (agent === null) return;
		await show_result(
			await list_skills({ agent: agent || undefined }),
		);
		return;
	}

	if (action === 'available') {
		const source = await prompt_source();
		if (!source) return;
		await show_result(await list_available_skills(source));
		return;
	}

	if (action === 'search') {
		const query = await text({
			message: 'Search query:',
			placeholder: 'svelte',
		});
		if (typeof query === 'symbol' || !query) return;
		await show_result(await search_skills(query));
		return;
	}

	if (action === 'install') {
		const source = await prompt_source();
		if (!source) return;
		const agent = await select_agent();
		if (agent === null) return;
		const skill = await text({
			message: 'Skill name, name@version, or * for all skills:',
			placeholder: 'svelte-runes',
			defaultValue: '*',
		});
		if (typeof skill === 'symbol') return;
		const all = skill.trim() === '*';
		await show_result(
			await install_skills({
				source,
				skills: all ? [] : [skill.trim()],
				all,
				agents: agent ? [agent] : [],
				scope: 'project',
				yes: false,
				confirm: async (validation) => {
					log.warn(
						`check-skills reported ${validation.errors} error(s):`,
					);
					for (const detail of validation.details) {
						log.warn(`  ${detail}`);
					}
					const proceed = await confirm({
						message: 'Install anyway despite validation errors?',
						initialValue: false,
					});
					return proceed === true;
				},
			}),
		);
		return;
	}

	if (action === 'update') {
		await show_result(await update_skills({}));
	}
}

async function select_agent(): Promise<string | null> {
	const agent = await select({
		message: 'Which agent/client?',
		options: [
			...SKILL_AGENTS,
			{ value: 'universal', label: 'Universal (shared)' },
			{
				value: '',
				label: 'All agents (list) / gh default (install)',
			},
		],
		initialValue: 'pi',
	});
	return typeof agent === 'symbol' ? null : agent;
}

async function prompt_source(): Promise<string | null> {
	const source = await text({
		message: 'Skills source (owner/repo):',
		placeholder: 'spences10/skills',
		defaultValue: 'spences10/skills',
	});
	return typeof source === 'symbol' ? null : source;
}

async function show_result(result: SkillsCliResult): Promise<void> {
	for (const warning of result.warnings ?? []) {
		log.warn(warning);
	}
	if (result.success) {
		if (result.stdout) log.info(result.stdout);
		note('Done.');
		return;
	}

	log.error(result.stderr || result.error || 'skills command failed');
}
