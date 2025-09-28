# MCPick

A claude Code CLI to have your MCP servers configured and load them in
as and when you need them.

## The issue

Using the Claude Code `/doctor` command you may see something like
this if you have a lot of MCP servers configured in your Claude Code
`.claude.json` file:

```bash
 Context Usage Warnings
 └ ⚠ Large MCP tools context (~66,687 tokens > 25,000)
   └ MCP servers:
     └ mcp-omnisearch-testing: 20 tools (~10,494 tokens)
     └ mcp-omnisearch: 20 tools (~10,454 tokens)
     └ mcp-sqlite-tools-testing: 19 tools (~9,910 tokens)
     └ mcp-sqlite-tools: 19 tools (~9,872 tokens)
     └ playwright: 21 tools (~9,804 tokens)
     └ (7 more servers)
```

This is because Claude Code loads all MCP servers defined in your
`.claude.json` file at the start of each session, regardless of
whether you need them or not.
