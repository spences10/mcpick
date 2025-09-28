import { confirm, note, text } from '@clack/prompts';
import { add_server_to_registry } from '../core/registry.js';
import { validate_mcp_server } from '../core/validation.js';
import { McpServer } from '../types.js';

export async function add_server(): Promise<void> {
	try {
		const name = await text({
			message: 'Server name:',
			placeholder: 'e.g., mcp-sqlite-tools',
			validate: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Server name is required';
				}
				return undefined;
			},
		});

		if (typeof name === 'symbol') return;

		const command = await text({
			message: 'Command to run:',
			placeholder: 'e.g., uvx, npx, node',
			validate: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Command is required';
				}
				return undefined;
			},
		});

		if (typeof command === 'symbol') return;

		const args_input = await text({
			message: 'Arguments (comma-separated):',
			placeholder: 'e.g., mcp-sqlite-tools, --port, 3000',
			defaultValue: '',
		});

		if (typeof args_input === 'symbol') return;

		const args = args_input
			.split(',')
			.map((arg) => arg.trim())
			.filter((arg) => arg.length > 0);

		const description = await text({
			message: 'Description (optional):',
			placeholder: 'Brief description of what this server provides',
		});

		if (typeof description === 'symbol') return;

		const estimated_tokens_input = await text({
			message: 'Estimated tokens (optional):',
			placeholder: 'e.g., 5000',
			validate: (value) => {
				if (value && value.trim().length > 0) {
					const num = parseInt(value.trim());
					if (isNaN(num) || num < 0) {
						return 'Must be a positive number';
					}
				}
				return undefined;
			},
		});

		if (typeof estimated_tokens_input === 'symbol') return;

		const server_data: Partial<McpServer> = {
			name: name.trim(),
			command: command.trim(),
			args,
			...(description &&
				description.trim() && { description: description.trim() }),
			...(estimated_tokens_input &&
				estimated_tokens_input.trim() && {
					estimated_tokens: parseInt(estimated_tokens_input.trim()),
				}),
		};

		const validated_server = validate_mcp_server(server_data);

		note(
			`Server to add:\n` +
				`Name: ${validated_server.name}\n` +
				`Command: ${
					validated_server.command
				} ${validated_server.args.join(' ')}\n` +
				`Description: ${validated_server.description || 'None'}\n` +
				`Estimated tokens: ${
					validated_server.estimated_tokens || 'Unknown'
				}`,
		);

		const should_add = await confirm({
			message: 'Add this server to the registry?',
		});

		if (typeof should_add === 'symbol' || !should_add) {
			return;
		}

		await add_server_to_registry(validated_server as McpServer);

		note(
			`Server "${validated_server.name}" added to registry successfully!`,
		);
	} catch (error) {
		throw new Error(
			`Failed to add server: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
