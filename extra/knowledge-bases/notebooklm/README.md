# NotebookLM 扩展说明

本目录提供 Google NotebookLM 的 AI 知识库接入方案。推荐将 NotebookLM 分成两层使用：

1. **上传层 MCP**：优先使用 `jacob-bd/notebooklm-mcp-cli`，负责创建 notebook、上传 URL/text/file/Drive source、同步 Drive source、删除 source、批量操作和跨 notebook 查询。
2. **轻量查询层 MCP**：可选使用 `PleasePrompto/notebooklm-mcp`，负责连接已有 NotebookLM notebook、提问、读取 DOM 级 citation、生成 audio overview，以及维护本地 notebook 链接目录。

本项目不复制这两个外部仓库源码，只提供安装、配置和 AI 使用流程说明。用户在本机配置好 MCP 后，AI agent 再按本目录的 `SKILL.md` 执行上传、同步、检索和带来源问答。

## 方案定位

### 推荐组合

```text
本地资料归档/整理
  -> 上传层：jacob-bd/notebooklm-mcp-cli
  -> NotebookLM notebook + sources
  -> 查询层：PleasePrompto/notebooklm-mcp 或 jacob-bd notebook_query
  -> 带来源回答、报告、笔记、论文草稿
```

### 什么时候用上传层

使用 `jacob-bd/notebooklm-mcp-cli`：

- 需要创建新的 NotebookLM notebook。
- 需要把本地 PDF、TXT、MD、DOCX、CSV、EPUB、音频、视频、图片等文件加入 notebook。
- 需要添加 URL、文本、Google Drive 文档。
- 需要删除、同步、批量导入 source。
- 需要批量 notebook 操作、跨 notebook 查询或生成 NotebookLM studio artifact。

### 什么时候用轻量查询层

使用 `PleasePrompto/notebooklm-mcp`：

- 用户已经在 NotebookLM 里建好 notebook。
- 主要需求是对指定 notebook 提问。
- 需要从 NotebookLM 页面读取 citation / source provenance。
- 只需要添加 URL 或 text source。
- 不想启用上传层那组较多工具时，使用更轻的查询 MCP。

## 外部仓库

### 上传层：jacob-bd/notebooklm-mcp-cli

仓库：

```text
https://github.com/jacob-bd/notebooklm-mcp-cli
```

特点：

- 一个包同时提供 CLI `nlm` 和 MCP server `notebooklm-mcp`。
- 支持 NotebookLM 的 notebook、source、query、studio、download、research、batch、cross-notebook、tag、pipeline 等能力。
- `source_add` 支持 `url`、`text`、`file`、`drive` 四类 source。
- 使用 NotebookLM 内部 API，需要从浏览器提取 Google 登录 cookie。
- 提供 `nlm setup add ...` 自动配置多种 AI 客户端。
- MIT License。

注意：

- 这是社区项目，不是 Google 官方 NotebookLM API。
- 内部 API 可能随 NotebookLM 页面或后端变化而失效。
- 建议只用于用户本人授权的 NotebookLM 账号和非敏感/可接受风险的资料。

### 查询层：PleasePrompto/notebooklm-mcp

仓库：

```text
https://github.com/PleasePrompto/notebooklm-mcp
```

特点：

- Node.js MCP server，通过 Patchright 驱动真实 Chrome。
- 支持 stdio 和 Streamable-HTTP transport。
- 适合对已有 notebook 提问，并抽取 NotebookLM 页面 citation。
- 支持本地 notebook library：`add_notebook`、`list_notebooks`、`select_notebook`、`search_notebooks` 等。
- `add_source` 支持 `type=url` 和 `type=text`。
- 不支持本地文件上传作为主要能力。
- MIT License。

注意：

- 首次认证需要打开可见 Chrome 登录 Google。
- 本地 notebook library 只是 MCP 自己维护的链接目录，不等于创建或删除 NotebookLM 端的真实 notebook。
- `remove_notebook` 只移除本地记录，不删除 NotebookLM notebook。

## 上传层安装和配置

### 安装

推荐使用 `uv`：

```powershell
uv tool install notebooklm-mcp-cli
```

也可以使用 `uvx` 临时运行：

```powershell
uvx --from notebooklm-mcp-cli nlm --help
uvx --from notebooklm-mcp-cli notebooklm-mcp
```

或者使用 `pip` / `pipx`：

```powershell
pip install notebooklm-mcp-cli
pipx install notebooklm-mcp-cli
```

安装后应得到两个命令：

```text
nlm
notebooklm-mcp
```

### 登录

首次使用前执行：

```powershell
nlm login
```

常用认证命令：

```powershell
nlm login --check
nlm login --profile work
nlm login --profile personal
nlm login switch
nlm login profile list
```

多 Google 账号建议使用不同 profile。认证失效时重新运行：

```powershell
nlm login
```

### Codex / MCP 配置

优先使用自动配置：

```powershell
nlm setup add codex
```

如果客户端不在内置列表中，生成通用 JSON：

```powershell
nlm setup add json
```

手工配置示例：

```json
{
  "mcpServers": {
    "notebooklm-upload": {
      "command": "notebooklm-mcp",
      "args": []
    }
  }
}
```

如果使用 `uvx` 而不是全局安装：

```json
{
  "mcpServers": {
    "notebooklm-upload": {
      "command": "uvx",
      "args": [
        "--from",
        "notebooklm-mcp-cli",
        "notebooklm-mcp"
      ]
    }
  }
}
```

### 上传层常用工具

Notebook：

- `notebook_list`：列出 notebook。
- `notebook_create`：创建 notebook。
- `notebook_get`：读取 notebook 详情和 sources。
- `notebook_describe`：获取 AI 摘要和主题建议。
- `notebook_rename`：重命名 notebook。
- `notebook_delete`：删除 notebook，需要 `confirm=True`。

Source：

- `source_add`：统一添加 URL、text、file、Drive source。
- `source_list_drive`：列出 source 和 Drive freshness 状态。
- `source_sync_drive`：同步 stale Drive source。
- `source_delete`：删除 source，需要 `confirm=True`。
- `source_describe`：获取 source 摘要和关键词。
- `source_get_content`：读取 source 原文内容。

查询和生成：

- `notebook_query`：对 notebook 提问，查询会保留在 NotebookLM Web UI 聊天历史中。
- `chat_configure`：设置 chat 目标和回答长度。
- `cross_notebook_query`：跨 notebook 查询。
- `studio_create`、`studio_status`、`download_artifact`：生成和下载 NotebookLM studio 内容。

### source_add 参数模式

URL：

```python
source_add(
    notebook_id="...",
    source_type="url",
    url="https://example.com/article",
    wait=True,
    wait_timeout=120.0
)
```

文本：

```python
source_add(
    notebook_id="...",
    source_type="text",
    title="Meeting notes",
    text="...",
    wait=True
)
```

本地文件：

```python
source_add(
    notebook_id="...",
    source_type="file",
    file_path="C:/path/to/paper.pdf",
    wait=True,
    wait_timeout=120.0
)
```

Google Drive：

```python
source_add(
    notebook_id="...",
    source_type="drive",
    document_id="...",
    doc_type="pdf",
    wait=True
)
```

## 查询层安装和配置

### 安装

推荐直接使用 `npx`：

```powershell
npx notebooklm-mcp@latest
```

从源码安装：

```powershell
git clone https://github.com/PleasePrompto/notebooklm-mcp
cd notebooklm-mcp
npm install
npm run build
node dist/index.js
```

要求：

- Node.js 18 或更高。
- 推荐本机安装 Chrome。
- Windows / macOS / Linux 可用；WSL 需要 WSL2 + WSLg。

### Codex / MCP 配置

Codex CLI：

```powershell
codex mcp add notebooklm-query npx notebooklm-mcp@latest
```

手工配置：

```json
{
  "mcpServers": {
    "notebooklm-query": {
      "command": "npx",
      "args": [
        "notebooklm-mcp@latest"
      ]
    }
  }
}
```

本地源码构建：

```json
{
  "mcpServers": {
    "notebooklm-query": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/notebooklm-mcp/dist/index.js"
      ]
    }
  }
}
```

### 认证

第一次使用时调用：

```text
setup_auth
```

该工具会打开可见 Chrome，用户登录 Google 账号后，后续运行复用持久 Chrome profile。

切换账号或认证损坏时：

```text
re_auth
```

多账号可以用启动参数或环境变量：

```powershell
npx notebooklm-mcp@latest --account work
npx notebooklm-mcp@latest --account personal
```

### 查询层常用工具

Q&A：

- `ask_question`：对 notebook 提问，支持 session reuse、citation extraction 和 `source_format`。

Sources / Studio：

- `add_source`：添加 URL 或 text source。
- `generate_audio`：生成 Audio Overview。
- `download_audio`：下载最近的 Audio Overview。

Library：

- `add_notebook`：把 NotebookLM share URL 加入本地 library，需要用户确认。
- `list_notebooks`：列出本地 library 中的 notebook。
- `get_notebook`：读取本地 notebook 记录。
- `select_notebook`：设置默认 notebook。
- `update_notebook`：更新本地 notebook 元数据。
- `remove_notebook`：从本地 library 移除，不删除 NotebookLM notebook。
- `search_notebooks`：按名称、说明、主题、标签检索。

Sessions：

- `list_sessions`：列出活动 browser sessions。
- `close_session`：关闭指定 session。
- `reset_session`：重置聊天历史但保留同一 session。

## 推荐协作流程

### 新建知识库并上传资料

```text
notebook_list
  -> notebook_create
  -> source_add(source_type=file/url/text/drive, wait=True)
  -> notebook_get
  -> notebook_query 或 ask_question
```

### 向已有 NotebookLM 提问

```text
list_notebooks / search_notebooks
  -> select_notebook
  -> ask_question(source_format=json/footnotes)
  -> 整理答案并保留 sources
```

### 本地文献归档后上传

```text
本地文献整理流程完成 PDF 去重、命名、归档
  -> source_add(source_type=file, file_path=归档 PDF, wait=True)
  -> notebook_get 检查 source 数量
  -> notebook_query / ask_question 验证可回答
```

## 安全与限制

- 两个方案都不是 Google 官方 NotebookLM API。
- 上传和查询都依赖用户本机 Google 登录状态。
- 不要默认上传敏感、涉密或无权处理的资料。
- 远程 HTTP transport 不应暴露到不可信网络。
- 删除 notebook 或 source 必须要求显式确认。
- 若同时配置两个 NotebookLM MCP，请使用不同 server 名称，例如 `notebooklm-upload` 和 `notebooklm-query`，避免工具名混淆。

## 许可

- `jacob-bd/notebooklm-mcp-cli`：MIT License。
- `PleasePrompto/notebooklm-mcp`：MIT License。

本项目只引用外部仓库作为用户本机独立安装的 MCP，不复制其源码。若后续复制或修改外部源码，应保留原始版权与许可声明。
