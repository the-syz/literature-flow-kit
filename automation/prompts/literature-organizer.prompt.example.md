# 文献整理自动化 Prompt 模板

请执行 `literature-organizer` 完整文献整理流程。

## 输入和配置

- 仓库路径：`<repo>`
- 临时存放区：`<intake_dir>`
- 归档目录：`<archive_dir>`
- 日志目录：`<logs_dir>`
- workflow 配置：`<workflow_config_path>`
- Python 解释器：`<python_absolute_path>`

凭证读取规则：

- IMA 凭证从 `IMA_OPENAPI_CLIENTID` 和 `IMA_OPENAPI_APIKEY` 读取。
- Zotero 凭证从 `ZOTERO_API_KEY` 和 `ZOTERO_USER_ID` 读取。
- 不要在报告、日志或对话中打印完整凭证。

## 执行步骤

1. 读取 `AGENTS.md`、`README.md` 和 `skills/literature-organizer/SKILL.md`。
2. 扫描临时存放区中的新 PDF 文件。
3. 对每篇文献提取标题、年份、DOI、作者、摘要和关键词。
4. 生成 3-8 个内容标签和 50-500 字中文摘要。
5. 运行 `content_check.cjs` 校验标签和摘要质量。
6. 运行 `dedup_guard.cjs` 做 SHA256、IMA 和 Zotero 去重检查。
7. 运行 `next_archive_no.cjs` 计算归档编号。
8. 将通过检查的 PDF 归档到目标目录。
9. 运行 `zotero_guard.cjs` 检查 Zotero index-only 条目字段。
10. 上传到 IMA 目标知识库，并追加文章索引笔记。
11. 写入或更新 Zotero index-only 条目，不附加 PDF。
12. 运行末尾验证，确认本地归档、IMA、Zotero 和索引信息一致。
13. 生成 Markdown 报告和结构化 records JSON。

## Zotero 策略

- 首选本机可用的稳定方式写入 Zotero。
- 如果使用 Zotero MCP，优先调用 `zotero_web_*` 写入 index-only 条目。
- 如果 `zotero_local_*` 可用，可用于本地状态查询和辅助验收。
- 如果 Zotero 写入失败，不要删除本地归档；在报告中标记为 `pending` 或 `failed`。

## 输出要求

报告必须包含：

- 处理文件数、成功数、跳过数和失败数；
- 每篇文献的归档编号、标题、SHA256 前 8 位；
- IMA 上传状态、Zotero 写入状态；
- 跳过或失败原因；
- 日志路径和 records JSON 路径。

不要输出完整 API key、真实知识库 ID、真实笔记 ID 或其他私密配置。
