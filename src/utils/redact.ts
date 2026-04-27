import type { PortableMcpServer } from '../core/client-config.js';
import type { McpServer, McpServerBase } from '../types.js';

const SENSITIVE_KEY_PATTERN =
	/(api[_-]?key|token|secret|password|passwd|authorization|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)/i;

const ANSI_PATTERN = new RegExp(
	String.raw`[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
	'g',
);

const TEXT_REDACTIONS: Array<[RegExp, string]> = [
	[/AKIA[A-Z0-9]{16}/g, '[REDACTED:AWS_ACCESS_KEY]'],
	[/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED:GOOGLE_API_KEY]'],
	[/\bya29\.[0-9A-Za-z_-]{20,}\b/g, '[REDACTED:GOOGLE_OAUTH_TOKEN]'],
	[
		/\bsk-(?:live|test)?_?[a-zA-Z0-9._-]{20,}\b/g,
		'[REDACTED:API_KEY]',
	],
	[
		/\b(?:pk|rk)_(?:live|test)_[a-zA-Z0-9]{20,}\b/g,
		'[REDACTED:API_KEY]',
	],
	[/\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
	[/(:\/\/[^:\s/@]+):([^@\s]+)@/g, '$1:[REDACTED]@'],
	[
		/([?&][^=&#\s]*(?:token|key|secret|password|passwd)[^=&#\s]*=)[^&#\s]*/gi,
		'$1[REDACTED]',
	],
	[
		/\b(Authorization\s*:\s*)(?:Bearer\s+)?[^\s,}\]]+/gi,
		'$1[REDACTED]',
	],
	[
		/\b((?:api[_-]?key|token|secret|password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?)[^"'\s,}\]]{8,}/gi,
		'$1[REDACTED]',
	],
	[
		/\b((?:SecretAccessKey|aws_secret_access_key)\s*[:=]\s*)[A-Za-z0-9/+=]{20,}/gi,
		'$1[REDACTED]',
	],
	[
		/-----BEGIN\s+[\w\s]*PRIVATE\s+KEY-----[\s\S]*?-----END\s+[\w\s]*PRIVATE\s+KEY-----/g,
		'[REDACTED:PRIVATE_KEY]',
	],
];

/**
 * Redact known secret patterns from arbitrary text. This is a safety net for
 * CLI stdout/stderr; structured MCP config redaction should happen first.
 */
export function redact_text(text: string): string {
	let redacted = text;
	for (const [pattern, replacement] of TEXT_REDACTIONS) {
		redacted = redacted.replace(pattern, replacement);
	}
	return redacted.replace(ANSI_PATTERN, '');
}

export function redact_value(value: unknown, key = ''): unknown {
	if (typeof value === 'string') {
		return SENSITIVE_KEY_PATTERN.test(key)
			? '***'
			: redact_text(value);
	}

	if (Array.isArray(value)) {
		return value.map((item) => redact_value(item));
	}

	if (value && typeof value === 'object') {
		const redacted: Record<string, unknown> = {};
		for (const [child_key, child_value] of Object.entries(value)) {
			redacted[child_key] =
				child_key === 'env' || child_key === 'headers'
					? redact_unknown_record(child_value)
					: SENSITIVE_KEY_PATTERN.test(child_key)
						? '***'
						: redact_value(child_value, child_key);
		}
		return redacted;
	}

	return value;
}

/**
 * Redact sensitive values from a server config.
 * Shows env/header key names but replaces values with "***".
 */
export function redact_server_base(
	server: McpServerBase,
): McpServerBase {
	const redacted = redact_value(server) as McpServerBase;

	if ('env' in redacted && redacted.env) {
		redacted.env = redact_record(redacted.env);
	}

	if ('headers' in redacted && redacted.headers) {
		redacted.headers = redact_record(redacted.headers);
	}

	if ('url' in redacted && redacted.url) {
		redacted.url = redact_url(redacted.url);
	}

	return redacted;
}

export function redact_server(server: McpServer): McpServer {
	return {
		...redact_server_base(server),
		name: server.name,
	} as McpServer;
}

export function redact_portable_server(
	server: PortableMcpServer,
): PortableMcpServer {
	const redacted = redact_value(server) as PortableMcpServer;
	return {
		...redacted,
		...(server.env ? { env: redact_record(server.env) } : {}),
		...(server.headers
			? { headers: redact_record(server.headers) }
			: {}),
		...(server.url ? { url: redact_url(server.url) } : {}),
	};
}

export function redact_url(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.username = '';
		parsed.password = '';
		parsed.search = parsed.search ? '?redacted' : '';
		parsed.hash = '';
		return parsed.toString();
	} catch {
		return redact_text(url.replace(/[?#].*$/, '?redacted'));
	}
}

function redact_unknown_record(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return redact_value(value);
	}

	const redacted: Record<string, unknown> = {};
	for (const key of Object.keys(value)) {
		redacted[key] = '***';
	}
	return redacted;
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
