import { log, note, select, text } from '@clack/prompts';
import { run_skills_cli } from '../utils/skills-cli.js';

const SKILL_AGENTS = [
	{ value: 'claude-code', label: 'Claude Code' },
	{ value: 'pi', label: 'Pi' },
	{ value: 'opencode', label: 'OpenCode' },
	{ value: 'codex', label: 'Codex' },
	{ value: 'cursor', label: 'Cursor' },
	{ value: 'windsurf', label: 'Windsurf' },
];

export async function manage_skills(): Promise<void> {
	const action = await select({
		message: 'Portable skills',
		options: [
			{ value: 'list', label: 'List installed skills' },
			{
				value: 'available',
				label: 'List skills available from source',
			},
			{ value: 'install', label: 'Install skills' },
			{ value: 'update', label: 'Update skills' },
			{ value: 'back', label: 'Back' },
		],
	});

	if (typeof action === 'symbol' || action === 'back') return;

	if (action === 'list') {
		const agent = await select_agent();
		if (!agent) return;
		await show_result(
			await run_skills_cli(['list', '--agent', agent]),
		);
		return;
	}

	if (action === 'available') {
		const source = await prompt_source();
		if (!source) return;
		await show_result(
			await run_skills_cli(['add', source, '--list']),
		);
		return;
	}

	if (action === 'install') {
		const source = await prompt_source();
		if (!source) return;
		const agent = await select_agent();
		if (!agent) return;
		const skill = await text({
			message: 'Skill name or * for all skills:',
			placeholder: 'svelte-runes',
			defaultValue: '*',
		});
		if (typeof skill === 'symbol') return;
		await show_result(
			await run_skills_cli([
				'add',
				source,
				'--agent',
				agent,
				'--skill',
				skill,
				'--yes',
			]),
		);
		return;
	}

	if (action === 'update') {
		await show_result(await run_skills_cli(['update', '--yes']));
	}
}

async function select_agent(): Promise<string | null> {
	const agent = await select({
		message: 'Which agent/client?',
		options: [
			...SKILL_AGENTS,
			{ value: '*', label: 'All supported agents' },
		],
		initialValue: 'pi',
	});
	return typeof agent === 'symbol' ? null : agent;
}

async function prompt_source(): Promise<string | null> {
	const source = await text({
		message: 'Skills source:',
		placeholder: 'spences10/skills',
		defaultValue: 'spences10/skills',
	});
	return typeof source === 'symbol' ? null : source;
}

async function show_result(
	result: Awaited<ReturnType<typeof run_skills_cli>>,
): Promise<void> {
	if (result.success) {
		if (result.stdout) log.info(result.stdout);
		note('Done.');
		return;
	}

	log.error(result.stderr || result.error || 'skills CLI failed');
}
