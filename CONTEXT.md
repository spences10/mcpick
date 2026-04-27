# MCPick

MCPick manages Model Context Protocol configuration across AI
development tools without making one vendor's config format the
product model.

## Language

**MCP Server**: A runnable or remote tool provider exposed through the
Model Context Protocol. _Avoid_: Claude server, plugin server

**MCP Client**: An AI application that loads MCP Server configuration
and exposes those tools to a model. _Avoid_: Vendor, app, host

**Client Adapter**: A module that translates between MCPick's portable
MCP Server shape and one MCP Client's config file shape. _Avoid_:
Provider, integration, plugin

**Portable Server**: MCPick's canonical representation of an MCP
Server independent of any MCP Client config file. _Avoid_: Claude
config, raw config

**Config Location**: A file path and scope where an MCP Client reads
MCP Server configuration. _Avoid_: path helper, config target

**Profile**: A saved set of Portable Servers intended to be applied to
one or more MCP Clients. _Avoid_: Claude profile

## Relationships

- An **MCP Client** reads one or more **Config Locations**.
- A **Client Adapter** translates between a **Config Location** and
  **Portable Servers**.
- A **Profile** contains **Portable Servers**.
- An **MCP Server** may appear in multiple **MCP Clients** with
  client-specific options.

## Example dialogue

> **Dev:** "Can we enable the Google docs MCP server in Gemini and
> Cursor without rewriting the JSON twice?" **Domain expert:** "Yes —
> keep it as a **Portable Server**, then let each **Client Adapter**
> write the right **Config Location**."

## Flagged ambiguities

- "server config" used to mean both MCPick registry entries and
  client-specific JSON. Resolved: **Portable Server** for MCPick's
  shape, **Config Location** for client-owned files.
