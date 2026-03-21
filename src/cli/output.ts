export function output(data: unknown, json: boolean): void {
	if (json) {
		console.log(JSON.stringify(data, null, 2));
	} else if (typeof data === 'string') {
		console.log(data);
	} else if (Array.isArray(data)) {
		for (const item of data) {
			console.log(item);
		}
	} else {
		console.log(data);
	}
}

export function error(message: string): never {
	console.error(`error: ${message}`);
	process.exit(1);
}
