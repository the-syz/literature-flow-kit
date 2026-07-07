# 应用本 skill 需要提供的配置

本文档面向外部使用者和 AI 代理。当用户问“我想应用这个文献整理 skill，需要提供哪些配置？”时，优先读取本文档，并按下方清单向用户收集信息或检查本机环境。

本文档只说明**需要收集什么**、**由 AI 写到哪里**、**如何验证是否已配置**。用户只需要提供 IMA 知识库名称和文章索引笔记名称；AI 代理负责查询对应 ID，并写入本机配置。不要把真实 API key、知识库 ID、笔记 ID、本机绝对路径写入公开 prompt、日志或回复中。

## 1. AI 代理使用方式

AI 代理配置本流程时，应按以下顺序执行：

1. 读取 `AGENTS.md`、`README.md`、本文档和 `skills/literature-organizer/SKILL.md`。
2. 对照“用户需要提供的信息清单”向用户收集缺失配置；IMA 只向用户收集名称，不要求用户手动提供 ID。
3. 将公开模板复制为本机私有配置：
   - `config/env.example` → 本机 `.env`、系统环境变量或 shell profile；
   - `config/workflow_config.example.json` → `skills/ima-skill/harness/workflow_config.json`。
4. 根据用户使用的 AI 工具选择 MCP / 自动化模板：
   - TRAE Work：`config/trae-mcp.example.json`；
   - WorkBuddy：`config/workbuddy-mcp.example.json`；
   - Codex：`config/codex-automation.example.toml` 和 `automation/`。
5. 用 IMA 查询能力解析知识库 ID 和文章索引笔记 ID，并写入 `workflow_config.json`。
6. 先运行离线检查，再运行需要真实凭证和本机服务的 live 检查。

如果用户暂时不能提供某项真实值，AI 应保留占位符并明确标记“待填写”，不得编造 ID、路径或凭证。

## 2. 用户需要提供的信息清单

### 2.1 必填 API 凭证

这些值写入本机私有环境变量，不写入公开文档。

| 需要用户提供 | 环境变量 | 用途 | 是否可跳过 |
| --- | --- | --- | --- |
| IMA OpenAPI Client ID | `IMA_OPENAPI_CLIENTID` | 访问 IMA OpenAPI | 不可跳过 |
| IMA OpenAPI API Key | `IMA_OPENAPI_APIKEY` | 上传文件、写入笔记 | 不可跳过 |
| Zotero Web API Key | `ZOTERO_API_KEY` | 创建 / 更新 Zotero index-only 条目 | 不可跳过 |
| Zotero numeric User ID | `ZOTERO_USER_ID` | 定位 Zotero 用户库 | 不可跳过 |

验证时只检查是否已设置，不打印完整值：

```powershell
if ($env:IMA_OPENAPI_CLIENTID) { "IMA_OPENAPI_CLIENTID 已设置" } else { "IMA_OPENAPI_CLIENTID 未设置" }
if ($env:IMA_OPENAPI_APIKEY) { "IMA_OPENAPI_APIKEY 已设置" } else { "IMA_OPENAPI_APIKEY 未设置" }
if ($env:ZOTERO_API_KEY) { "ZOTERO_API_KEY 已设置" } else { "ZOTERO_API_KEY 未设置" }
if ($env:ZOTERO_USER_ID) { "ZOTERO_USER_ID 已设置" } else { "ZOTERO_USER_ID 未设置" }
```

### 2.2 本地文件夹路径

这些值写入 `skills/ima-skill/harness/workflow_config.json`。用户必须提供真实本机路径，公开模板中只保留占位符。

| 需要用户提供 | 写入字段 / 占位符 | 说明 |
| --- | --- | --- |
| 仓库根目录 | `<repo>` | 本仓库所在目录 |
| 文献工作区根目录 | `<literature_root>` | 文献流程所在根目录，可与 `<repo>` 相同 |
| 临时存放区 | `paths.intake_dir` / `<intake_dir>` | 新下载 PDF 的输入目录 |
| 推荐文献归档目录 | `paths.recommended_archive_dir` / `<recommended_archive_dir>` | 推荐文献整理后的存放目录 |
| 自行查找文献归档目录 | `paths.self_collected_archive_dir` / `<self_collected_archive_dir>` | 自行查找文献整理后的存放目录 |
| 编号扫描目录 | `archive_numbering.archive_dir` | 通常等于自行查找文献归档目录 |
| harness 日志目录 | `logging.log_dir` | harness 脚本运行日志目录 |
| 自动化日志 / 报告目录 | `<logs_dir>` 或 `LITERATURE_AUTOMATION_LOG_DIR` | AI 自动化每次运行的报告目录 |

路径约定：

- 临时存放区和归档目录必须分开，避免重复处理已归档文件。
- JSON 中使用正斜杠 `/` 或双反斜杠 `\\`。
- 本机绝对路径只写入本机配置，不写入公开说明、prompt 模板或日志。

### 2.3 IMA 知识库和文章索引笔记

用户只需要提供可在 IMA 中识别的名称。AI 代理应通过 IMA 查询 / 列表能力找到对应 ID，并写入 `skills/ima-skill/harness/workflow_config.json`。

| 需要用户提供 | AI 写入字段 | 说明 |
| --- | --- | --- |
| 默认知识库名称 | `default_knowledge_base` | 无法自动分类时使用 |
| 需要写入的知识库名称列表 | `knowledge_base_mapping` | AI 根据名称查询 ID，写成名称到 ID 的映射 |
| 推荐文献目标知识库 | `knowledge_base_routing.recommended.target_kb` | 推荐文献统一进入的知识库 |
| 自行查找文献路由规则 | `knowledge_base_routing.self_collected.routing` | 可不分类，也可按用户自定义主题映射到不同知识库 |
| 文章索引笔记名称 | `ima_note_index.note_name` | 用于人工识别 |
| 文章索引笔记名称 | `ima_note_index.note_id` | AI 根据笔记名称查询 ID 后写入 |
| 索引追加格式 | `ima_note_index.append_format` | 可沿用模板默认格式 |

知识库分类规则：

- 如果用户不需要分类，自行查找文献可以统一写入 `default_knowledge_base`。
- 如果用户需要分类，分类名称和路由规则由用户自己的知识库体系决定，公开模板不得写死具体研究方向。
- 路由时优先匹配明确主题知识库；只有无法可靠匹配任何明确主题时，才使用兜底知识库。
- 不应把“其他”“其他论文”等兜底类作为优先目标；能判断主题时必须进入更具体的主题知识库。

如果用户只想先测试本地归档和 Zotero，可先保留 IMA 写入为待配置状态；真实上传 IMA 前，AI 必须根据用户提供的知识库名称和笔记名称解析并写入对应 ID。

### 2.4 Zotero 配置

| 需要用户提供 | 配置项 | 说明 |
| --- | --- | --- |
| Zotero Web API key | `ZOTERO_API_KEY` | 创建 / 更新 Zotero 条目 |
| Zotero numeric user id | `ZOTERO_USER_ID` | Zotero 用户库 ID |
| Zotero Desktop 是否运行 | `ZOTERO_LOCAL_BASE_URL` | 默认 `http://127.0.0.1:23119` |
| 本地辅助脚本路径 | `ZOTERO_HELPER_SCRIPT` | 默认 `<repo>/integrations/zotero-mcp/scripts/zotero.py` |
| 写入模式 | `ZOTERO_SYNC_MODE` | 固定建议为 `index-only` |

`index-only` 表示 Zotero 只保存索引条目，不上传 PDF 附件。Zotero `extra` 至少应包含：

```text
Local-Path: <archive_path>/<archive_no>-<title>.pdf
SHA256: <file_sha256>
Archive-No: <archive_no>
IMA-Status: uploaded|pending|failed
Managed-By: literature-workflow
```

### 2.4.1 备选接口：BibTeX / JabRef 兼容配置

如果用户不用本仓库默认的 Zotero 主方案，而是使用 JabRef、LaTeX、Overleaf 或 Pandoc，可以选择 `extra/reference-managers/jabref/` 中的 BibTeX / JabRef 兼容备选接口。该接口不连接 JabRef 桌面端，AI 只维护 `.bib` / `.biblatex` 文件和 PDF 附件路径。

| 需要用户提供 | 配置项 | 说明 |
| --- | --- | --- |
| BibTeX 文件路径 | `reference_backend.bib_file` | 默认建议 `<literature_root>/references/references.bib` |
| PDF 归档目录 | `reference_backend.pdf_root` | 默认建议 `<literature_root>/papers` |
| citation key 规则 | `reference_backend.citation_key.pattern` | 默认 `author_year_shorttitle` |
| 是否写入 file 字段 | `reference_backend.write_file_field` | 默认 `true`，便于 JabRef 打开 PDF |
| 是否写入前备份 | `reference_backend.safety.create_backup_before_write` | 默认 `true` |

备选接口模板：

- `extra/reference-managers/jabref/bibtex-backend.example.json`

完整规范：

- `extra/reference-managers/jabref/bibtex-jabref-standard.md`

推荐默认目录：

```text
<literature_root>/
  papers/
  references/
    references.bib
    backups/
```

AI 应直接更新 `.bib` 文件，不要求用户安装或启动 JabRef。用户如使用 JabRef，可在流程完成后用 JabRef 打开 `references.bib` 进行人工检查。该配置只应作为 `extra/` 扩展方案使用，不写入主 `config/` 目录。

### 2.5 AI 工具类型

用户需要说明自己准备用哪个 AI 工具执行流程：

| 用户选择 | 需要使用的模板 / 文档 | 还需确认 |
| --- | --- | --- |
| TRAE Work | `docs/trae-work-setup.md`、`config/trae-mcp.example.json` | 项目级 skills 位置、MCP 配置位置、自动化任务方式 |
| WorkBuddy | `docs/workbuddy-setup.md`、`config/workbuddy-mcp.example.json` | 用户级 skills 位置、`mcp.json` 位置、连接器信任状态 |
| Codex | `docs/codex-skill-automation-setup.md`、`config/codex-automation.example.toml` | Codex-owned skills 路径、自动化 TOML 路径、固定 runner 路径 |
| 其他 AI 代理 | `docs/setup.md`、`automation/README.md` | 是否支持本地命令、MCP、环境变量和定时任务 |

## 3. 配置写入位置

| 配置内容 | 推荐写入位置 |
| --- | --- |
| API 凭证 | 本机 `.env`、系统环境变量或 shell profile |
| 文献流程路径、AI 解析出的 IMA 知识库 ID 和笔记 ID | `skills/ima-skill/harness/workflow_config.json` |
| TRAE Work MCP | TRAE Work 期望的项目级 MCP 配置位置 |
| WorkBuddy MCP | `~/.workbuddy/mcp.json` |
| Codex automation | Codex 本机 automation 配置目录 |
| 自动化 prompt | AI 工具的自动化任务配置中 |
| 正式 runner | 用户本机选择的自动化脚本位置 |

## 4. 配置前置检查

在执行任何真实写入前，AI 应确认：

1. 用户已明确临时存放区和归档目录。
2. 用户已提供 IMA 凭证和知识库名称，AI 已解析并写入知识库 ID。
3. 用户已提供 IMA 文章索引笔记名称，AI 已解析并写入笔记 ID；或用户明确暂不追加索引笔记。
4. 用户已提供 Zotero API key 和 user ID。
5. Zotero Desktop 已启动，或用户明确只使用 Zotero Web API。
6. 自动化 prompt 中没有完整凭证。

## 5. 检查命令

离线检查：

```powershell
node scripts/doctor.cjs
node --check scripts/doctor.cjs
node --check automation/runners/run-literature-organizer.example.cjs
```

Zotero MCP / 本地脚本检查：

```powershell
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
python integrations/zotero-mcp/scripts/zotero.py status --json
```

IMA live 预检：

```powershell
node skills/ima-skill/harness/preflight.cjs
node skills/ima-skill/harness/preflight.cjs --list-kb
```

只有在真实凭证、真实 `workflow_config.json` 和 Zotero Desktop 都准备好之后，才运行会写入 IMA、Zotero 或本地归档目录的流程。

## 6. 用户收集表

AI 可以把下列表格发给用户填写。用户只需提供名称和路径；IMA ID 由 AI 查询后写入配置。

| 项目 | 用户填写 |
| --- | --- |
| 仓库根目录 `<repo>` |  |
| 文献工作区根目录 `<literature_root>` |  |
| 临时存放区 `<intake_dir>` |  |
| 推荐文献归档目录 `<recommended_archive_dir>` |  |
| 自行查找文献归档目录 `<self_collected_archive_dir>` |  |
| 自动化日志目录 `<logs_dir>` |  |
| IMA 默认知识库名称 |  |
| IMA 知识库名称列表 |  |
| IMA 文章索引笔记名称 |  |
| Zotero User ID |  |
| Zotero API key 是否已在本机设置 | 是 / 否 |
| IMA API key 是否已在本机设置 | 是 / 否 |
| 使用的 AI 工具 | TRAE Work / WorkBuddy / Codex / 其他 |
| 是否需要定时自动化 | 是 / 否 |

## 7. 配置后隐私检查

完成配置后可以扫描工作区，确认没有把真实路径或凭证写入公开说明、prompt 模板或日志：

```powershell
$patterns = @(
  '[A-Z]:[/\\][^\s`"]+',
  ('ZOTERO_' + 'API_KEY=[A-Za-z0-9]{24}'),
  ('IMA_OPENAPI_' + 'APIKEY=[A-Za-z0-9]{20,}')
) -join '|'

rg -n -i $patterns README.md AGENTS.md docs config automation integrations scripts skills -g "!skills/ima-skill/harness/workflow_config.json" -g "!.git/**"
```

如果命中真实路径或凭证，先改成占位符；如果命中的是本机私有 `skills/ima-skill/harness/workflow_config.json`，只需确认它不是公开说明或 prompt 模板的一部分。
