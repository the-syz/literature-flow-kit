---
name: zotero
description: 当流程需要 Zotero 本地状态、Zotero Web API key 检查、BibTeX 导出、DOI/标题查重，或为已归档文献创建/更新 index-only Zotero 条目时使用。触发词包括 Zotero、参考文献、citation library、BibTeX、DOI 去重、标签、collection、归档文献同步。
---

# Zotero 组件

本 skill 是文献整理流程中的 Zotero 组件。

## 配置

- 凭证来自环境变量，或来自按 `config/env.example` 准备的本地私有 `.env`。
- 必填变量：`ZOTERO_API_KEY`、`ZOTERO_USER_ID`。
- 可选变量：`ZOTERO_API_BASE_URL`、`ZOTERO_LOCAL_BASE_URL`、`ZOTERO_SYNC_MODE`。
- 不要提交 `.env`，不要打印完整 API key。

## MCP

随仓库提供的 MCP 服务位于：

```text
integrations/zotero-mcp/mcp/zotero_mcp_server.py
```

离线 smoke test：

```powershell
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
```

## 规则

- Zotero 只作为索引库，不上传或附加 PDF。
- 含中文、日文等非 ASCII 元数据时，优先串行写入，避免并发批量写。
- 去重优先级：DOI、`extra` 中的 SHA256、标准化标题加年份。
- 写入前必须运行 `skills/literature-organizer/harness/zotero_guard.cjs`，拒绝明显乱码或缺字段数据。
- 写入后必须验证条目没有 PDF/file attachment 子条目。

## 预期工具

- `zotero_web_key_info`：验证 Web API 身份和权限。
- `zotero_local_status`：检查本地 Zotero Desktop API。
- `zotero_local_search`：搜索本地条目。
- `zotero_local_tags`：列出本地标签。
- `zotero_local_collections`：列出本地 collection。
- `zotero_local_export_bibtex`：导出 BibTeX。
- `zotero_web_get_or_create_collection`：解析或创建 collection path。
- `zotero_web_create_or_update_index_item`：创建或更新 index-only 文献条目。

## 输出要求

Zotero 写入后报告：

- created、updated 或 skipped 状态；
- 使用的去重依据；
- Zotero item key；
- 标签和 collection path；
- 缺失 DOI、IMA 待上传或校验失败等警告。
