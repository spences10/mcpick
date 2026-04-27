# MCPick Development Instructions

## Project shape

MCPick is a vendor-neutral MCP configuration manager with first-class
Claude Code support.

- Keep MCP server functionality client-neutral where possible.
- Keep Claude Code plugins, hooks, marketplaces, and cache commands
  clearly Claude-specific.
- Prefer CLI flows that work well for LLM agents: non-interactive
  flags, `--json`, useful help text, and redacted output.

## Prerequisites

- Node.js >=22.0.0
- pnpm

## Common commands

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

## Validation before finishing

Always run:

```bash
pnpm run check
pnpm test
pnpm build
```

`pnpm run check` validates formatting, lint, and types through
vite-plus.

## Changesets

For user-facing changes, add a changeset:

```bash
pnpm changeset
```

Use a short message prefixed with `feat`, `fix`, `chore`, or
`breaking`.
