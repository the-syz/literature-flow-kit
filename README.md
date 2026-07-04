# IMA、Zotero 与本地归档的文献整理流程

这个仓库用于公开分享一套可交给 AI 执行的文献整理流程。目标是让 Codex、TraeSolo 等代理拿到仓库路径后，先读取主流程 skill，再根据本机环境补齐配置，最后把临时存放区中的论文整理到：

- 本地归档文件夹；
- IMA 知识库和文章索引笔记；
- Zotero 的 index-only 索引条目。

主流程入口是 `skills/literature-organizer/SKILL.md`。其他目录是 IMA、Zotero、MCP、harness 和配置模板。

## 目录结构

```text
skills/
  literature-organizer/   # 主流程 skill，负责编排从临时区到归档、IMA、Zotero 的全流程
  ima-skill/              # 项目级 IMA 组件，包含上传、查重、校验 harness
  zotero/                 # 项目级 Zotero 组件，负责 index-only 索引规则
integrations/
  zotero-mcp/             # Zotero MCP 服务和离线 smoke test
vendor/
  ima-skill/              # 随仓库携带的 IMA OpenAPI helper
config/
  env.example             # 环境变量模板，不包含真实密钥
  workflow_config.example.json
  trae-mcp.example.json
  workbuddy-mcp.example.json
  codex-automation.example.toml
automation/
  README.md               # 自动化模板说明
  prompts/                # 自动化 prompt 示例
  runners/                # 固定 runner 示例
docs/
  configuration.md        # 总体环境变量、API 和本地路径配置清单
  setup.md                # 安装和本地配置说明
  workflow.md             # 流程说明和 harness 约束
  codex-skill-automation-setup.md
                           # 配置到 Codex（skills + 固定 runner + 自动化）
  trae-work-setup.md      # 配置到 TRAE Work（Skills + MCP + 自动化）
  workbuddy-setup.md      # 配置到 WorkBuddy（Skills + MCP + 自动化）
examples/
  paper_record.example.json
scripts/
  doctor.cjs              # 离线仓库体检脚本
```

## 交给 AI 的最短使用方式

1. 先读 `AGENTS.md` 和 `skills/literature-organizer/SKILL.md`。
2. 对照 `docs/configuration.md` 准备 API 凭证、本地文件夹路径和 AI 工具配置入口。
3. 从 `config/env.example` 准备本机私有 `.env` 或 shell 环境变量，不要在对话、日志或公开说明中打印完整凭证。
4. 复制 `config/workflow_config.example.json` 到 `skills/ima-skill/harness/workflow_config.json`，填写本机路径；IMA 知识库和文章索引笔记由用户提供名称，AI 查询解析 ID 后写入配置。
5. 参考 `config/trae-mcp.example.json` 或 `config/workbuddy-mcp.example.json` 配置 Zotero MCP，把 `<repo>` 替换为本仓库的绝对路径。
6. 运行离线检查：

```powershell
node scripts/doctor.cjs
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
```

7. 填好 IMA 凭证和 `workflow_config.json` 后，再运行 live 预检：

```powershell
node skills/ima-skill/harness/preflight.cjs
```

## 配置到不同 AI 工具

不同 AI 工具的接入方式不同，但都复用同一套主流程、配置模板和 harness：

| 工具 | 文档 | 适用重点 |
| --- | --- | --- |
| 总体配置清单 | `docs/configuration.md` | API 凭证、环境变量、本地文件夹路径、AI 工具配置入口 |
| 通用本地配置 | `docs/setup.md` | 环境变量、`workflow_config.json`、Zotero MCP 基础检查 |
| Codex | `docs/codex-skill-automation-setup.md` | 安装 Codex-owned skills、固定 runner、自动化任务 |
| TRAE Work | `docs/trae-work-setup.md` | 项目级 skills、Zotero MCP、TRAE 自动化 |
| WorkBuddy | `docs/workbuddy-setup.md` | 用户级 skills、自定义 MCP、连接器信任、自动化 prompt |

公开文档只使用 `<repo>`、`<literature_root>`、`<logs_dir>` 等占位符。真实路径、API key、知识库 ID、笔记 ID 只写入本机私有配置。

自动化相关模板统一放在 `automation/` 和 `config/codex-automation.example.toml`。这些文件只作为可复制示例，不会被主流程自动读取；真实自动化 runner、prompt 和本机配置需要复制后再填入私有路径与环境变量。

## harness 说明

主流程新增了四个本地硬约束脚本，位于 `skills/literature-organizer/harness/`：

- `content_check.cjs`：检查标签数量、摘要长度、乱码和标题改写风险。
- `dedup_guard.cjs`：在归档前检查本地 SHA256、IMA 记录和 Zotero 状态。
- `next_archive_no.cjs`：扫描归档目录，计算下一个归档编号，禁止手填编号。
- `zotero_guard.cjs`：写入 Zotero 前检查 title、tags、extra 字段。

IMA 侧上传和末尾校验仍由 `skills/ima-skill/harness/` 执行。

## 隐私规则

仓库不应包含真实 API key、Zotero 导出备份、IMA 日志、归档 PDF 或本机绝对路径。`.env`、`.workflow-state`、日志、PDF、`skills/ima-skill/harness/workflow_config.json` 都已被忽略。

## 后续修改 skill

每个 skill 都保留为可直接手改的 Markdown 文件。主流程规则放在 `skills/literature-organizer/SKILL.md`，IMA 细节放在 `skills/ima-skill/SKILL.md`，Zotero 细节放在 `skills/zotero/SKILL.md`。修改后建议运行 `node scripts/doctor.cjs` 和对应 `node --check` 检查。
