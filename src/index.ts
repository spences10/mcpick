#!/usr/bin/env node

import { execSync } from 'node:child_process';
import {
	cancel,
	intro,
	isCancel,
	log,
	outro,
	select,
	text,
} from '@clack/prompts';
import { add_server } from './commands/add-server.js';
import { backup_config } from './commands/backup.js';
import { edit_config } from './commands/edit-config.js';
import { restore_config } from './commands/restore.js';
import { write_claude_config } from './core/config.js';
import {
	list_profiles,
	load_profile,
	save_profile,
} from './core/profile.js';
import { MenuAction } from './types.js';

interface CliArgs {
	profile?: string;
	saveProfile?: string;
	listProfiles?: boolean;
}

function parse_args(): CliArgs {
	const args = process.argv.slice(2);
	const result: CliArgs = {};

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--profile' || args[i] === '-p') {
			result.profile = args[i + 1];
			i++;
		} else if (args[i] === '--save-profile' || args[i] === '-s') {
			result.saveProfile = args[i + 1];
			i++;
		} else if (args[i] === '--list-profiles' || args[i] === '-l') {
			result.listProfiles = true;
		}
	}

	return result;
}

async function apply_profile(name: string): Promise<void> {
	intro(`MCPick - Loading profile: ${name}`);

	try {
		const profile_config = await load_profile(name);
		await write_claude_config(profile_config);
		const server_count = Object.keys(
			profile_config.mcpServers || {},
		).length;
		log.success(
			`Profile '${name}' applied (${server_count} servers)`,
		);
		outro('Done!');
	} catch (error) {
		if (error instanceof Error) {
			cancel(error.message);
		} else {
			cancel('Failed to load profile');
		}
		process.exit(1);
	}
}

async function show_profiles(): Promise<void> {
	intro('MCPick - Available Profiles');

	const profiles = await list_profiles();
	if (profiles.length === 0) {
		log.warn('No profiles found in ~/.claude/mcpick/profiles/');
		log.info('Create .json files there to use profiles');
	} else {
		for (const p of profiles) {
			log.info(`${p.name} (${p.serverCount} servers)`);
		}
	}

	outro('');
}

async function create_profile(name: string): Promise<void> {
	intro(`MCPick - Saving profile: ${name}`);

	try {
		const server_count = await save_profile(name);
		log.success(`Profile '${name}' saved (${server_count} servers)`);
		outro('Done!');
	} catch (error) {
		if (error instanceof Error) {
			cancel(error.message);
		} else {
			cancel('Failed to save profile');
		}
		process.exit(1);
	}
}

async function handle_load_profile(): Promise<void> {
	const profiles = await list_profiles();

	if (profiles.length === 0) {
		log.warn('No profiles found');
		log.info(
			'Save a profile first or create one in ~/.claude/mcpick/profiles/',
		);
		return;
	}

	const profile_name = await select({
		message: 'Select a profile to load:',
		options: profiles.map((p) => ({
			value: p.name,
			label: p.name,
			hint: `${p.serverCount} servers`,
		})),
	});

	if (isCancel(profile_name)) return;

	const profile_config = await load_profile(profile_name);
	await write_claude_config(profile_config);
	const server_count = Object.keys(
		profile_config.mcpServers || {},
	).length;
	log.success(
		`Profile '${profile_name}' applied (${server_count} servers)`,
	);
}

async function handle_save_profile(): Promise<void> {
	const name = await text({
		message: 'Profile name:',
		placeholder: 'e.g. database, web-dev, minimal',
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'Profile name is required';
			}
			if (!/^[\w-]+$/.test(value)) {
				return 'Use only letters, numbers, underscores, hyphens';
			}
		},
	});

	if (isCancel(name)) return;

	const server_count = await save_profile(name);
	log.success(`Profile '${name}' saved (${server_count} servers)`);
}

async function main(): Promise<void> {
	const args = parse_args();

	// Handle --list-profiles
	if (args.listProfiles) {
		await show_profiles();
		return;
	}

	// Handle --save-profile <name>
	if (args.saveProfile) {
		await create_profile(args.saveProfile);
		return;
	}

	// Handle --profile <name>
	if (args.profile) {
		await apply_profile(args.profile);
		return;
	}

	intro('MCPick - MCP Server Configuration Manager');

	while (true) {
		try {
			const action = await select({
				message: 'What would you like to do?',
				options: [
					{
						value: 'edit-config' as MenuAction,
						label: 'Enable / Disable MCP servers',
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
						value: 'load-profile' as MenuAction,
						label: 'Load profile',
						hint: 'Apply a saved profile',
					},
					{
						value: 'save-profile' as MenuAction,
						label: 'Save profile',
						hint: 'Save current config as profile',
					},
					{
						value: 'launch-claude' as MenuAction,
						label: 'Launch Claude',
						hint: 'Start Claude Code in current directory',
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
				case 'load-profile':
					await handle_load_profile();
					break;
				case 'save-profile':
					await handle_save_profile();
					break;
				case 'launch-claude':
					outro('Launching Claude Code...');
					try {
						execSync('exec claude', { stdio: 'inherit', shell: '/bin/bash' });
					} catch {
						// Claude exited - that's fine
					}
					process.exit(0);
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
