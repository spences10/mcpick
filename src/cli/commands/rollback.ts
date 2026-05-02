import { defineCommand } from 'citty';
import {
	list_config_backups,
	restore_config_backup,
} from '../../utils/safe-apply.js';
import { error, output } from '../output.js';

export default defineCommand({
	meta: {
		name: 'rollback',
		description:
			'List or restore automatic config backups created before safe writes',
	},
	args: {
		file: {
			type: 'positional',
			description:
				'Config backup filename or path. Defaults to latest backup.',
			required: false,
		},
		list: {
			type: 'boolean',
			description: 'List available config rollback backups',
			default: false,
		},
		json: {
			type: 'boolean',
			description: 'Output as JSON',
			default: false,
		},
	},
	async run({ args }) {
		try {
			const backups = await list_config_backups();
			if (args.list) {
				if (args.json) {
					output(backups, true);
					return;
				}
				if (backups.length === 0) {
					console.log('No config rollback backups found.');
					return;
				}
				for (const backup of backups) {
					console.log(
						`${backup.created_at}  ${backup.path}  ->  ${backup.original_path}`,
					);
				}
				return;
			}

			const backup_path = args.file || backups[0]?.path;
			if (!backup_path) {
				error('No config rollback backups found.');
			}
			const restored = await restore_config_backup(backup_path);
			if (args.json) {
				output({ restored }, true);
			} else {
				console.log(
					`Restored ${restored.original_path} from ${restored.path}`,
				);
			}
		} catch (err) {
			error(err instanceof Error ? err.message : 'Rollback failed');
		}
	},
});
