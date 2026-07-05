# literature-flow-kit

一个面向 AI 代理的文献整理流程工具包，用来打通“临时存放区 -> 本地归档 -> AI 知识库 -> 引用库”的完整链路。

![literature-flow-kit 架构图](docs/literature-flow-architecture.svg)

## 这个仓库解决什么问题

在实际文献整理中，PDF、网页、笔记、引用条目和知识库往往分散在不同工具里。`literature-flow-kit` 的定位不是替代某一个文献软件，而是作为 AI 代理可以直接读取和执行的流程中枢：

- 让 Codex、TraeSolo、WorkBuddy 等 AI 代理知道应该先读哪些说明、确认哪些配置、执行哪些检查。
- 把临时存放区中的论文整理到本地归档目录，并保留可追溯的文章记录。
- 默认连接 IMA 知识库，用于上传文件、建立文章索引笔记和沉淀知识库内容。
- 默认连接 Zotero，用于维护文献引用库中的 index-only 条目。
- 在 `extra/` 中保留 NotebookLM、Notion、Obsidian、BibTeX / JabRef、EndNote 等扩展接口说明，方便用户不用默认方案时替换组件。

## 核心流程

```text
临时存放区
  -> AI 代理读取主流程 skill
  -> 内容检查、查重、编号、归档
  -> 本地归档文件夹
  -> AI 知识库（默认 IMA，可扩展 NotebookLM / Notion / Obsidian）
  -> 引用库（默认 Zotero，可扩展 BibTeX / JabRef / EndNote）
```

主流程入口是：

```text
skills/literature-organizer/SKILL.md
```

`skills/ima-skill/` 和 `skills/zotero/` 是默认配套组件，负责 IMA 和 Zotero 的具体操作约束。不要绕过主流程直接改动归档、知识库或引用库。

## 目录结构

```text
skills/
  literature-organizer/   # 主流程 skill，编排临时区、本地归档、IMA、Zotero
  ima-skill/              # IMA 配套组件与 harness
  zotero/                 # Zotero index-only 同步规则

integrations/
  zotero-mcp/             # Zotero MCP 服务和离线 smoke test

vendor/
  ima-skill/              # 随仓库携带的 IMA OpenAPI helper

config/
  env.example             # 环境变量示例
  workflow_config.example.json
  trae-mcp.example.json
  workbuddy-mcp.example.json
  codex-automation.example.toml

automation/
  README.md               # 自动化 runner、prompt、配置模板说明
  prompts/                # 自动化 prompt 示例
  runners/                # 固定 runner 示例

docs/
  configuration.md        # 用户需要提供哪些配置
  setup.md                # 本地安装和配置说明
  workflow.md             # 主流程和 harness 约束
  codex-skill-automation-setup.md
  trae-work-setup.md
  workbuddy-setup.md
  literature-flow-architecture.svg

extra/
  README.md               # 不使用默认 IMA / Zotero 时的扩展连接方案
  ai-knowledge-bases/     # NotebookLM / Notion / Obsidian 等
  reference-managers/     # BibTeX / JabRef / EndNote 等

examples/
  paper_record.example.json

scripts/
  doctor.cjs              # 离线仓库体检脚本
```

## 交给 AI 代理时如何使用

把仓库链接或本地目录交给 AI 代理后，让它按下面顺序读取：

1. `README.md`
2. `AGENTS.md`
3. `skills/literature-organizer/SKILL.md`
4. `docs/setup.md`
5. `docs/configuration.md`
6. `config/workflow_config.example.json`

然后让 AI 根据 `docs/configuration.md` 向用户收集本地配置，包括临时存放区、本地归档目录、IMA 知识库名称、IMA 文章索引笔记名称、Zotero 凭证和所使用 AI 工具的 MCP 配置入口。

用户只需要提供名称和本地路径；IMA 知识库 ID、IMA 笔记 ID 等映射应由 AI 通过对应接口查询后写入本机私有配置。

## 快速配置

1. 准备环境变量：

```powershell
Copy-Item config/env.example .env
```

2. 准备工作流配置：

```powershell
Copy-Item config/workflow_config.example.json skills/ima-skill/harness/workflow_config.json
```

3. 将示例配置中的占位符替换为本机配置：

```text
<intake_dir>
<recommended_archive_dir>
<self_collected_archive_dir>
<literature_root>
<repo>
```

4. 根据实际 AI 工具选择配置模板：

```text
config/trae-mcp.example.json
config/workbuddy-mcp.example.json
config/codex-automation.example.toml
```

5. 运行离线体检：

```powershell
node scripts/doctor.cjs
```

6. 配好 Zotero 和 IMA 后，再运行本机环境检查：

```powershell
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
node skills/ima-skill/harness/preflight.cjs
```

## 配置到不同 AI 工具

| 工具 | 文档 | 重点 |
| --- | --- | --- |
| 通用配置 | `docs/configuration.md` | 汇总 API、本地目录、知识库名称、引用库配置 |
| 本地安装 | `docs/setup.md` | 环境变量、私有配置、离线检查 |
| Codex | `docs/codex-skill-automation-setup.md` | skills、固定 runner、自动化任务 |
| TRAE Work | `docs/trae-work-setup.md` | 项目级 skills、Zotero MCP、TRAE 自动化 |
| WorkBuddy | `docs/workbuddy-setup.md` | 用户级 skills、自定义 MCP、自动化 prompt |

自动化模板统一放在 `automation/` 和 `config/codex-automation.example.toml`。这些文件只作为示例，不会被主流程自动读取。真实 runner、prompt 和本机配置需要复制后再填写私有路径和环境变量。

## 默认组件与扩展组件

默认方案：

- AI 知识库：IMA
- 引用库：Zotero
- 本地归档：推荐文献目录和自行查找文献目录
- 流程入口：`skills/literature-organizer/SKILL.md`

可选扩展：

- AI 知识库：NotebookLM、Notion、Obsidian
- 引用库：BibTeX / JabRef、EndNote

扩展方案都放在 `extra/` 中。它们不是主配置的一部分，也不会影响默认 IMA + Zotero 流程。用户可以把某个扩展目录交给 AI，让 AI 按该目录内的说明单独接入。

## harness 约束

主流程包含几类本地检查脚本，用于降低 AI 自动整理文献时的误操作风险：

- `skills/literature-organizer/harness/content_check.cjs`：检查标题、摘要、标签和乱码风险。
- `skills/literature-organizer/harness/dedup_guard.cjs`：归档前检查本地 SHA256、IMA 记录和 Zotero 状态。
- `skills/literature-organizer/harness/next_archive_no.cjs`：扫描归档目录并计算下一个编号。
- `skills/literature-organizer/harness/zotero_guard.cjs`：写入 Zotero 前检查 title、tags、extra 字段。
- `skills/ima-skill/harness/preflight.cjs`：检查 IMA 侧配置和上传前置条件。

这些 harness 是给 AI 代理执行真实流程前使用的安全边界。修改 skill 时，应同时确认对应 harness 是否需要更新。

## 隐私与公开分享

本仓库按公开分享设计，公开文件只保留模板、占位符和说明。不要在文档、示例、日志或 issue 中写入完整凭证。

公开文档和模板应只使用：

```text
<repo>
<literature_root>
<intake_dir>
<zotero_user_id>
<zotero_api_key>
<ima_kb_name>
<ima_note_name>
```

真实 API key、本地绝对路径、IMA 知识库 ID、IMA 笔记 ID、Zotero user ID、日志、PDF、私有 `workflow_config.json` 都应保留在本机环境中。

## 后续修改 skill

每个 skill 都保留为可手动修改的 Markdown 文件：

- 主流程：`skills/literature-organizer/SKILL.md`
- IMA 组件：`skills/ima-skill/SKILL.md`
- Zotero 组件：`skills/zotero/SKILL.md`
- 扩展组件：`extra/**/README.md`

修改后建议运行：

```powershell
node scripts/doctor.cjs
node --check scripts/doctor.cjs
```

如果修改了自动化 runner，还应运行：

```powershell
node --check automation/runners/run-literature-organizer.example.cjs
```
