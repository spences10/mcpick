import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { redact_text } from './redact.js';

const exec_file_async = promisify(execFile);

export interface SkillsCliResult {
	success: boolean;
	stdout?: string;
	stderr?: string;
	error?: string;
}

export function split_cli_list(value?: string): string[] {
	return (value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

export async function run_skills_cli(
	args: string[],
): Promise<SkillsCliResult> {
	try {
		const result = await exec_file_async(
			'npx',
			['-y', 'skills@latest', ...args],
			{
				env: {
					...process.env,
					CI: '1',
					NO_COLOR: '1',
					FORCE_COLOR: '0',
					TERM: 'dumb',
				},
			},
		);
		return {
			success: true,
			stdout: redact_text(result.stdout.trim()),
			stderr: redact_text(result.stderr.trim()),
		};
	} catch (error) {
		const err = error as Error & {
			stdout?: string;
			stderr?: string;
		};
		return {
			success: false,
			stdout: err.stdout ? redact_text(err.stdout.trim()) : undefined,
			stderr: err.stderr ? redact_text(err.stderr.trim()) : undefined,
			error: redact_text(err.message),
		};
	}
}
