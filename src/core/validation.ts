import * as v from 'valibot';

export const mcp_server_schema = v.object({
	name: v.pipe(v.string(), v.minLength(1)),
	command: v.pipe(v.string(), v.minLength(1)),
	args: v.array(v.string()),
	description: v.optional(v.string()),
	estimated_tokens: v.optional(v.number()),
});

export const claude_config_schema = v.object({
	mcpServers: v.optional(
		v.record(
			v.string(),
			v.object({
				type: v.optional(
					v.union([
						v.literal('stdio'),
						v.literal('sse'),
						v.literal('http'),
					]),
				),
				command: v.pipe(v.string(), v.minLength(1)),
				args: v.array(v.string()),
				env: v.optional(v.record(v.string(), v.string())),
				url: v.optional(v.string()),
				headers: v.optional(v.record(v.string(), v.string())),
				description: v.optional(v.string()),
				estimated_tokens: v.optional(v.number()),
			}),
		),
	),
});

export const server_registry_schema = v.object({
	servers: v.array(mcp_server_schema),
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
