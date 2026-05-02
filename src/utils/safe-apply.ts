import { createHash, randomUUID } from 'node:crypto';
import {
	access,
	mkdir,
	readdir,
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

export interface ConfigBackupInfo {
	path: string;
	original_path: string;
	created_at: string;
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
	await writeFile(
		`${backup_path}.meta.json`,
		JSON.stringify(
			{
				original_path: path,
				created_at: new Date().toISOString(),
			},
			null,
			2,
		),
		'utf-8',
	);
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

export async function list_config_backups(): Promise<
	ConfigBackupInfo[]
> {
	const backups_dir = get_backups_dir();
	try {
		const files = await readdir(backups_dir);
		const backups: ConfigBackupInfo[] = [];
		for (const file of files) {
			if (!file.startsWith('config-') || !file.endsWith('.json')) {
				continue;
			}
			if (file.endsWith('.meta.json')) continue;
			const backup_path = join(backups_dir, file);
			try {
				const meta = JSON.parse(
					await readFile(`${backup_path}.meta.json`, 'utf-8'),
				) as { original_path?: unknown; created_at?: unknown };
				if (
					typeof meta.original_path !== 'string' ||
					typeof meta.created_at !== 'string'
				) {
					continue;
				}
				backups.push({
					path: backup_path,
					original_path: meta.original_path,
					created_at: meta.created_at,
				});
			} catch {
				// Old config backups without metadata cannot be restored safely.
			}
		}
		return backups.sort((a, b) =>
			b.created_at.localeCompare(a.created_at),
		);
	} catch {
		return [];
	}
}

export async function restore_config_backup(
	backup_path: string,
): Promise<ConfigBackupInfo> {
	const backups = await list_config_backups();
	const backup = backups.find(
		(candidate) =>
			candidate.path === backup_path ||
			basename(candidate.path) === backup_path,
	);
	if (!backup) {
		throw new Error(`Config backup '${backup_path}' not found.`);
	}
	const content = await readFile(backup.path, 'utf-8');
	const parsed = JSON.parse(content) as Record<string, unknown>;
	await safe_json_write(backup.original_path, parsed);
	return backup;
}
