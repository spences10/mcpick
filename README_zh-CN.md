# MCPick

<!-- hy-mt2-i18n:start -->
[English](./README.md) | **中文** | [日本語](./README_ja.md) | [Español](./README_es.md)
<!-- hy-mt2-i18n:end -->


[![使用 Vite+ 构建](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![通过 Vitest 测试](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

一款对供应商中立的MCP配置管理工具，同时为Claude Code提供顶级支持。

MCPick 能帮助人类与大型语言模型智能体在多种 AI 客户端之间查看、切换及备份 MCP 服务器配置。针对 Claude Code 的插件、钩子、市场以及缓存相关命令依然可用，但它们已不再是该产品的核心模式。

## 安装

```bash
npm install -g mcpick
# 或直接运行查看帮助
npx mcpick --help
```

需求条件：

- Node.js 22及以上版本
- 仅针对Claude Code专属命令需要安装Claude Code
- 若需使用可移植技能命令，则需要安装已通过身份验证的GitHub CLI（`gh`）；[check-skills](https://github.com/spences10/check-skills)可在安装前验证相关技能是否可用

## 以智能体优先的 CLI

在非 TTY 环境中，MCPick 会显示帮助信息而非启动交互式 TUI。这样一来，对于类似以下的提示来说更为安全：

> “使用 mcpick 来研究如何启用该 MCP 服务器。”

使用方式如下：

```bash
npx mcpick --help
npx mcpick clients
npx mcpick list --json
```

MCPick 在输出结果前会屏蔽已知的敏感模式。由于 MCP 配置文件通常包含环境变量和授权标头，因此在 JSON 输出中，`env` 和 `headers` 的值会以 `***` 的形式显示。

## MCP 客户端

支持的客户端适配器：

| 客户端                | 范围                | 命令示例                                      |
| --------------------- | -------------------- | --------------------------------------------- |
| Claude Code           | local、project、user | `mcpick list`、`mcpick enable <server>`         |
| Gemini CLI            | project、user        | `mcpick list --client gemini-cli --scope project` |
| VS Code / Copilot     | project              | `mcpick list --client vscode --scope project`     |
| Cursor                | project、user        | `mcpick list --client cursor --scope user`        |
| Windsurf              | user                 | `mcpick list --client windsurf --scope user`      |
| OpenCode              | project、user        | `mcpick list --client opencode --scope project`   |
| 通过 pi-mcp-adapter 的 Pi | project、user        | `mcpick list --client pi --scope user`            |

显示已知的配置位置：

```bash
npx mcpick clients
npx mcpick clients --json
```

## MCP 服务器命令

```bash
# 列出 Claude Code 的注册表/状态
npx mcpick list
npx mcpick list --json

# 列出其他客户端
npx mcpick list --client pi --scope user --json
npx mcpick list --client opencode --scope project

# 启用/禁用 Claude Code
npx mcpick enable <server> --scope local
npx mcpick disable <server> --scope local

# 添加/删除 Claude Code 服务器定义
npx mcpick add --name <server> --command npx --args "-y,package-name"
npx mcpick add-json <name> '{"command":"npx","args":["-y","package-name"]}'
npx mcpick remove <server>
```

当您输入的值看起来像是敏感信息时，MCPick 会发出警告，同时会对输出内容进行遮蔽，而 `npx mcpick doctor` 命令则能标记出磁盘上已存在的明文敏感信息。为避免敏感信息出现在命令行及大语言模型的对话上下文中，请从进程环境当中获取这些值。

```bash
pnpx nopeek run.env --only GITHUB_TOKEN -- npx mcpick add --name github --command npx --args "-y,@modelcontextprotocol/server-github" --from-env GITHUB_TOKEN --yes
```

由于目前许多客户端都是以明文形式加载 MCP 凭证，因此 MCP 客户端配置文件仍可能存储明文密钥；如果您的客户端支持，建议使用 `${VAR}` 引用方式。

## 验证你的配置

`npx mcpick doctor` 会检查所有已知的客户端配置：JSON 的有效性、各客户端的架构格式、PATH 中缺失的命令、不同作用域中重复的服务器、明文形式的敏感信息，以及未被固定的服务器插件包。一旦发现错误，它会以非零状态退出，因此非常适合在 CI 环境中使用。

```bash
npx mcpick doctor
npx mcpick doctor --client cursor --json
```

## 可移植技能

MCPick 通过 GitHub CLI 的 `gh skill` 命令来安装可移植的 SKILL.md 包。安装过程会先在临时目录中进行，再通过 check-skills 进行验证，只有在确认无误后才会将相关内容写入你的 agent 目录，而且每次安装都会记录来源信息（源代码仓库、固定的引用地址以及目标 agent），这些信息可在 `skills list --json` 中查看。

```bash
# 列出某个客户端已安装的技能
npx mcpick skills list --agent pi --json

# 在 GitHub 中搜索，或在不安装的情况下查看某个源码库提供的内容
npx mcpick skills search svelte
npx mcpick skills add spences10/skills --list
npx mcpick skills preview spences10/skills svelte-runes

# 安装一个技能，并将其固定以便重复使用
npx mcpick skills add spences10/skills --agent pi --skill svelte-runes --pin v1.2.0 --yes

# 在用户范围内安装某个仓库中的所有技能
npx mcpick skills add spences10/skills --agent opencode --all --global --yes

# 检查更新并应用它们
npx mcpick skills update --dry-run --json
npx mcpick skills update
```

`gh skill` 后端不支持 `skills remove` 命令，因此会提示手动删除的路径。

## 专为 Claude Code 设计的工具

这些命令围绕 Claude Code 的功能设计，且专为客户端使用而定制：

```bash
# 插件
npx mcpick plugins list
npx mcpick plugins install <name>@<marketplace>
npx mcpick plugins enable <name>@<marketplace>
npx mcpick plugins disable <name>@<marketplace>

# 市场
npx mcpick marketplace list
npx mcpick marketplace add <source>
npx mcpick marketplace update
npx mcpick marketplace remove <name>

# Hook 与插件缓存
npx mcpick hooks list
npx mcpick cache status
npx mcpick cache refresh
```

## 配置文件与备份

配置文件即可移植的 MCP 服务器快照。Claude Code 插件状态则作为可选的 Claude 特有配置文件元数据被保留下来。

```bash
# 旧版的 Claude Code 快捷指令仍然有效
npx mcpick --profile database
npx mcpick --save-profile mysetup
npx mcpick --list-profiles

# 为特定的 MCP 客户端保存/加载配置文件
npx mcpick profile save work --client vscode --scope project
npx mcpick profile load work --client opencode --scope project
npx mcpick profile load work --client pi --scope user

npx mcpick backup
npx mcpick restore [file]

# 安全地写入在配置变更前创建的回滚备份
npx mcpick rollback --list
npx mcpick rollback [file]
```

## 交互式 TUI

在终端中运行 `npx mcpick` 即可打开面向用户的菜单：

MCPick —— MCP 配置管理器

您想执行什么操作？
  启用/禁用 MCP 服务器
  技能
  客户端专用工具
  加载配置文件
  保存配置文件
  备份配置
  从备份恢复
  退出

主要的 TUI 流程以客户端优先：先选择客户端，再切换其 MCP 服务器状态。Claude Code 的插件、钩子、市场以及缓存均位于“客户端特定工具”选项下。

## 配置文件位置

MCPick 会读取各客户端适配器所使用的标准配置路径。常见的路径包括：

| 路径                     | 用途                                             |
| ------------------------ | -------------------------------------------------- |
| `~/.claude.json`         | Claude Code 的本地/用户级 MCP 配置                 |
| `.mcp.json`              | 共享项目的 MCP 配置                               |
| `.gemini/settings.json`  | Gemini CLI 项目的配置                             |
| `.vscode/mcp.json`       | VS Code / Copilot 项目的配置                        |
| `.cursor/mcp.json`       | Cursor 项目的配置                                 |
| `opencode.json`          | OpenCode 项目的配置                               |
| `~/.config/mcp/mcp.json` | 由 pi-mcp-adapter 使用的共享全局 MCP 配置          |
| `.pi/mcp.json`           | Pi 项目的自定义配置                               |

为保持历史兼容性，由 MCPick 管理的状态数据存储在 `~/.claude/mcpick/` 目录下。

## 开发

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

有关架构相关说明，请参阅 `docs/VENDOR_NEUTRAL_ARCHITECTURE.md`。
