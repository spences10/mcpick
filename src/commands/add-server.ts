import { confirm, log, note, select, text } from '@clack/prompts';
import { add_server_to_registry } from '../core/registry.js';
import { validate_mcp_server } from '../core/validation.js';
import { McpScope, McpServer } from '../types.js';
import {
	add_mcp_via_cli,
	check_claude_cli,
	get_scope_options,
	get_scope_description,
} from '../utils/claude-cli.js';

function format_server_details(server: McpServer): string[] {
	const details: string[] = [`Name: ${server.name}`];

	if ('command' in server) {
		details.push(
			`Command: ${server.command} ${(server.args || []).join(' ')}`,
		);
	}

	if ('url' in server) {
		details.push(`URL: ${server.url}`);
	}

	details.push(`Description: ${server.description || 'None'}`);

	if (server.type) {
		details.push(`Transport: ${server.type}`);
	}

	if (server.env) {
		details.push(
			`Environment: ${Object.keys(server.env).length} variables`,
		);
	}

	if ('headers' in server && server.headers) {
		details.push(
			`Headers: ${Object.keys(server.headers).length} headers`,
		);
	}

	return details;
}

export async function add_server(): Promise<void> {
	try {
		// Check if Claude CLI is available
		const cli_available = await check_claude_cli();

		// First, ask where to install the server (scope)
		const scope = await select<McpScope>({
			message: 'Where should this server be installed?',
			options: get_scope_options(),
			initialValue: 'local',
		});

		if (typeof scope === 'symbol') return;

		// Then ask how they want to configure the server
		const config_method = await select({
			message: 'How would you like to add the server?',
			options: [
				{
					value: 'json',
					label: 'Paste JSON configuration',
					hint: 'Paste complete server config as JSON',
				},
				{
					value: 'form',
					label: 'Step-by-step form',
					hint: 'Fill out fields one by one',
				},
			],
			initialValue: 'json',
		});

		if (typeof config_method === 'symbol') return;

		if (config_method === 'json') {
			return await add_server_from_json(scope, cli_available);
		}

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

		let server_data: any = {
			name: name.trim(),
			type: 'stdio',
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

			server_data.type = transport_type;

			// URL for non-stdio transports
			if (transport_type === 'sse' || transport_type === 'http') {
				// Remove stdio-specific fields
				delete server_data.command;
				delete server_data.args;

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

		const details = format_server_details(
			validated_server as McpServer,
		);
		details.push(`Scope: ${get_scope_description(scope)}`);

		note(`Server to add:\n${details.join('\n')}`);

		const should_add = await confirm({
			message: 'Add this server?',
		});

		if (typeof should_add === 'symbol' || !should_add) {
			return;
		}

		// Always add to registry for profile/backup management
		await add_server_to_registry(validated_server as McpServer);

		// Install via Claude CLI if available
		if (cli_available) {
			const result = await add_mcp_via_cli(
				validated_server as McpServer,
				scope,
			);
			if (result.success) {
				note(
					`Server "${validated_server.name}" installed successfully!\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Also added to mcpick registry for profile management.`,
				);
			} else {
				log.warn(
					`CLI installation failed: ${result.error}\n` +
						`Server added to registry only. Use 'claude mcp add' manually.`,
				);
			}
		} else {
			log.warn(
				`Claude CLI not found. Server added to registry only.\n` +
					`Install Claude Code CLI and run 'claude mcp add' to activate.`,
			);
		}
	} catch (error) {
		throw new Error(
			`Failed to add server: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}

async function add_server_from_json(
	scope: McpScope,
	cli_available: boolean,
): Promise<void> {
	const json_input = await text({
		message: 'Paste JSON configuration:',
		placeholder:
			'{ "name": "mcp-sqlite-tools", "command": "npx", "args": ["-y", "mcp-sqlite-tools"] }',
		validate: (value) => {
			if (!value || value.trim().length === 0) {
				return 'JSON configuration is required';
			}

			let jsonString = value.trim();

			// If it doesn't start with {, wrap it in braces
			if (!jsonString.startsWith('{')) {
				jsonString = `{${jsonString}}`;
			}

			try {
				const parsed = JSON.parse(jsonString);
				if (typeof parsed !== 'object' || parsed === null) {
					return 'JSON must be an object';
				}

				if (!parsed.command) {
					return 'Server configuration must include a "command" field';
				}
			} catch (error) {
				return 'Invalid JSON format';
			}

			return undefined;
		},
	});

	if (typeof json_input === 'symbol') return;

	try {
		let jsonString = json_input.trim();

		// If it doesn't start with {, wrap it in braces
		if (!jsonString.startsWith('{')) {
			jsonString = `{${jsonString}}`;
		}

		const parsed = JSON.parse(jsonString);

		const server_data = parsed;

		// Normalize the data to match schema expectations
		if (!server_data.type && server_data.command) {
			server_data.type = 'stdio';
		}
		if (server_data.type !== 'stdio') {
			delete server_data.command;
			delete server_data.args;
		}
		if (server_data.command && !server_data.args) {
			server_data.args = [];
		}

		const validated_server = validate_mcp_server(server_data);

		const details = format_server_details(
			validated_server as McpServer,
		);
		details.push(`Scope: ${get_scope_description(scope)}`);

		note(`Server to add:\n${details.join('\n')}`);

		const should_add = await confirm({
			message: 'Add this server?',
		});

		if (typeof should_add === 'symbol' || !should_add) {
			return;
		}

		// Always add to registry for profile/backup management
		await add_server_to_registry(validated_server as McpServer);

		// Install via Claude CLI if available
		if (cli_available) {
			const result = await add_mcp_via_cli(
				validated_server as McpServer,
				scope,
			);
			if (result.success) {
				note(
					`Server "${validated_server.name}" installed successfully!\n` +
						`Scope: ${get_scope_description(scope)}\n` +
						`Also added to mcpick registry for profile management.`,
				);
			} else {
				log.warn(
					`CLI installation failed: ${result.error}\n` +
						`Server added to registry only. Use 'claude mcp add' manually.`,
				);
			}
		} else {
			log.warn(
				`Claude CLI not found. Server added to registry only.\n` +
					`Install Claude Code CLI and run 'claude mcp add' to activate.`,
			);
		}
	} catch (error) {
		throw new Error(
			`Failed to parse or validate JSON: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`,
		);
	}
}
