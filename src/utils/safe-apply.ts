import { createHash, randomUUID } from 'node:crypto';
import {
	access,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { ensure_directory_exists, get_backups_dir } from './paths.js';

export interface SafeJsonWriteResult {
	path: string;
	backup_path?: string;
}

async function file_exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function backup_name(path: string): string {
	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}Z$/, 'Z');
	const hash = createHash('sha256')
		.update(path)
		.digest('hex')
		.slice(0, 10);
	const safe_base = basename(path).replace(/[^A-Za-z0-9._-]/g, '_');
	return `config-${safe_base}-${stamp}-${hash}.json`;
}

async function create_backup(
	path: string,
	content: string,
): Promise<string> {
	const backups_dir = get_backups_dir();
	await ensure_directory_exists(backups_dir);
	const backup_path = join(backups_dir, backup_name(path));
	await writeFile(backup_path, content, 'utf-8');
	return backup_path;
}

/**
 * Safely replace a JSON file: backup existing content, write via temp+rename,
 * verify the result parses, and restore the original content on failure.
 */
export async function safe_json_write(
	path: string,
	data: Record<string, unknown> | unknown[],
	indent: string | number = 2,
): Promise<SafeJsonWriteResult> {
	await mkdir(dirname(path), { recursive: true });

	const existed = await file_exists(path);
	const original_content = existed
		? await readFile(path, 'utf-8')
		: undefined;
	const backup_path =
		original_content !== undefined
			? await create_backup(path, original_content)
			: undefined;

	const tmp_path = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
	);
	const next_content = JSON.stringify(data, null, indent);

	try {
		await writeFile(tmp_path, next_content, 'utf-8');
		await rename(tmp_path, path);

		const written = await readFile(path, 'utf-8');
		JSON.parse(written);

		return {
			path,
			...(backup_path ? { backup_path } : {}),
		};
	} catch (error) {
		await rm(tmp_path, { force: true }).catch(() => undefined);
		if (original_content !== undefined) {
			await writeFile(path, original_content, 'utf-8');
		} else {
			await rm(path, { force: true }).catch(() => undefined);
		}
		throw error;
	}
}
