# 本地配置

开始配置前，先阅读 `docs/configuration.md`。该文档汇总了所有环境变量、API 凭证、本地文件夹路径和 AI 工具配置入口。

## 1. 凭证

把 `config/env.example` 复制到本机私有位置，例如仓库外的 `.env`、PowerShell profile 或系统环境变量。

IMA 需要：

- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`

Zotero Web API 需要：

- `ZOTERO_API_KEY`
- `ZOTERO_USER_ID`

不要在对话、日志、公开说明或自动化 prompt 中打印完整凭证。

## 2. 文献流程配置

复制：

```text
config/workflow_config.example.json
```

到：

```text
skills/ima-skill/harness/workflow_config.json
```

然后替换以下占位内容：

- `paths.intake_dir`：临时存放区；
- `paths.recommended_archive_dir`：推荐文献归档目录；
- `paths.self_collected_archive_dir` 和 `archive_numbering.archive_dir`：自行查找文献归档目录；
- `ima_note_index.note_id`：由 AI 根据用户提供的文章索引笔记名称查询并填写；
- `knowledge_base_mapping`：由 AI 根据用户提供的知识库名称查询并填写名称到 ID 的映射；
- `logging.log_dir`：本地日志目录。

`skills/ima-skill/harness/workflow_config.json` 是本机私有配置，已被 `.gitignore` 忽略。

## 3. Zotero MCP 配置

TRAE Work 以 `config/trae-mcp.example.json` 为模板，把 `<repo>` 替换为本仓库的绝对路径。WorkBuddy 使用 `config/workbuddy-mcp.example.json`，同时把 `<python_absolute_path>` 替换为本机 Python 绝对路径。

TraeSolo 使用时，把调整后的 JSON 放到 Trae 期望的项目级 MCP 配置位置。Codex 或其他代理使用时，可按各自 MCP 配置格式复用同一条 Python 服务命令。

MCP 服务提供两类工具：

- `zotero_web_*`（7 个）：直接调用 Zotero Web API，只需 `ZOTERO_API_KEY` + `ZOTERO_USER_ID`。
- `zotero_local_*`（5 个）：通过本地辅助脚本查询 Zotero Desktop 客户端，需要设置 `ZOTERO_HELPER_SCRIPT` 环境变量指向 `integrations/zotero-mcp/scripts/zotero.py`，且 Zotero Desktop 必须在本机运行。

`ZOTERO_HELPER_SCRIPT` 的值应为 `zotero.py` 的绝对路径，例如：

```
ZOTERO_HELPER_SCRIPT=<repo>/integrations/zotero-mcp/scripts/zotero.py
```

该脚本仅依赖 Python 3.8+ 标准库，无需安装第三方包。可用以下命令验证：

```powershell
python <repo>/integrations/zotero-mcp/scripts/zotero.py status --json
```

## 4. 检查

离线检查：

```powershell
node scripts/doctor.cjs
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
```

IMA 凭证和 `workflow_config.json` 填好后，再运行：

```powershell
node skills/ima-skill/harness/preflight.cjs
```

## 5. 自动化日志文件夹

如需配置 AI 自动化任务（定时执行文献整理），需提前创建一个独立的日志文件夹：

```powershell
New-Item -ItemType Directory -Force -Path <logs_dir>
```

每次自动化执行时，AI 会将运行日志写入该目录，文件名格式为 `auto_YYYYMMDD_HHmmss.log` 或工具文档指定的格式。该文件夹独立于 `workflow_config.json` 中的 `logging.log_dir`，专门用于自动化任务的运行记录。

自动化模板位于：

- `automation/prompts/literature-organizer.prompt.example.md`：通用自动化 prompt 模板；
- `automation/runners/run-literature-organizer.example.cjs`：固定 runner 示例，默认只做示例检查，不执行真实归档；
- `config/codex-automation.example.toml`：Codex 自动化配置示例。

TRAE Work、WorkBuddy 和 Codex 的具体配置分别见对应工具文档。

## 6. 常见问题

- 如果 `doctor.cjs` 提示缺少 `workflow_config.json`，说明还没有复制本地配置文件。
- 如果 IMA 预检失败，先检查环境变量、知识库名称是否可解析，以及 AI 写入的知识库 ID 是否匹配。
- 如果 Zotero smoke test 只能列工具但不能写入，检查 `ZOTERO_API_KEY` 的写权限。
- 如果 `zotero_local_*` 工具返回 helper script not configured，检查 `ZOTERO_HELPER_SCRIPT` 是否指向了 `integrations/zotero-mcp/scripts/zotero.py` 的绝对路径，且 Zotero Desktop 正在运行。
