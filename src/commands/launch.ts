import { spinner } from '@clack/prompts';
import { spawn } from 'node:child_process';

export async function launch_claude_code(): Promise<void> {
	const s = spinner();

	try {
		s.start('Launching Claude Code...');

		const claude_process = spawn('claude', ['code'], {
			stdio: 'ignore',
			detached: true,
		});

		claude_process.unref();

		await new Promise((resolve, reject) => {
			claude_process.on('error', (error) => {
				if (error.message.includes('ENOENT')) {
					reject(
						new Error(
							'Claude Code not found. Make sure it is installed and in your PATH.',
						),
					);
				} else {
					reject(error);
				}
			});

			setTimeout(() => {
				resolve(void 0);
			}, 1000);
		});

		s.stop('Claude Code launched successfully!');
	} catch (error) {
		s.stop('Failed to launch Claude Code');
		throw new Error(
			`Failed to launch Claude Code: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
