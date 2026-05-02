import { readFile } from 'node:fs/promises';
import { safe_json_write } from './safe-apply.js';

/**
 * Atomically write a JSON file with fresh-read merging.
 *
 * 1. Re-reads the file right before writing to pick up concurrent changes
 * 2. Applies the merge function to the freshest data
 * 3. Writes to a temp file, then renames (atomic on same filesystem)
 */
export async function atomic_json_write(
	file_path: string,
	merge: (
		existing: Record<string, unknown>,
	) => Record<string, unknown>,
): Promise<void> {
	// Read the freshest version right before writing
	let existing: Record<string, unknown> = {};
	try {
		const content = await readFile(file_path, 'utf-8');
		existing = JSON.parse(content);
	} catch {
		// File doesn't exist or invalid — start fresh
	}

	const merged = merge(existing);
	await safe_json_write(file_path, merged, 2);
}
