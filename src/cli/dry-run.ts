import type { ConfigPreview } from '../utils/config-preview.js';
import { output } from './output.js';

export function print_dry_run(
	preview: ConfigPreview,
	json: boolean,
): void {
	if (json) {
		output(preview, true);
		return;
	}

	console.log(
		`Dry run: ${preview.operation} (${preview.client}:${preview.scope})`,
	);
	console.log(`Target: ${preview.location}`);

	if ('command' in preview) {
		console.log(`Command: ${preview.command.join(' ')}`);
		return;
	}

	if (preview.diff) {
		console.log(preview.diff);
	} else {
		console.log('No changes.');
	}
}
