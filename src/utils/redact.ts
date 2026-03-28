import type { McpServer, McpServerBase } from '../types.js';

/**
 * Redact sensitive values (env, headers) from a server config.
 * Shows key names but replaces values with "***".
 */
export function redact_server_base(
	server: McpServerBase,
): McpServerBase {
	const redacted = { ...server };

	if ('env' in redacted && redacted.env) {
		redacted.env = redact_record(redacted.env);
	}

	if ('headers' in redacted && redacted.headers) {
		redacted.headers = redact_record(redacted.headers);
	}

	return redacted;
}

export function redact_server(server: McpServer): McpServer {
	return {
		...redact_server_base(server),
		name: server.name,
	} as McpServer;
}

function redact_record(
	record: Record<string, string>,
): Record<string, string> {
	const redacted: Record<string, string> = {};
	for (const key of Object.keys(record)) {
		redacted[key] = '***';
	}
	return redacted;
}
