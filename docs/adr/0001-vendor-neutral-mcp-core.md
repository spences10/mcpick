# Use a portable MCP core with client adapters

MCPick will treat MCP server definitions as Portable Servers in its
core model and translate to vendor-specific config files through
Client Adapters. This deliberately moves Claude Code from being the
product model to being one adapter, because Gemini CLI, VS Code,
Cursor, Windsurf, OpenCode, Pi via pi-mcp-adapter, and other MCP
clients share the MCP concept but differ in config paths, field names,
scopes, and client-specific options. Pi core has no built-in MCP
support, so MCPick follows the pi-mcp-adapter config shape rather than
inventing a Pi-specific one.
