import { redact_text, redact_value } from './redact.js';

export interface JsonChangePreview {
	dryRun: true;
	operation: string;
	client: string;
	scope: string;
	location: string;
	before: unknown;
	after: unknown;
	diff: string;
}

export interface CommandPreview {
	dryRun: true;
	operation: string;
	client: string;
	scope: string;
	location: string;
	command: string[];
}

export type ConfigPreview = JsonChangePreview | CommandPreview;

export function build_json_change_preview(input: {
	operation: string;
	client: string;
	scope: string;
	location: string;
	before: unknown;
	after: unknown;
}): JsonChangePreview {
	const before = redact_value(input.before);
	const after = redact_value(input.after);
	return {
		dryRun: true,
		operation: input.operation,
		client: input.client,
		scope: input.scope,
		location: input.location,
		before,
		after,
		diff: create_json_diff(before, after),
	};
}

export function build_command_preview(input: {
	operation: string;
	client: string;
	scope: string;
	location: string;
	command: string[];
}): CommandPreview {
	return {
		dryRun: true,
		operation: input.operation,
		client: input.client,
		scope: input.scope,
		location: input.location,
		command: input.command.map((part) => redact_text(part)),
	};
}

function create_json_diff(before: unknown, after: unknown): string {
	const before_lines = JSON.stringify(before, null, 2).split('\n');
	const after_lines = JSON.stringify(after, null, 2).split('\n');
	if (before_lines.join('\n') === after_lines.join('\n')) return '';

	return [
		'--- before',
		'+++ after',
		...before_lines.map((line) => `- ${line}`),
		...after_lines.map((line) => `+ ${line}`),
	].join('\n');
}
