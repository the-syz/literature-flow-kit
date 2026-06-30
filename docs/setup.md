# 本地配置

## 1. 凭证

把 `config/env.example` 复制到本机私有位置，例如仓库外的 `.env`、PowerShell profile 或系统环境变量。

IMA 需要：

- `IMA_OPENAPI_CLIENTID`
- `IMA_OPENAPI_APIKEY`

Zotero Web API 需要：

- `ZOTERO_API_KEY`
- `ZOTERO_USER_ID`

不要把真实凭证提交到 Git。

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
- `ima_note_index.note_id`：IMA 文章索引笔记 ID；
- `knowledge_base_mapping`：IMA 知识库名称到 ID 的映射；
- `logging.log_dir`：本地日志目录。

`skills/ima-skill/harness/workflow_config.json` 是本机私有配置，已被 `.gitignore` 忽略。

## 3. Zotero MCP 配置

以 `config/trae-mcp.example.json` 为模板，把 `<repo>` 替换为本仓库的绝对路径。

TraeSolo 使用时，把调整后的 JSON 放到 Trae 期望的项目级 MCP 配置位置。Codex 或其他代理使用时，可按各自 MCP 配置格式复用同一条 Python 服务命令。

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

## 5. 常见问题

- 如果 `doctor.cjs` 提示缺少 `workflow_config.json`，说明还没有复制本地配置文件。
- 如果 IMA 预检失败，先检查环境变量和知识库 ID。
- 如果 Zotero smoke test 只能列工具但不能写入，检查 `ZOTERO_API_KEY` 的写权限。
