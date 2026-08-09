# MCPick

<!-- hy-mt2-i18n:start -->
[English](./README.md) | [中文](./README_zh-CN.md) | **日本語** | [Español](./README_es.md)
<!-- hy-mt2-i18n:end -->


[![built with vite+](https://img.shields.io/badge/built%20with-Vite+-646CFF?logo=vite&logoColor=white)](https://viteplus.dev)
[![tested with vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

クラウド・コードに対する優れたサポートを備えた、ベンダーニュートラルなMCP設定管理ツールです。

MCPickは、人間とLLMエージェントが複数のAIクライアントにわたってMCPサーバーの設定を確認、切り替え、バックアップするのを支援します。Claude Code専用のプラグイン、フック、マーケットプレイス、キャッシュ関連コマンドも引き続き利用可能ですが、これらはもはやコアな製品モデルではありません。

## インストール

```bash
npm install -g mcpick
# またはインストールせずに実行
npx mcpick --help
```

要件：

- Node.js 22以上
- Claude Code専用のコマンドを使用する場合のみClaude Codeが必要
- ポータブルスキルコマンドを利用するにはGitHub CLI（`gh`、認証済み）が必要です。[check-skills](https://github.com/spences10/check-skills)を使えば、利用可能な場合にインストール前にスキルを検証できます

## エージェント優先型CLI

TTYでない環境では、MCPickは対話型のTUIを起動する代わりにヘルプを表示します。これにより、次のようなプロンプトを使用する際により安全になります：

「このMCPサーバーを有効にする方法を見つけるには、mcpickを使用してください。」

使用方法：

```bash
npx mcpick --help
npx mcpick clients
npx mcpick list --json
```

MCPickは出力を表示する前に既知の機密パターンを隠蔽します。MCP設定ファイルには多くの場合環境変数や認可ヘッダーが含まれているため、JSON出力では`env`および`headers`の値は`***`として表示されます。

## MCPクライアント

対応するクライアントアダプタ：

| Client                | Scopes               | Command examples                                  |
| --------------------- | -------------------- | ------------------------------------------------- |
| Claude Code           | local, project, user | `mcpick list`, `mcpick enable <server>`           |
| Gemini CLI            | project, user        | `mcpick list --client gemini-cli --scope project` |
| VS Code / Copilot     | project              | `mcpick list --client vscode --scope project`     |
| Cursor                | project, user        | `mcpick list --client cursor --scope user`        |
| Windsurf              | user                 | `mcpick list --client windsurf --scope user`      |
| OpenCode              | project, user        | `mcpick list --client opencode --scope project`   |
| Pi via pi-mcp-adapter | project, user        | `mcpick list --client pi --scope user`            |

既知の設定場所を表示する：

```bash
npx mcpick clients
npx mcpick clients --json
```

## MCPサーバーコマンド

```bash
# Claude Codeのレジストリ/ステータスを一覧表示
npx mcpick list
npx mcpick list --json

# 他のクライアントを一覧表示
npx mcpick list --client pi --scope user --json
npx mcpick list --client opencode --scope project

# Claude Codeの有効化/無効化
npx mcpick enable <server> --scope local
npx mcpick disable <server> --scope local

# Claude Codeサーバー定義の追加/削除
npx mcpick add --name <server> --command npx --args "-y,package-name"
npx mcpick add-json <name> '{"command":"npx","args":["-y","package-name"]}'
npx mcpick remove <server>
```

MCPickは、入力した値が機密情報のように見える場合に警告を発し、出力内容を隠蔽します。また、`npx mcpick doctor`を使用すると、ディスク上に既に存在するプレーンテキスト形式の機密情報が特定されます。コマンドラインやLLMの会話コンテキストに機密情報が含まれないように、それらはプロセス環境から取得するべきです。

```bash
pnpx nopeek run.env --only GITHUB_TOKEN -- npx mcpick add --name github --command npx --args "-y,@modelcontextprotocol/server-github" --from-env GITHUB_TOKEN --yes
```

MCPクライアントの設定ファイルには依然として平文のセキュリティ情報が格納されている場合があります。これは現在多くのクライアントがMCP認証情報を読み込む際の方法だからです。クライアントが対応している場合は、`${VAR}`形式の参照を使用することを推奨します。

## 設定の検証

`npx mcpick doctor`は、既知のすべてのクライアント設定をチェックします。JSONの有効性、各クライアント固有のスキーマの形状、PATH上に存在しないコマンド、異なるスコープ間で重複するサーバー、プレインテキスト形式のシークレット、そしてピンされていないサーバーパッケージなどです。エラーが見つかると非ゼロの状態で終了するため、CI環境でも利用可能です。

```bash
npx mcpick doctor
npx mcpick doctor --client cursor --json
```

## ポータブルスキル

MCPickはGitHub CLIの`gh skill`コマンドを通じて、ポータブルなSKILL.mdパックをインストールします。インストールは一時ディレクトリ内で段階的に行われ、agentディレクトリに何かが書き込まれる前にcheck-skillsによって検証が行われます。また、各インストールについては出所（ソースリポジトリ、ピンされたリファレンス、対象のagent）が記録され、`skills list --json`で確認できます。

```bash
# クライアントにインストールされているスキルを一覧表示
npx mcpick skills list --agent pi --json

# GitHubを検索するか、インストールせずにソースが提供する内容を確認する
npx mcpick skills search svelte
npx mcpick skills add spences10/skills --list
npx mcpick skills preview spences10/skills svelte-runes

# 再現性のためにピン留めして1つのスキルをインストールする
npx mcpick skills add spences10/skills --agent pi --skill svelte-runes --pin v1.2.0 --yes

# ユーザースコープ内のリポジトリからすべてのスキルをインストールする
npx mcpick skills add spences10/skills --agent opencode --all --global --yes

# アップデートがあるか確認し、適用する
npx mcpick skills update --dry-run --json
npx mcpick skills update
```

`gh skill` バックエンドでは `skills remove` はサポートされておらず、代わりに手動での削除方法が示されます。

## Claude Code専用ツール

これらのコマンドはClaude Codeの概念をラップしたもので、意図的に
クライアント専用のものとなっています。

```bash
# プラグイン
npx mcpick plugins list
npx mcpick plugins install <name>@<marketplace>
npx mcpick plugins enable <name>@<marketplace>
npx mcpick plugins disable <name>@<marketplace>

# マーケットプレイス
npx mcpick marketplace list
npx mcpick marketplace add <source>
npx mcpick marketplace update
npx mcpick marketplace remove <name>

# フックとプラグインキャッシュ
npx mcpick hooks list
npx mcpick cache status
npx mcpick cache refresh
```

## プロファイルとバックアップ

プロファイルとは、移植可能なMCPサーバーのスナップショットです。Claude Codeのプラグイン状態は、オプションとして提供されるClaude専用のプロファイルメタデータとして保存されます。

```bash
# 古いClaude Codeのショートカットも引き続き利用可能
npx mcpick --profile database
npx mcpick --save-profile mysetup
npx mcpick --list-profiles

# 特定のMCPクライアント用のプロファイルの保存/読み込み
npx mcpick profile save work --client vscode --scope project
npx mcpick profile load work --client opencode --scope project
npx mcpick profile load work --client pi --scope user

npx mcpick backup
npx mcpick restore [file]

# 設定が変更される前に作成されたロールバックバックアップを安全に書き出し
npx mcpick rollback --list
npx mcpick rollback [file]
```

## インタラクティブなTUI

ターミナルで `npx mcpick` を実行すると、ユーザー向けのメニューが表示されます：

MCPick – MCP設定マネージャー

何を行いたいですか？
  MCPサーバーの有効/無効化
  スキル
  クライアント固有のツール
  プロファイルの読み込み
  プロファイルの保存
  設定のバックアップ
  バックアップからの復元
  終了

メインのTUIの流れはクライアント優先で、まずクライアントを選択し、そのMCPサーバーの
有効/無効を切り替えます。Claude Codeのプラグイン、フック、マーケットプレイス、
キャッシュは「Client-specific tools」の下に表示されます。

## 設定ファイルの場所

MCPickは、各クライアントアダプターが使用する標準的な設定場所を読み込みます。
よく使われるパスには以下のものがあります：

| パス                     | 機能                                             |
| ------------------------ | ------------------------------------------------ |
| `~/.claude.json`         | Claude Codeのローカル/ユーザー専用MCP設定             |
| `.mcp.json`              | プロジェクト共有可能なMCP設定                     |
| `.gemini/settings.json`  | Gemini CLIのプロジェクト設定                     |
| `.vscode/mcp.json`       | VS Code/Copilotのプロジェクト設定                 |
| `.cursor/mcp.json`       | Cursorのプロジェクト設定                         |
| `opencode.json`          | OpenCodeのプロジェクト設定                         |
| `~/.config/mcp/mcp.json` | pi-mcp-adapterが使用するグローバル共有可能なMCP設定 |
| `.pi/mcp.json`           | Piプロジェクト用のオーバーライド設定               |

歴史的な互換性を維持するため、MCPickが管理する状態データは `~/.claude/mcpick/` 内に保存されています。

## 開発

```bash
pnpm install
pnpm test
pnpm run check
pnpm build
```

アーキテクチャに関する詳細は、`docs/VENDOR_NEUTRAL_ARCHITECTURE.md` をご覧ください。
