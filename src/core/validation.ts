import * as v from 'valibot';

export const mcp_server_schema_stdio = v.object({
	type: v.optional(v.literal('stdio')),
	command: v.pipe(v.string(), v.minLength(1)),
	args: v.optional(v.array(v.string())),
	env: v.optional(v.record(v.string(), v.string())),
	description: v.optional(v.string()),
});

export const mcp_server_schema_sse = v.object({
	type: v.literal('sse'),
	env: v.optional(v.record(v.string(), v.string())),
	url: v.pipe(v.string(), v.minLength(1)),
	headers: v.optional(v.record(v.string(), v.string())),
	description: v.optional(v.string()),
});

export const mcp_server_schema_http = v.object({
	type: v.literal('http'),
	env: v.optional(v.record(v.string(), v.string())),
	url: v.pipe(v.string(), v.minLength(1)),
	headers: v.optional(v.record(v.string(), v.string())),
	description: v.optional(v.string()),
});

export const mcp_server_schema_base = v.union([
	mcp_server_schema_stdio,
	mcp_server_schema_sse,
	mcp_server_schema_http,
]);

export const mcp_server_schema = v.intersect([
	v.object({
		name: v.pipe(v.string(), v.minLength(1)),
	}),
	mcp_server_schema_base,
]);

export const claude_config_schema = v.object({
	mcpServers: v.optional(
		v.record(v.string(), mcp_server_schema_base),
	),
});

export const portable_mcp_server_schema = v.object({
	name: v.pipe(v.string(), v.minLength(1)),
	transport: v.union([
		v.literal('stdio'),
		v.literal('http'),
		v.literal('sse'),
	]),
	command: v.optional(v.string()),
	args: v.optional(v.array(v.string())),
	url: v.optional(v.string()),
	env: v.optional(v.record(v.string(), v.string())),
	headers: v.optional(v.record(v.string(), v.string())),
	description: v.optional(v.string()),
	disabled: v.optional(v.boolean()),
	client_options: v.optional(v.record(v.string(), v.unknown())),
});

export const server_registry_schema = v.object({
	version: v.literal(3),
	servers: v.array(portable_mcp_server_schema),
});

export function validate_mcp_server(data: unknown) {
	return v.parse(mcp_server_schema, data);
}

export function validate_claude_config(data: unknown) {
	return v.parse(claude_config_schema, data);
}

export function validate_server_registry(data: unknown) {
	return v.parse(server_registry_schema, data);
}
