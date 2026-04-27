import { redact_text, redact_value } from '../utils/redact.js';

export function output(data: unknown, json: boolean): void {
	const safe_data = redact_value(data);

	if (json) {
		console.log(JSON.stringify(safe_data, null, 2));
	} else if (typeof safe_data === 'string') {
		console.log(safe_data);
	} else if (Array.isArray(safe_data)) {
		for (const item of safe_data) {
			console.log(
				typeof item === 'string' ? item : JSON.stringify(item),
			);
		}
	} else {
		console.log(safe_data);
	}
}

export function error(message: string): never {
	console.error(`error: ${redact_text(message)}`);
	process.exit(1);
}
