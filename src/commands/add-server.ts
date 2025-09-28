import { confirm, note, select, text } from '@clack/prompts';
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

		// Advanced configuration
		const configure_advanced = await confirm({
			message:
				'Configure advanced settings (env variables, transport, etc.)?',
			initialValue: false,
		});

		if (typeof configure_advanced === 'symbol') return;

		let server_data: Partial<McpServer> = {
			name: name.trim(),
			command: command.trim(),
			args,
			...(description &&
				description.trim() && { description: description.trim() }),
		};

		if (configure_advanced) {
			// Transport type
			const transport_type = await select({
				message: 'Transport type:',
				options: [
					{
						value: 'stdio',
						label: 'stdio (default)',
						hint: 'Standard input/output',
					},
					{ value: 'sse', label: 'sse', hint: 'Server-sent events' },
					{ value: 'http', label: 'http', hint: 'HTTP transport' },
				],
				initialValue: 'stdio',
			});

			if (typeof transport_type === 'symbol') return;

			if (transport_type !== 'stdio') {
				server_data.type = transport_type as 'sse' | 'http';
			}

			// URL for non-stdio transports
			if (transport_type !== 'stdio') {
				const url = await text({
					message: 'Server URL:',
					placeholder: 'e.g., http://localhost:3000',
					validate: (value) => {
						if (!value || value.trim().length === 0) {
							return 'URL is required for non-stdio transport';
						}
						return undefined;
					},
				});

				if (typeof url === 'symbol') return;
				server_data.url = url.trim();
			}

			// Environment variables
			const env_input = await text({
				message:
					'Environment variables (KEY=value, comma-separated):',
				placeholder: 'e.g., API_KEY=abc123, TIMEOUT=30',
			});

			if (typeof env_input === 'symbol') return;

			if (env_input && env_input.trim()) {
				const env: Record<string, string> = {};
				env_input.split(',').forEach((pair) => {
					const [key, ...valueParts] = pair.split('=');
					if (key && valueParts.length > 0) {
						env[key.trim()] = valueParts.join('=').trim();
					}
				});
				if (Object.keys(env).length > 0) {
					server_data.env = env;
				}
			}

			// Headers for HTTP transport
			if (transport_type === 'http') {
				const headers_input = await text({
					message: 'HTTP headers (KEY=value, comma-separated):',
					placeholder:
						'e.g., Authorization=Bearer token, Content-Type=application/json',
				});

				if (typeof headers_input === 'symbol') return;

				if (headers_input && headers_input.trim()) {
					const headers: Record<string, string> = {};
					headers_input.split(',').forEach((pair) => {
						const [key, ...valueParts] = pair.split('=');
						if (key && valueParts.length > 0) {
							headers[key.trim()] = valueParts.join('=').trim();
						}
					});
					if (Object.keys(headers).length > 0) {
						server_data.headers = headers;
					}
				}
			}
		}

		const validated_server = validate_mcp_server(server_data);

		note(
			`Server to add:\n` +
				`Name: ${validated_server.name}\n` +
				`Command: ${
					validated_server.command
				} ${validated_server.args.join(' ')}\n` +
				`Description: ${validated_server.description || 'None'}`,
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
