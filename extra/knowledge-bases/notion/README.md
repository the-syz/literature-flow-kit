# Notion 扩展说明

本目录只采用 Notion 官方方案实现 Notion 知识库接入：默认使用 **Notion 官方 hosted MCP**，也就是远程 MCP 服务：

```text
https://mcp.notion.com/mcp
```

官方文档入口：

```text
https://developers.notion.com/guides/mcp/overview
```

本项目不推荐第三方 Notion MCP，也不把 Notion 接入并入主文献整理流程。只有用户明确要求使用 Notion 作为知识库、任务库、项目库或资料库时，AI agent 才读取本目录。

## 能力边界

Notion 官方 MCP 适合：

- 搜索 Notion workspace 和已连接来源。
- 读取 page、database、data source 和 view。
- 创建页面、更新页面内容和属性。
- 创建或更新 database / data source / view。
- 查询 data source、database view 和 meeting notes。
- 添加或读取 comments。
- 获取 users、teams 和 async task 状态。
- 生成项目文档、PRD、会议纪要、任务更新、报告和知识库页面。

Notion 官方 MCP 不适合：

- 完全无人值守的 headless 自动化，因为官方 hosted MCP 使用用户 OAuth，不支持 bearer token。
- 直接上传本地图片、PDF 或文件，因为 Notion MCP 当前不支持 image/file uploads。
- 需要长期稳定 token 的 CI/CD 或服务器后台任务。

如果必须上传文件，应使用 Notion 官方 File Upload API 或 Notion CLI 的 `ntn files` 工作流，而不是假设 MCP 能直接上传文件。

## 推荐架构

```text
用户授权 Notion 官方 MCP
  -> AI 搜索/读取 Notion
  -> AI 创建或更新页面、数据库、任务和报告
  -> 如需文件：Notion CLI/API 上传文件
  -> MCP 更新页面或数据库中对应的文件引用/说明
```

默认只配置一个 MCP：

```text
notion-official
```

不要同时混入第三方 Notion MCP，避免工具行为和权限模型不一致。

## 官方 MCP 配置

### Streamable HTTP

多数支持远程 MCP 的客户端可以使用：

```json
{
  "mcpServers": {
    "notion-official": {
      "url": "https://mcp.notion.com/mcp"
    }
  }
}
```

### SSE 兼容模式

旧客户端如只支持 SSE，可使用：

```json
{
  "mcpServers": {
    "notion-official": {
      "url": "https://mcp.notion.com/sse"
    }
  }
}
```

### stdio bridge

如果客户端不支持远程 HTTP MCP，可使用 `mcp-remote`：

```json
{
  "mcpServers": {
    "notion-official": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.notion.com/mcp"
      ]
    }
  }
}
```

### 从 Notion App 连接

也可以在 Notion App 中连接：

```text
Settings -> Connections -> Notion MCP -> choose AI tool -> OAuth
```

## 授权方式

Notion 官方 MCP 使用 OAuth。用户需要在客户端或 Notion App 中完成授权流程。

授权检查建议：

1. 连接 MCP 后先调用身份或 workspace 读取能力，例如 fetch `self`。
2. 确认 workspace 名称、用户身份和权限范围。
3. 搜索或读取目标页面前，确认用户已授权该 workspace。
4. 如果认证异常，先断开连接或清除认证，再重新走 OAuth。

不要在公开配置中保存 Notion token。官方 hosted MCP 默认不需要用户在本项目中填写 token。

## 常用官方 MCP 工具

工具名称在不同 MCP 客户端中可能略有变化；在部分 OpenAI 客户端里，`notion-fetch` 和 `notion-search` 可能显示为 `fetch` 和 `search`。

### 搜索与读取

- `notion-search`：搜索 Notion workspace 和已连接来源。
- `notion-fetch`：按 URL 或 ID 读取 page、database、data source、workspace/user identity。

### 页面写入

- `notion-create-pages`：创建一个或多个页面，支持 content、properties、icon、cover、template。
- `notion-update-page`：更新页面属性、内容、icon、cover，也可替换较大 Markdown 内容。
- `notion-move-pages`：移动页面或 database 到新父级。
- `notion-duplicate-page`：复制页面，异步执行。

### 数据库和视图

- `notion-create-database`：创建 database、初始 data source 和初始 view。
- `notion-update-data-source`：更新 data source 属性、名称、描述等。
- `notion-create-view`：创建 table、board、list、calendar、timeline、gallery、form、chart、map、dashboard view。
- `notion-update-view`：更新 view 的名称、筛选、排序和展示配置。
- `notion-query-data-sources`：查询一个或多个 data source。
- `notion-query-database-view`：按既有 database view 查询数据。

### 评论、用户和任务状态

- `notion-create-comment`：添加页面级、区块级或回复评论。
- `notion-get-comments`：读取页面上的评论和讨论。
- `notion-get-users`：获取 workspace 用户或当前用户。
- `notion-get-teams`：获取 teams / teamspaces。
- `notion-get-async-task`：轮询异步任务状态。

## 推荐工作流

### 查询知识库

```text
notion-fetch self
  -> notion-search
  -> notion-fetch page/database/data source
  -> 汇总答案并保留 page id / URL / source title
```

适合：

- 搜索已有笔记。
- 回答“知识库里有没有某内容”。
- 从多个 Notion 页面整理报告。
- 读取项目、任务、会议纪要、研究笔记。

### 创建知识库页面

```text
确认父页面或 database
  -> notion-fetch 确认结构/模板
  -> notion-create-pages
  -> notion-fetch 验证新页面
```

建议：

- 内容较长时使用 async create。
- 创建到 database 前先读取 schema。
- 使用用户已有模板时先 fetch database 获取可用 templates。

### 更新页面

```text
notion-fetch 目标页面
  -> 明确更新位置和更新方式
  -> notion-update-page
  -> notion-fetch 验证结果
```

更新方式建议：

- 小段补充：追加或插入内容。
- 大段重写：明确 `replace_content` 风险。
- 属性修改：只改用户明确要求的字段。

### 管理数据库

```text
notion-fetch database/data source
  -> 检查 schema
  -> notion-create-pages 或 notion-update-data-source
  -> notion-query-data-sources / notion-query-database-view 验证
```

适合：

- 文献索引数据库。
- 项目任务数据库。
- 实验记录数据库。
- 资料清单和状态跟踪。

## 文件上传方案

Notion 官方 MCP 当前不直接支持 image/file uploads。需要上传 PDF、图片或其他文件时，采用官方 File Upload API 或 Notion CLI：

### 本地文件上传

```powershell
ntn files create < ./paper.pdf
```

脚本化获取 upload id：

```powershell
$FILE_UPLOAD_ID = ntn files create --plain < ./paper.pdf
```

### 从 URL 导入文件

```powershell
ntn files create --plain --external-url https://example.com/paper.pdf --filename paper.pdf
```

### 附加到页面

文件上传后，需要把 `file_upload` id 附加到页面 block、page icon、page cover 或 database files property。可用 Notion API / CLI 完成，然后用 MCP 更新页面文字说明或数据库属性。

注意：

- File Upload 状态必须是 `uploaded` 后才能 attach。
- 未及时 attach 的 upload 可能过期。
- MCP 中不要承诺已经上传文件，除非实际完成 File Upload API / CLI 流程并验证。

## 不采用本地开源 MCP 的原因

Notion 仍提供开源 `notion-mcp-server` 作为特殊场景备选，但官方文档说明该包不再积极维护。它只适合必须 bearer token 认证、复用已有 Notion connection、使用原 JSON v1 API 或自行管理基础设施的高级场景。

本项目默认不使用它。统一采用官方 hosted MCP，减少维护成本和权限差异。

## 安全要求

- 所有写入前先确认目标 page/database/data source。
- 不要把 Notion OAuth、token 或 workspace 私有信息写入公开模板。
- 执行删除、移动、覆盖、大段替换前必须明确说明影响范围。
- 对长内容创建或更新，优先使用 async 并轮询任务状态。
- 遇到 rate limit 时减少并行搜索或写入，等待后重试。
- 对外输出时保留 Notion page URL 或 page id，便于追溯。

## 许可与来源

本目录采用 Notion 官方 hosted MCP 和 Notion 官方 API/CLI 文档，不复制第三方 MCP 源码。

相关官方入口：

```text
https://developers.notion.com/guides/mcp/overview
https://developers.notion.com/guides/mcp/get-started-with-mcp
https://developers.notion.com/guides/mcp/mcp-supported-tools
https://developers.notion.com/cli/guides/file-uploads
```
