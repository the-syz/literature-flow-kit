# Obsidian 扩展说明

本目录采用 `coddingtonbear/obsidian-local-rest-api` 作为 Obsidian 的推荐接入方案。该方案是 Obsidian 社区插件，提供本地 REST API，并内置 MCP server，适合让 AI agent 在用户本机授权范围内读取、搜索、创建和更新 Obsidian vault 中的 Markdown 笔记。

官方仓库：

```text
https://github.com/coddingtonbear/obsidian-local-rest-api
```

插件文档：

```text
https://coddingtonbear.github.io/obsidian-local-rest-api/
```

本项目不推荐直接控制 Obsidian GUI，也不默认采用其他第三方 Obsidian MCP。只有用户明确要求使用 Obsidian vault、Markdown 笔记、daily notes、frontmatter、标签或本地知识库时，AI agent 才读取本目录。

## 能力边界

适合：

- 搜索和读取 Obsidian vault 中的 Markdown 笔记。
- 创建、追加、修改和删除笔记。
- 读取 active file。
- 管理 folders、tags、frontmatter 和 backlinks。
- 将文献整理结果、知识库摘要、项目日志、研究笔记写入 Obsidian。
- 在本地 vault 内执行 AI 辅助检索和整理。

不适合：

- 远程公开暴露 Obsidian vault。
- 绕过 Obsidian 插件授权直接访问用户私有资料。
- 需要云端多人实时协作的数据库场景。
- 大规模附件上传和媒体管理；附件可通过 vault 文件系统归档，但应单独验证路径。

## 推荐架构

```text
Obsidian Desktop
  -> Local REST API 插件
  -> 本地 REST / MCP endpoint
  -> AI client
  -> 读取、搜索、创建、更新 vault 中的 Markdown
```

默认推荐只配置一个 MCP：

```text
obsidian-local
```

## 安装

在 Obsidian 中安装插件：

1. 打开 Obsidian。
2. 进入 `Settings -> Community plugins`。
3. 搜索并安装 `Local REST API`。
4. 启用插件。
5. 在插件设置中生成或查看 API key。

如果需要手动安装，可参考仓库发布页：

```text
https://github.com/coddingtonbear/obsidian-local-rest-api/releases
```

## 端点与认证

默认 HTTPS REST API：

```text
https://127.0.0.1:27124/
```

默认 HTTPS MCP endpoint：

```text
https://127.0.0.1:27124/mcp/
```

如用户启用非 TLS HTTP endpoint，通常为：

```text
http://127.0.0.1:27123/
http://127.0.0.1:27123/mcp/
```

认证方式：

```text
Authorization: Bearer <OBSIDIAN_LOCAL_REST_API_KEY>
```

不要把 API key 写入公开仓库。用户应在本机 MCP 配置或私有环境变量中保存 key。

## MCP 配置示例

如果客户端支持 remote HTTP MCP，并允许配置 headers，可使用 HTTPS MCP endpoint：

```json
{
  "mcpServers": {
    "obsidian-local": {
      "url": "https://127.0.0.1:27124/mcp/",
      "headers": {
        "Authorization": "Bearer <OBSIDIAN_LOCAL_REST_API_KEY>"
      }
    }
  }
}
```

如果使用 HTTP endpoint：

```json
{
  "mcpServers": {
    "obsidian-local": {
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": {
        "Authorization": "Bearer <OBSIDIAN_LOCAL_REST_API_KEY>"
      }
    }
  }
}
```

如客户端不支持 HTTP MCP，可使用支持 HTTP-to-stdio bridge 的本地工具；配置时仍应只连接 `127.0.0.1`，不要暴露到公网。

## 推荐工作流

### 读取和搜索 vault

```text
确认 Obsidian 已打开且插件启用
  -> 搜索关键词、tag、路径或 frontmatter
  -> 读取候选笔记
  -> 汇总答案并保留 note path / heading / block reference
```

适合：

- 搜索研究笔记。
- 查询项目日志。
- 从多篇笔记生成总结。
- 找到某个主题的相关 backlinks。

### 创建笔记

```text
确认目标 folder 和文件名
  -> 检查同名笔记是否存在
  -> 写入 frontmatter 和正文
  -> 重新读取笔记验证
```

建议：

- 文件名使用可读标题，避免特殊字符。
- frontmatter 写入 `tags`、`created`、`updated`、`source`、`status` 等字段。
- 文献笔记应保留 DOI、PDF 路径、citation key 或来源 URL。

### 更新笔记

```text
读取目标笔记
  -> 定位 heading、block 或 frontmatter 字段
  -> 追加/替换/patch
  -> 重新读取验证
```

更新规则：

- 优先追加到明确 heading 下。
- 精确修改时先读取原文，避免覆盖用户已有内容。
- 不要重写整篇笔记，除非用户明确要求。
- frontmatter 修改必须保留未知字段。

### 删除和移动

```text
读取目标路径
  -> 确认标题和路径
  -> 用户明确确认
  -> 删除/移动
  -> 检查原路径和新路径
```

删除笔记或附件前必须确认。优先移动到归档目录，不默认硬删除。

## 文献笔记建议结构

```markdown
---
title: Paper title
authors:
  - Author One
year: 2026
doi: 10.xxxx/example
tags:
  - literature
  - paper
citation_key: author_2026_example
pdf: ../papers/example.pdf
status: unread
---

# Paper title

## 摘要

## 关键结论

## 方法

## 数据与图表

## 我的笔记

## 相关链接
```

## frontmatter 约定

推荐字段：

- `title`
- `authors`
- `year`
- `doi`
- `url`
- `tags`
- `citation_key`
- `pdf`
- `status`
- `created`
- `updated`
- `source`

AI 更新 frontmatter 时应保留用户已有字段，不要清空未知字段。

## 安全要求

- 默认只访问用户指定 vault。
- 不要把 API key、vault 私有路径或敏感笔记内容写入公开模板。
- 不要连接非 localhost 的 Obsidian endpoint，除非用户明确配置并确认风险。
- 删除、移动、覆盖整篇笔记前必须确认。
- 写入后必须重新读取验证。
- 输出时保留 note path、heading 或 block reference，方便用户追溯。

## 与其他知识库的关系

- Obsidian 方案适合本地 Markdown vault、个人知识管理、Git 管理笔记和离线工作流。
- Notion 方案适合团队协作、数据库、任务和在线页面。
- NotebookLM 方案适合对已上传资料做问答和带来源总结。

当用户只说“写到我的 Obsidian / vault / Markdown 知识库”时，优先使用本方案。
