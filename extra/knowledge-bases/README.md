# AI 知识库扩展

本目录用于存放 IMA 之外的知识库后端连接方案。

当前预留平台：

- `notebooklm/`：Google NotebookLM 相关 MCP、CLI、skill 和测试记录。
- `notion/`：Notion 官方或第三方 MCP、数据库 schema、页面映射和测试记录。
- `obsidian/`：Obsidian vault、REST API/MCP、Markdown 模板和测试记录。

每个平台测试通过前，不建议把配置直接并入主流程。主流程应继续通过 `knowledge_backend` 抽象调用这些扩展。
