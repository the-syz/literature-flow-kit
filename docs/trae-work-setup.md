# 配置到 TRAE Work（原 TraeSolo）

本指南说明如何将本仓库的文献整理流程配置到 TRAE Work 中，包括 Skills 安装、MCP 配置和自动化任务设置。适用于人类操作者和 AI 代理阅读。

> **命名说明**：TRAE Work 是 TraeSolo 的当前官方名称。仓库中部分历史文本仍使用 "TraeSolo"，含义相同。

---

## 前置条件

| 条目 | 要求 |
|------|------|
| TRAE Work | 桌面版（本地任务需要），已登录 |
| Python | 3.8+，已加入系统 PATH |
| Node.js | 18+，已加入系统 PATH |
| Zotero Desktop | 运行中（如需使用 `zotero_local_*` 工具） |
| Zotero Web API | 已获取 API Key 和 User ID |
| IMA OpenAPI | 已获取 Client ID 和 API Key |

---

## 1. 克隆仓库

将仓库克隆到本机固定位置，例如：

```powershell
git clone <repo-url> <repo>
```

后续所有配置中的 `<repo>` 均替换为该绝对路径。

---

## 2. 配置环境变量

### 2.1 创建 .env 文件

复制 `config/env.example` 到仓库根目录，命名为 `.env`：

```powershell
Copy-Item config/env.example .env
```

### 2.2 填写凭证

编辑 `.env`，替换所有 `replace_with_*` 和 `<repo>` 占位符：

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

# Zotero 本地辅助脚本（指向仓库内的 zotero.py）
ZOTERO_HELPER_SCRIPT=<repo>/integrations/zotero-mcp/scripts/zotero.py
```

> `.env` 是本机私有配置。不要在对话、日志或公开说明中打印完整凭证。

### 2.3 配置 workflow_config.json

复制模板并填写本机路径：

```powershell
Copy-Item config/workflow_config.example.json skills/ima-skill/harness/workflow_config.json
```

需要替换的关键字段：

| 字段 | 说明 |
|------|------|
| `paths.intake_dir` | 临时存放区路径（待处理 PDF 所在目录） |
| `paths.recommended_archive_dir` | 推荐文献归档目录 |
| `paths.self_collected_archive_dir` | 自行查找文献归档目录 |
| `archive_numbering.archive_dir` | 编号扫描目录（通常等于 self_collected_archive_dir） |
| `ima_note_index.note_name` | 用户提供的文章索引笔记名称 |
| `ima_note_index.note_id` | AI 根据文章索引笔记名称查询后填写 |
| `knowledge_base_mapping` | AI 根据用户提供的知识库名称查询后填写名称到 ID 的映射 |
| `default_knowledge_base` | 默认知识库名称 |
| `logging.log_dir` | 日志目录 |

> `workflow_config.json` 已被 `.gitignore` 忽略。

---

## 3. 安装 Skills 到 TRAE Work

TRAE Work 的项目级 Skills 放在项目根目录的 `.trae/skills/` 下。本仓库的 Skills 定义在 `skills/` 目录中，需要通过符号链接或复制使其对 TRAE Work 可见。

### 方式一：符号链接（推荐）

符号链接的好处是仓库更新后自动生效，无需重复复制。

```powershell
# 在仓库根目录下创建 .trae/skills/ 目录
New-Item -ItemType Directory -Force -Path .trae\skills

# 为三个 skill 创建符号链接
New-Item -ItemType SymbolicLink -Path .trae\skills\literature-organizer -Target "$PWD\skills\literature-organizer"
New-Item -ItemType SymbolicLink -Path .trae\skills\ima-skill -Target "$PWD\skills\ima-skill"
New-Item -ItemType SymbolicLink -Path .trae\skills\zotero -Target "$PWD\skills\zotero"
```

> 符号链接需要管理员权限或开启开发者模式。

### 方式二：直接复制

如果不便使用符号链接，可直接复制：

```powershell
New-Item -ItemType Directory -Force -Path .trae\skills
Copy-Item -Recurse skills\literature-organizer .trae\skills\
Copy-Item -Recurse skills\ima-skill .trae\skills\
Copy-Item -Recurse skills\zotero .trae\skills\
```

> 复制方式在仓库更新后需要重新执行。

### 方式三：上传至 TRAE Work 技能管理中心

TRAE Work 支持通过界面导入技能：

1. 将 `skills/literature-organizer` 打包为 zip（根级必须包含 `SKILL.md`）
2. 在 TRAE Work 左栏点击 **技能** 图标
3. 点击 **上传技能**，选择 zip 文件
4. 对 `skills/ima-skill` 和 `skills/zotero` 重复上述步骤

> 上传方式安装的技能为全局技能，在所有项目中生效。项目技能（方式一/二）仅当前项目生效。

### 验证 Skills 已加载

在 TRAE Work 对话框中输入 `/`，检查技能列表中是否出现 `literature-organizer`、`ima-skill` 和 `zotero`。

---

## 4. 配置 Zotero MCP Server

### 4.1 通过 TRAE Work 界面配置

1. 点击左下角 **头像** > **设置**
2. 左侧导航栏选择 **MCP**
3. （桌面版）选择运行环境为 **本地**
4. 点击右上角 **创建** > **手动配置**
5. 填入以下 JSON 配置：

```json
{
  "mcpServers": {
    "zotero": {
      "command": "python",
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
      }
    }
  }
}
```

> 路径中的反斜杠在 JSON 中需使用正斜杠 `/` 或双反斜杠 `\\`。

### 4.2 使用 ${workspaceFolder} 变量（可选）

如果仓库已作为 TRAE Work 项目打开，可使用 `${workspaceFolder}` 变量避免硬编码路径：

```json
{
  "mcpServers": {
    "zotero": {
      "command": "python",
      "args": [
        "${workspaceFolder}/integrations/zotero-mcp/mcp/zotero_mcp_server.py"
      ],
      "env": {
        "ZOTERO_API_KEY": "replace_with_zotero_api_key",
        "ZOTERO_USER_ID": "replace_with_zotero_user_id",
        "ZOTERO_API_BASE_URL": "https://api.zotero.org",
        "ZOTERO_LOCAL_BASE_URL": "http://127.0.0.1:23119",
        "ZOTERO_SYNC_MODE": "index-only",
        "ZOTERO_HELPER_SCRIPT": "${workspaceFolder}/integrations/zotero-mcp/scripts/zotero.py"
      }
    }
  }
}
```

> `${workspaceFolder}` 在 MCP 启动时自动替换为项目根目录的实际路径。

### 4.3 MCP 工具说明

配置完成后，Zotero MCP 提供 12 个工具：

| 类别 | 工具数 | 依赖 | 说明 |
|------|--------|------|------|
| `zotero_web_*` | 7 | `ZOTERO_API_KEY` + `ZOTERO_USER_ID` | 直接调用 Zotero Web API，用于创建/更新/搜索条目 |
| `zotero_local_*` | 5 | `ZOTERO_HELPER_SCRIPT` + Zotero Desktop 运行 | 通过本地 API 查询 Zotero Desktop 客户端 |

主流程（步骤 11）使用 `zotero_web_create_or_update_index_item` 写入 index-only 条目，属于 `zotero_web_*` 类别。`zotero_local_*` 为辅助查询工具，非必需。

---

## 5. 验证配置

### 5.1 离线检查

```powershell
node scripts/doctor.cjs
```

该脚本检查文件完整性、JSON 合法性和 `.gitignore` 规则，不调用外部 API。

### 5.2 MCP 连通性检查

```powershell
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
```

### 5.3 Zotero 本地辅助脚本检查

```powershell
python integrations/zotero-mcp/scripts/zotero.py status --json
```

预期输出 `"status": "running"`。如果返回 `not_running`，确认 Zotero Desktop 已启动。

### 5.4 IMA 凭证预检

```powershell
node skills/ima-skill/harness/preflight.cjs
```

该脚本验证 IMA OpenAPI 凭证可用性和知识库列表。

---

## 6. 配置自动化任务

TRAE Work 内置自动化功能，可按固定时间或间隔触发文献整理流程。以下提供两种方式。

### 方式一：通过 TRAE Work 界面创建

1. 点击左栏顶部 **自动化** 图标
2. 选择创建方式：
   - **手动新建**：填写任务名称、触发时间、任务内容
   - **在对话中创建**：用自然语言描述任务，AI 辅助配置
   - **从模板创建**：选择预设模板修改
3. 关键配置项：

| 配置项 | 建议值 |
|--------|--------|
| 运行模式 | Work 模式 |
| 运行环境 | 本地（桌面版） |
| 触发方式 | 间隔触发（如每天一次）或固定时间 |
| 输出存储 | 项目内目录或指定文件夹 |

### 日志文件夹

自动化任务运行前，需提前创建一个独立的日志文件夹，用于存放每次执行的运行日志：

```powershell
New-Item -ItemType Directory -Force -Path <logs_dir>
```

每次自动化执行时，AI 应将运行日志写入该目录，文件名格式为 `auto_YYYYMMDD_HHmmss.log`（如 `auto_20260701_210000.log`）。日志内容应包括：

- 每篇论文的处理阶段和结果
- harness 脚本的输出（content_check、dedup_guard、verify_workflow 等）
- 跳过或失败的文件及原因
- 最终汇总信息

> 该日志文件夹独立于 `workflow_config.json` 中的 `logging.log_dir`（后者由 harness 脚本内部使用）。自动化日志面向人类阅读，用于追踪每次定时执行的完整过程。

### 方式二：在对话中创建

在 TRAE Work 对话框中直接描述需求，例如：

```
我想要创建一个自动化任务。
任务内容是：扫描临时存放区 <intake_dir> 中的 PDF 文件，使用 literature-organizer 技能整理到本地归档目录、IMA 知识库和 Zotero 索引。整理完成后在对话中报告每篇论文的处理结果，并将完整运行日志写入 <logs_dir> 目录。
执行时间是：每天 21:00
```

AI 会解读需求并创建自动化任务。

### 自动化任务的 Prompt 模板

无论手动还是对话创建，任务内容（即每次执行时发送给 AI 的 prompt）应包含以下要素：

```text
请使用 literature-organizer 技能整理临时存放区中的论文。

仓库路径：<repo 绝对路径>
临时存放区：<intake_dir 路径>
日志文件夹：<logs_dir>

执行步骤：
1. 扫描临时存放区的 PDF 文件
2. 对每个文件执行 literature-organizer SKILL.md 中定义的 12 步流程
3. 每篇论文处理完成后，报告：编号、标题、SHA256 前 8 位、IMA 状态、Zotero key
4. 如果 dedup_guard 报告重复，跳过该文件并在报告中标注"重复跳过"
5. 如果 content_check 失败，重新阅读并生成标签/摘要，最多重试 2 次
6. 全部处理完成后输出汇总表
7. 将本次执行的完整日志写入日志文件夹，文件名格式为 auto_YYYYMMDD_HHmmss.log，内容包括每篇论文的处理阶段、harness 输出、跳过/失败原因和最终汇总
```

### 触发频率建议

| 场景 | 频率 | 说明 |
|------|------|------|
| 日常文献跟踪 | 每天 1 次（如 21:00） | 适合每天有新文献下载的用户 |
| 周期性整理 | 每周 1 次（如周五 18:00） | 适合每周集中下载文献的用户 |
| 按需触发 | 手动运行 | 适合不定期下载文献的用户 |

> 自动化任务创建后，运行模式、运行环境和输出位置不可修改。如需调整，需删除后重建。

---

## 7. AI 代理快速接入

如果你是 AI 代理（Codex、TRAE CLI 等），按以下步骤操作：

```text
1. 读取 AGENTS.md 和 skills/literature-organizer/SKILL.md
2. 确认 config/env.example 中的环境变量已在本机设置
3. 确认 skills/ima-skill/harness/workflow_config.json 已创建并填写
4. 运行 node scripts/doctor.cjs 确认仓库完整性
5. 运行 node skills/ima-skill/harness/preflight.cjs 确认 IMA 连通
6. 按 SKILL.md 的 12 步流程执行文献整理
7. 不得绕过 harness 约束脚本
```

---

## 8. 常见问题

### Skills 未被 AI 自动调用

- 确认 `.trae/skills/` 目录下存在 `SKILL.md` 文件
- 确认 SKILL.md 的 YAML frontmatter 中 `description` 字段准确描述了触发场景
- 在对话中手动输入 `/literature-organizer` 强制调用

### MCP Server 启动失败

- 检查 `python` 命令是否在系统 PATH 中：`python --version`
- 检查 `zotero_mcp_server.py` 路径是否正确
- 检查 JSON 中路径分隔符使用正斜杠 `/` 或双反斜杠 `\\`
- 查看 TRAE Work 的 MCP Server 日志：设置 > MCP > 点击日志图标

### `zotero_local_*` 工具返回 helper script not configured

- 确认 `ZOTERO_HELPER_SCRIPT` 环境变量指向 `zotero.py` 的绝对路径
- 确认 Zotero Desktop 正在运行
- 运行 `python <repo>/integrations/zotero-mcp/scripts/zotero.py status --json` 验证

### 自动化任务执行失败

- 确认运行环境为本地（桌面版），云端环境无法访问本地文件
- 确认临时存放区路径与 `workflow_config.json` 中一致
- 确认日志文件夹 `<logs_dir>` 已创建
- 检查 Zotero Desktop 和 IMA 服务是否可用
- 在自动化面板的 **执行历史** 中查看失败详情
- 在日志文件夹中查看对应时间的 `auto_*.log` 文件获取详细处理记录

### IMA 上传失败

- 确认 `IMA_OPENAPI_CLIENTID` 和 `IMA_OPENAPI_APIKEY` 已设置
- 运行 `node skills/ima-skill/harness/preflight.cjs --list-kb` 确认知识库可访问
- 确认目标知识库已在 IMA 客户端中创建

---

## 参考链接

- [TRAE Work 官方文档](https://docs.trae.cn/)
- [TRAE Work 技能文档](https://docs.trae.cn/solo_skills)
- [TRAE Work MCP 配置文档](https://docs.trae.cn/solo_remote-mcp-server)
- [TRAE Work 自动化文档](https://docs.trae.cn/solo_automated-tasks)
- [TRAE Work 快速开始](https://docs.trae.cn/solo_trae-solo-quickstart)
