# 配置到 WorkBuddy

本指南说明如何将本仓库的文献整理流程配置到 WorkBuddy 中，包括 Skills 安装、MCP 配置、自动化任务设置和 Zotero 操作策略。适用于人类操作者和 AI 代理阅读。

> 本文档基于实际配置经验编写，包含了已验证的配置步骤和已知陷阱。

---

## 目录

- [前置条件](#前置条件)
- [1. 克隆仓库](#1-克隆仓库)
- [2. 配置环境变量](#2-配置环境变量)
- [3. 配置 workflow_config.json](#3-配置-workflow_configjson)
- [4. 安装 Skills 到 WorkBuddy](#4-安装-skills-到-workbuddy)
- [5. 配置 Zotero MCP Server](#5-配置-zotero-mcp-server)
- [6. 信任 MCP 连接器](#6-信任-mcp-连接器)
- [7. 验证配置](#7-验证配置)
- [8. 创建自动化任务](#8-创建自动化任务)
- [9. Zotero 操作策略](#9-zotero-操作策略)
- [10. Windows 环境注意事项](#10-windows-环境注意事项)
- [11. AI 代理快速接入](#11-ai-代理快速接入)
- [12. 常见问题](#12-常见问题)
- [附录 A：完整 mcp.json 模板](#附录-a完整-mcpjson-模板)
- [附录 B：自动化 Prompt 模板](#附录-b自动化-prompt-模板)

---

## 前置条件

| 条目 | 要求 |
|------|------|
| WorkBuddy | 桌面版，已登录 |
| Python | 3.8+（WorkBuddy managed runtime 优先） |
| Node.js | 18+ |
| Zotero Desktop | 运行中（如需使用 `zotero_local_*` 工具） |
| Zotero Web API | 已获取 API Key 和 User ID |
| IMA OpenAPI | 已获取 Client ID 和 API Key |
| IMA MCP 连接器 | 已在 WorkBuddy 中连接（连接器管理页面显示 connected） |

> **关于 IMA**：WorkBuddy 内置 IMA MCP 连接器，提供知识库搜索、列表、获取内容等读取能力。本仓库的 `vendor/ima-skill` 提供额外的上传 PDF、COS 签名、写入笔记等写入能力。两者互补，不重复。

---

## 1. 克隆仓库

将仓库克隆到本机固定位置，例如：

```powershell
git clone <repo-url> <repo>
```

后续所有配置中的 `<repo>` 均替换为该绝对路径。

---

## 2. 配置环境变量

### 2.1 设置系统环境变量

将以下变量配置为系统环境变量（通过 Windows 系统设置 > 环境变量，或 PowerShell `$env:` 设置）：

```ini
# IMA OpenAPI 凭证
IMA_OPENAPI_CLIENTID=你的_client_id
IMA_OPENAPI_APIKEY=你的_api_key

# Zotero Web API 凭证
ZOTERO_API_KEY=replace_with_zotero_api_key
ZOTERO_USER_ID=replace_with_zotero_user_id
ZOTERO_API_BASE_URL=https://api.zotero.org
ZOTERO_LOCAL_BASE_URL=http://127.0.0.1:23119
ZOTERO_SYNC_MODE=index-only
```

### 2.2 ZOTERO_HELPER_SCRIPT（可选）

`ZOTERO_HELPER_SCRIPT` 指向本地辅助脚本，用于 `zotero_local_*` 工具（本地搜索、BibTeX 导出等）。本仓库已提供 `integrations/zotero-mcp/scripts/zotero.py`，配置后可启用本地 Zotero Desktop 查询能力；不配置时主流程仍可使用 `zotero_web_*` 工具。

配置方式为：

```ini
ZOTERO_HELPER_SCRIPT=<repo>/integrations/zotero-mcp/scripts/zotero.py
```

### 2.3 验证环境变量

在终端中执行：

```bash
echo $ZOTERO_API_KEY    # 应显示你的 API Key
echo $ZOTERO_USER_ID    # 应显示你的 User ID
echo $IMA_OPENAPI_CLIENTID  # 应显示你的 Client ID
```

> **注意**：WorkBuddy 自动化执行时继承系统环境变量。如果环境变量在 WorkBuddy 启动后才设置，需要重启 WorkBuddy。

---

## 3. 配置 workflow_config.json

### 3.1 复制模板

```powershell
Copy-Item config/workflow_config.example.json skills/ima-skill/harness/workflow_config.json
```

### 3.2 填写字段

编辑 `skills/ima-skill/harness/workflow_config.json`，替换以下占位内容：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| `paths.intake_dir` | 临时存放区路径 | `<intake_dir>` |
| `paths.recommended_archive_dir` | 推荐文献归档目录 | `<recommended_archive_dir>` |
| `paths.self_collected_archive_dir` | 自行查找文献归档目录 | `<self_collected_archive_dir>` |
| `archive_numbering.archive_dir` | 编号扫描目录（通常等于 self_collected） | 同上 |
| `ima_note_index.note_id` | 文章索引笔记 ID | 用户提供笔记名称，AI 查询后填写 |
| `knowledge_base_mapping` | 知识库名称到 ID 的映射 | 用户提供知识库名称，AI 查询后填写 |
| `default_knowledge_base` | 默认知识库名称 | 如 `深度学习` |
| `logging.log_dir` | 日志目录 | `<logs_dir>` |

### 3.3 关键路径区分

本流程涉及多个目录，必须明确区分：

```
临时存放区（intake_dir）        → 新下载的 PDF 先放这里，整理后文件移出
    ↓
归档目录（self_collected_archive_dir） → 整理完成后文件存这里，按编号命名
    ↓
日志目录（log_dir）             → harness 脚本运行日志
    ↓
自动化报告目录                   → 每次自动化执行的整理报告（Markdown）
```

### 3.4 修改 global_ima_skill_dir

**这是从其他 IDE 迁移时的关键步骤。** 模板中默认值为相对路径 `vendor/ima-skill`，如果安装到 WorkBuddy 时 vendor 包也复制到了 `~/.workbuddy/skills/`，需改为绝对路径：

```json
"global_ima_skill_dir": "<workbuddy_home>/skills/vendor/ima-skill"
```

> `workflow_config.json` 是本机私有配置。用户只需提供 IMA 知识库名称和文章索引笔记名称，AI 查询后写入对应 ID。

---

## 4. 安装 Skills 到 WorkBuddy

### 4.1 Skills 层级选择

WorkBuddy Skills 有两个安装位置：

| 层级 | 路径 | 适用场景 |
|------|------|---------|
| 用户级 | `~/.workbuddy/skills/` | 跨项目通用流程（推荐） |
| 项目级 | `{workspace}/.workbuddy/skills/` | 仅当前项目/团队共享 |

文献整理是跨项目的通用流程，建议安装到用户级。

### 4.2 复制 Skills

从仓库复制 3 个 skill 目录和 vendor 包：

```powershell
# 源目录
$repo = "<repo>"
$dest = "$env:USERPROFILE\.workbuddy\skills"

# 创建目标目录
New-Item -ItemType Directory -Force -Path $dest
New-Item -ItemType Directory -Force -Path "$dest\vendor"

# 复制 3 个 skills
Copy-Item -Recurse "$repo\skills\literature-organizer" "$dest\literature-organizer"
Copy-Item -Recurse "$repo\skills\ima-skill" "$dest\ima-skill"
Copy-Item -Recurse "$repo\skills\zotero" "$dest\zotero"

# 复制 vendor 包（IMA API 直接调用，提供上传/写入能力）
Copy-Item -Recurse "$repo\vendor\ima-skill" "$dest\vendor\ima-skill"
```

### 4.3 验证安装

检查所有 SKILL.md 文件存在：

```powershell
Get-ChildItem -Path $dest -Filter "SKILL.md" -Recurse | Select-Object FullName
```

预期输出包含以下 6 个文件：

```
~/.workbuddy/skills/literature-organizer/SKILL.md
~/.workbuddy/skills/ima-skill/SKILL.md
~/.workbuddy/skills/zotero/SKILL.md
~/.workbuddy/skills/vendor/ima-skill/SKILL.md
~/.workbuddy/skills/vendor/ima-skill/knowledge-base/SKILL.md  （如果存在）
~/.workbuddy/skills/vendor/ima-skill/notes/SKILL.md            （如果存在）
```

### 4.4 创建日志目录

```powershell
New-Item -ItemType Directory -Force -Path "$dest\ima-skill\harness\logs"
```

---

## 5. 配置 Zotero MCP Server

### 5.1 ⚠️ 关键：MCP 配置文件区分

WorkBuddy 有两个 MCP 配置文件，用途完全不同：

| 文件 | 用途 | 能否手动修改 |
|------|------|-------------|
| `~/.workbuddy/mcp.json`（无点前缀） | **用户自定义 MCP 服务器**，出现在连接器管理页面 | ✅ 这是用户该写的文件 |
| `~/.workbuddy/.mcp.json`（有点前缀） | **系统托管聚合代理**，包装 ima-mcp 等内置连接器 | ❌ 不要手动修改 |

> **已知陷阱**：如果将自定义 MCP 写入 `.mcp.json`，该 MCP 不会出现在连接器管理页面，用户无法看到也无法信任。

### 5.2 创建 mcp.json

编辑 `~/.workbuddy/mcp.json`（如果不存在则创建）。建议从仓库模板复制：

```text
config/workbuddy-mcp.example.json
```

再替换 `<repo>`、`<python_absolute_path>` 和 Zotero 凭证占位符。模板内容如下：

```json
{
  "mcpServers": {
    "zotero": {
      "command": "<python_absolute_path>",
      "args": [
        "<repo>/integrations/zotero-mcp/mcp/zotero_mcp_server.py"
      ],
      "env": {
        "ZOTERO_API_KEY": "replace_with_zotero_api_key",
        "ZOTERO_USER_ID": "replace_with_zotero_user_id",
        "ZOTERO_API_BASE_URL": "https://api.zotero.org",
        "ZOTERO_LOCAL_BASE_URL": "http://127.0.0.1:23119",
        "ZOTERO_SYNC_MODE": "index-only",
        "ZOTERO_HELPER_SCRIPT": "<repo>/integrations/zotero-mcp/scripts/zotero.py"
      },
      "disabled": false
    }
  }
}
```

### 5.3 关于 command 路径

`command` 必须使用 Python 的绝对路径。WorkBuddy managed runtime 优先：

```json
"command": "<python_absolute_path>"
```

不要使用 bare `python`，因为自动化执行时的 PATH 可能不包含 Python。

### 5.4 关于 ZOTERO_HELPER_SCRIPT

不配置 `ZOTERO_HELPER_SCRIPT` 的效果：

| 工具类别 | 依赖该脚本？ | 不配置时的影响 |
|----------|-------------|---------------|
| `zotero_web_*`（7个） | 否 | 无影响，正常可用 |
| `zotero_local_*`（5个） | 是 | 工具返回错误提示，但不崩溃 |

主流程（步骤 9）使用 `zotero_web_create_or_update_index_item`，属于 `zotero_web_*` 类别，不依赖该脚本。

### 5.5 MCP 工具说明

配置完成后，Zotero MCP 提供 12 个工具，工具名以 `mcp__zotero__` 为前缀：

| 类别 | 工具数 | 依赖 | 说明 |
|------|--------|------|------|
| `zotero_web_*` | 7 | `ZOTERO_API_KEY` + `ZOTERO_USER_ID` | 直接调用 Zotero Web API |
| `zotero_local_*` | 5 | `ZOTERO_HELPER_SCRIPT` + Zotero Desktop | 通过本地 API 查询 |

完整工具列表见 [附录 A](#附录-a完整-mcpjson-模板)。

---

## 6. 信任 MCP 连接器

配置 `mcp.json` 后，MCP 不会自动激活，需要手动信任：

1. 打开 WorkBuddy，进入 **连接器管理页面**（右上角）
2. 在列表中找到 `zotero`
3. 点击 **"信任"** 按钮激活
4. 激活后，工具列表中会出现 `mcp__zotero__` 前缀的工具

> 如果列表中没有出现 `zotero`，尝试刷新页面或重启 WorkBuddy。仍不出现则检查 `mcp.json` 是否写在了正确位置（无点前缀的那个）。

---

## 7. 验证配置

### 7.1 离线检查

```powershell
node <repo>/scripts/doctor.cjs
```

该脚本检查文件完整性、JSON 合法性和 `.gitignore` 规则，不调用外部 API。

### 7.2 IMA MCP 连通性

在 WorkBuddy 对话中测试 IMA MCP 是否可用：

```
帮我搜索一下 IMA 知识库中关于"传热"的内容
```

如果 IMA MCP 已连接，AI 会返回搜索结果。

### 7.3 IMA OpenAPI 凭证预检

```powershell
node <repo>/skills/ima-skill/harness/preflight.cjs
```

### 7.4 Zotero Web API 连通性

在终端中测试：

```bash
curl -s -H "Zotero-API-Key: <zotero_api_key>" "https://api.zotero.org/users/<zotero_user_id>/items?limit=1"
```

如果返回 JSON 数据，说明 API Key 有效。

### 7.5 Zotero 本地 API 连通性

确保 Zotero Desktop 运行中，然后测试：

```bash
curl -s "http://127.0.0.1:23119/api/users/0/items?limit=1"
```

### 7.6 完整流程验证

在 WorkBuddy 对话中放一篇测试 PDF 到临时存放区，手动触发一次文献整理流程，确认端到端可用。

---

## 8. 创建自动化任务

### 8.1 ⚠️ 关键：connectorIds 限制

WorkBuddy 自动化的 `connectorIds` 字段只能指定**托管连接器** ID（如 `"ima-mcp"`），**不能**放自定义 MCP server 名称（如 `"zotero"`）。

- 托管连接器通过 `connectorIds` 在自动化执行时激活
- 自定义 MCP server 靠 WorkBuddy 正常加载机制提供，不通过 `connectorIds` 激活
- 在 prompt 中明确工具前缀（如 `mcp__zotero__`）让 AI 知道调用方式

### 8.2 创建方式

在 WorkBuddy 对话中描述需求，AI 会创建自动化任务。也可以通过 WorkBuddy 的自动化管理界面手动创建。

关键配置项：

| 配置项 | 建议值 |
|--------|--------|
| 名称 | 每日文献整理 |
| 频率 | 每天 1 次 |
| 运行时间 | 04:00（或其他你偏好的时间） |
| 工作目录 | 文献根目录，例如 `<literature_root>` |
| connectorIds | `["ima-mcp"]`（只放托管连接器） |

### 8.3 自动化 Prompt 设计原则

自动化 prompt 是每次执行时发送给 AI 的完整指令，必须遵循以下原则：

1. **自包含**：所有路径、凭证、方法写在 prompt 里，不依赖运行时上下文
2. **方法优先级**：外部 API 不稳定时，写明首选方案和备选方案
3. **输出格式**：明确指定文件格式（`.md` 而非 `.html`）和保存路径
4. **路径区分**：多个相似路径要明确标注用途

完整的 prompt 模板见 `automation/prompts/literature-organizer.prompt.example.md`；附录 B 保留为 WorkBuddy 场景下的扩展版本。

### 8.4 日志目录

自动化执行前需创建日志目录：

```powershell
New-Item -ItemType Directory -Force -Path <logs_dir>
```

每次自动化执行时，整理报告保存为 `<logs_dir>/文献整理报告_YYYYMMDD.md`。

### 8.5 触发频率建议

| 场景 | 频率 | 说明 |
|------|------|------|
| 日常文献跟踪 | 每天 1 次（如 04:00） | 适合每天有新文献下载的用户 |
| 周期性整理 | 每周 1 次 | 适合每周集中下载文献的用户 |
| 按需触发 | 手动运行 | 适合不定期下载文献的用户 |

---

## 9. Zotero 操作策略

### 9.1 已知问题：MCP 连接器不稳定

Zotero MCP server 内部使用 `urllib` 访问 `api.zotero.org`，在 Windows 上存在间歇性 SSL 握手超时。WorkBuddy 连接器管理层在超时后会杀掉 MCP 进程，导致后续工具调用报 "Connector unavailable after recovery"。

### 9.2 双轨方案（推荐）

在自动化 prompt 中采用双轨策略：

**方法 A（首选）：Python 直接调用 Zotero Web REST API**

```
- 用 `<python_absolute_path>` 执行
- Python 代码使用 urllib.request（不依赖第三方库）
- 带 SSL 超时重试机制（最多 3 次，每次 30 秒超时）
- json.dumps 时使用 ensure_ascii=True，避免 Windows 编码问题
```

操作步骤：
1. 用 DOI 搜索是否已存在条目（`GET /users/{uid}/items?q=DOI`）
2. 如不存在，用标题搜索（`GET /users/{uid}/items?q=title`）
3. 解析集合路径（如 `文献索引/自己找的文献`），如不存在则逐级创建
4. 获取 journalArticle 模板（`GET /items/new?itemType=journalArticle`）
5. 组装条目数据
6. 已存在则 PUT 更新（带 `If-Unmodified-Since-Version`），不存在则 POST 创建
7. 验证创建结果

**方法 B（备选）：使用 mcp__zotero__ MCP 工具**

当方法 A 的 Python 环境不可用或 SSL 连接持续失败时，尝试使用 MCP 工具。如果 MCP 工具也不可用，记录错误原因并在报告中标注该步骤为"失败需手动处理"。

### 9.3 Zotero 条目数据规范

| 字段 | 内容 |
|------|------|
| `itemType` | `journalArticle` |
| `title` | 论文完整标题 |
| `date` | 出版年份 |
| `DOI` | DOI（如有） |
| `publicationTitle` | 期刊名称 |
| `abstractNote` | 中文摘要（50-500字） |
| `creators` | 作者列表（author 类型） |
| `tags` | 3-8 个内容标签 + `index-only` + `IMA:uploaded:XXXKB` |
| `collections` | 目标集合 key |
| `extra` | 见下方格式 |

`extra` 字段格式（每行一个键值对）：

```
Local-Path: <archive_path>/240-论文标题.pdf
SHA256: 495a29e7dfb85d88...
Archive-Index: 240
IMA-Status: uploaded:深度学习KB
Managed-By: literature-workflow
```

集合路径：`文献索引 > 自己找的文献`（需逐级创建）。

---

## 10. Windows 环境注意事项

### 10.1 中文编码问题

| 场景 | 问题 | 解决方案 |
|------|------|---------|
| curl `-d` 传 UTF-8 中文 | 中文变乱码 | `json.dumps(ensure_ascii=True)` 转为 `\uXXXX` 纯 ASCII |
| Python 输出到终端 | 中文显示乱码 | 设置 `PYTHONIOENCODING=utf-8` 或写入文件而非打印 |
| JSON 文件中的中文 | 正常存储 | UTF-8 编码，无问题 |

### 10.2 SSL 超时问题

Python `urllib.request` 在 Windows 上访问 `api.zotero.org` 时可能出现 SSL 握手超时。解决方案：

```python
import ssl, urllib.request

def fetch_with_retry(url, retries=3, timeout=30):
    for i in range(retries):
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, headers={'Zotero-API-Key': API_KEY})
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.read()
        except Exception as e:
            if i == retries - 1:
                raise
            continue
```

### 10.3 路径分隔符

JSON 文件中使用正斜杠 `/` 或双反斜杠 `\\`，不要使用单反斜杠 `\`：

```json
"command": "<python_absolute_path>"
```

---

## 11. AI 代理快速接入

如果你是 AI 代理（WorkBuddy 对话中或通过自动化触发），按以下步骤操作：

```text
1. 读取 skills/literature-organizer/SKILL.md 了解完整流程
2. 确认环境变量已设置（ZOTERO_API_KEY, ZOTERO_USER_ID, IMA_OPENAPI_CLIENTID, IMA_OPENAPI_APIKEY）
3. 确认 workflow_config.json 已创建并填写（路径：~/.workbuddy/skills/ima-skill/harness/workflow_config.json）
4. 运行 node <repo>/scripts/doctor.cjs 确认仓库完整性
5. 按 SKILL.md 的流程执行文献整理
6. Zotero 操作优先用 Python 直接调 REST API（方法A），MCP 工具作为备选（方法B）
7. 不得绕过 harness 约束脚本（content_check, dedup_guard, zotero_guard, verify_workflow）
8. 报告保存为 Markdown 到 `<logs_dir>/文献整理报告_YYYYMMDD.md`
```

---

## 12. 常见问题

### Skills 未被 AI 自动调用

- 确认 `~/.workbuddy/skills/` 目录下存在 `SKILL.md` 文件
- 确认 SKILL.md 的 YAML frontmatter 中 `description` 字段准确描述了触发场景
- 在对话中手动提及 skill 名称强制调用

### MCP 列表为空 / Zotero MCP 不出现

- **最常见原因**：写错了配置文件。确认写入的是 `~/.workbuddy/mcp.json`（无点前缀），不是 `.mcp.json`
- 检查 JSON 格式是否正确（正斜杠路径、无多余逗号）
- 刷新 WorkBuddy 或重启后检查

### MCP 工具报 "Connector unavailable after recovery"

- 原因：MCP server 进程因 SSL 超时被 WorkBuddy 连接器管理层杀死
- 临时解决：重启 WorkBuddy 让 MCP server 重新启动
- 根本解决：在自动化 prompt 中使用 Python 直连方案（方法A），不依赖 MCP

### 自动化执行时 Zotero 步骤失败

- 检查 `connectorIds` 中是否误放了 `"zotero"`（应只放 `["ima-mcp"]`）
- 检查 prompt 中是否包含了 Python 直连方案的完整指令
- 检查环境变量 `ZOTERO_API_KEY` 和 `ZOTERO_USER_ID` 是否在系统级别设置

### 自动化报告格式不正确

- 在 prompt 中明确指定"保存为 Markdown 格式（.md），不要保存为 HTML"
- 明确指定保存路径：`<logs_dir>/文献整理报告_YYYYMMDD.md`

### 临时存放区和归档目录搞混

- 在 prompt 中明确区分两个路径的用途：
  - 临时存放区 = 扫描来源（文件从这里读取）
  - 归档目录 = 最终存储（文件移到这里）
- 在 prompt 中用表格形式列出路径对照

### IMA 上传失败

- 确认 `IMA_OPENAPI_CLIENTID` 和 `IMA_OPENAPI_APIKEY` 已设置为系统环境变量
- 运行 `node skills/ima-skill/harness/preflight.cjs` 确认 IMA 连通
- 确认用户提供的知识库名称可解析，且 `workflow_config.json` 中 `knowledge_base_mapping` 的 ID 正确

---

## 附录 A：完整 mcp.json 模板

```json
{
  "mcpServers": {
    "zotero": {
      "command": "<python_absolute_path>",
      "args": [
        "<repo>/integrations/zotero-mcp/mcp/zotero_mcp_server.py"
      ],
      "env": {
        "ZOTERO_API_KEY": "replace_with_zotero_api_key",
        "ZOTERO_USER_ID": "replace_with_zotero_user_id",
        "ZOTERO_API_BASE_URL": "https://api.zotero.org",
        "ZOTERO_LOCAL_BASE_URL": "http://127.0.0.1:23119",
        "ZOTERO_SYNC_MODE": "index-only"
      },
      "disabled": false
    }
  }
}
```

> **注意**：
> - 文件位置：`~/.workbuddy/mcp.json`（无点前缀）
> - `command` 用 managed Python 绝对路径
> - 如需使用 `zotero_local_*` 工具，设置 `ZOTERO_HELPER_SCRIPT=<repo>/integrations/zotero-mcp/scripts/zotero.py`
> - 写入后需在连接器管理页面手动"信任"

Zotero MCP 提供的工具（前缀 `mcp__zotero__`）：

| 工具名 | 类别 | 说明 |
|--------|------|------|
| `zotero_web_key_info` | web | 验证 API Key 和用户信息 |
| `zotero_web_find_items_by_doi` | web | 按 DOI 搜索条目 |
| `zotero_web_find_items_by_title` | web | 按标题搜索条目 |
| `zotero_web_create_or_update_index_item` | web | 创建或更新 index-only 条目 |
| `zotero_web_get_or_create_collection` | web | 获取或创建集合 |
| `zotero_web_list_collections` | web | 列出所有集合 |
| `zotero_web_key_info` | web | API Key 信息 |
| `zotero_local_status` | local | Zotero Desktop 运行状态 |
| `zotero_local_search` | local | 本地搜索条目 |
| `zotero_local_tags` | local | 列出本地标签 |
| `zotero_local_collections` | local | 列出本地集合 |
| `zotero_local_export_bibtex` | local | 导出 BibTeX |

---

## 附录 B：自动化 Prompt 模板

以下是从实际配置中提取的自动化 prompt 模板，可直接使用或按需修改：

```text
执行 literature-organizer 完整文献整理流程：

1. 扫描临时存放区（<intake_dir>）中的新 PDF 文件
2. 对每个新文献提取元数据（标题、年份、DOI）
3. 根据内容生成标签（3-8个）和摘要（50-500字）
4. 运行 content_check.cjs 预检脚本校验标签和摘要质量
5. 运行 dedup_guard.cjs 去重检查（本地SHA256 + IMA标题匹配）
6. 为文献分配归档编号（max_plus_one规则），归档目录为 <archive_dir>
7. 将文献从临时存放区归档到归档目录，按编号命名（如 001-论文标题.pdf）
8. 运行 zotero_guard.cjs 预检

9. 在 Zotero 中创建或更新索引条目。Zotero 操作方法如下（按优先级尝试）：

   方法A（首选）：直接用 Python 调用 Zotero Web REST API
   - API Key 和 User ID 从私有环境变量读取，不要写入公开文档或报告
   - Base URL: https://api.zotero.org
   - 用 <python路径> 执行
   - Python 代码必须使用 urllib.request（不依赖第三方库），带 SSL 超时重试机制（最多3次，每次30秒超时）
   - json.dumps 时必须使用 ensure_ascii=True，避免 Windows curl 乱码问题
   - 操作步骤：
     a) 先用 DOI 搜索是否已存在条目
     b) 如不存在再用标题搜索
     c) 解析集合路径 "文献索引/自己找的文献"，如不存在则逐级创建
     d) 获取 journalArticle 模板
     e) 组装条目数据：title, date, DOI, publicationTitle, abstractNote, creators, tags, collections, extra
     f) 已存在则 PUT 更新，不存在则 POST 创建
     g) 验证创建结果

   方法B（备选）：使用 mcp__zotero__ 前缀的 MCP 工具
   - 如果方法A不可用或 SSL 连接持续失败，尝试使用 MCP 工具
   - 如果 MCP 工具也不可用，记录错误原因并在报告中标注该步骤为"失败需手动处理"

10. 通过 IMA vendor 包上传 PDF 到对应知识库，根据内容自动路由
11. 在 IMA 知识库的文章索引笔记中追加条目
12. 运行验证步骤：本地归档、IMA一致性、Zotero完整性、标签质量、摘要质量、无重复、索引纯度、IMA-Zotero链接
13. 将整理报告保存为 Markdown 文件，保存到 <日志目录>/文献整理报告_YYYYMMDD.md（用当天日期替换）

关键路径区分：
- 临时存放区（扫描来源）：<intake_dir> — 新下载的文献先放这里
- 归档目录（最终存储）：<archive_dir> — 整理完成后的文献存这里
- 日志目录（报告保存）：<日志目录> — 每次整理报告保存到这里

注意：
- workflow_config.json 在 <config路径>
- IMA 知识库操作同时使用 MCP（搜索/读取）和 vendor 包（上传/写入）
- Zotero 操作优先用 Python 直接调 REST API（方法A），MCP 工具作为备选（方法B）
- 报告必须保存为 Markdown 格式（.md），不要保存为 HTML
- Zotero 条目的 extra 字段必须包含：Local-Path, SHA256, Archive-Index, IMA-Status, Managed-By: literature-workflow
- Zotero 条目的 tags 必须包含 "index-only" 标签和 "IMA:uploaded:XXXKB" 标签
- Zotero 条目必须归入集合 "文献索引 > 自己找的文献"
```

> **使用说明**：将 `<intake_dir>`、`<archive_dir>`、`<logs_dir>`、`<config_path>`、`<python_absolute_path>` 等路径占位符替换为实际值。Zotero 和 IMA 凭证只放在本机私有配置或环境变量中，不写入公开 prompt 模板。

---

## 参考链接

- [WorkBuddy 官方文档](https://www.codebuddy.cn/docs/workbuddy/Overview)
- [TRAE Work 配置指南](./trae-work-setup.md)（本仓库的 TRAE Work 版本配置文档）
- [文献整理流程](./workflow.md)
- [本地配置](./setup.md)
