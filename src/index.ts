#!/usr/bin/env node

import {
	cancel,
	intro,
	isCancel,
	outro,
	select,
} from '@clack/prompts';
import { add_server } from './commands/add-server.js';
import { backup_config } from './commands/backup.js';
import { edit_config } from './commands/edit-config.js';
import { restore_config } from './commands/restore.js';
import { MenuAction } from './types.js';

async function main(): Promise<void> {
	intro('MCPick - MCP Server Configuration Manager');

	while (true) {
		try {
			const action = await select({
				message: 'What would you like to do?',
				options: [
					{
						value: 'edit-config' as MenuAction,
						label: 'Edit config',
						hint: 'Toggle MCP servers on/off',
					},
					{
						value: 'backup' as MenuAction,
						label: 'Backup config',
						hint: 'Create a timestamped backup',
					},
					{
						value: 'add-server' as MenuAction,
						label: 'Add MCP server',
						hint: 'Register a new MCP server',
					},
					{
						value: 'restore' as MenuAction,
						label: 'Restore from backup',
						hint: 'Restore from a previous backup',
					},
					{
						value: 'exit' as MenuAction,
						label: 'Exit',
						hint: 'Quit MCPick (Esc)',
					},
				],
			});

			if (isCancel(action)) {
				cancel('Operation cancelled');
				break;
			}

			switch (action) {
				case 'edit-config':
					await edit_config();
					break;
				case 'backup':
					await backup_config();
					break;
				case 'add-server':
					await add_server();
					break;
				case 'restore':
					await restore_config();
					break;
				case 'exit':
					outro('Goodbye!');
					process.exit(0);
			}
		} catch (error) {
			if (error instanceof Error) {
				cancel(error.message);
			} else {
				cancel('An unexpected error occurred');
			}

			const should_continue = await select({
				message: 'Would you like to continue?',
				options: [
					{ value: true, label: 'Yes, return to main menu' },
					{ value: false, label: 'No, exit' },
				],
			});

			if (isCancel(should_continue) || !should_continue) {
				outro('Goodbye!');
				break;
			}
		}
	}
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
