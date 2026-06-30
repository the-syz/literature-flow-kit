# 文献整理流程

完整流程把论文从临时存放区推进到四个稳定状态：

1. 临时存放区完成扫描和筛选；
2. 本地归档目录完成稳定编号、文件名和 SHA256 记录；
3. IMA 知识库完成文件上传，并可选追加到文章索引笔记；
4. Zotero 创建或更新 index-only 索引条目。

## 临时存放区

代理从 `workflow_config.json` 的 `paths.intake_dir` 扫描文件。应跳过未下载完成的文件、不支持的文件类型，以及已经在状态记录中出现过的文件。

## 元数据和阅读

优先从 PDF 文本提取标题、作者、年份、期刊、DOI 等元数据。CrossRef 等外部元数据只能补充缺失信息。标签和中文摘要必须尽量基于文章内容，不得只根据标题猜测。

## 本地归档

本地归档是文件名、编号和 SHA256 的事实来源。IMA 和 Zotero 都应引用最终归档路径。编号必须由 `skills/literature-organizer/harness/next_archive_no.cjs` 扫描归档目录后生成。

## IMA

IMA 负责保存文件本体和文章索引笔记。上传失败不应回滚本地归档，应记录为 pending 或 failed 状态，供后续重试。

## Zotero

Zotero 只保存索引元数据，不保存 PDF 附件。`extra` 字段应包含 `Local-Path`、`SHA256`、`Archive-No`、`IMA-KB`、`IMA-Media-ID`、`IMA-Status` 和 `Managed-By`。

## harness 执行顺序

```text
内容阅读和摘要生成
  -> content_check.cjs
  -> dedup_guard.cjs
  -> next_archive_no.cjs
  -> 本地归档
  -> ima-skill/harness/upload_pdf.cjs
  -> IMA 笔记索引追加
  -> zotero_guard.cjs
  -> Zotero MCP 写入
  -> ima-skill/harness/verify_workflow.cjs
```

## 校验重点

末尾校验应检查：

- 本地归档文件存在且 SHA256 可计算；
- IMA 中存在对应 media_id；
- IMA 笔记索引包含新条目；
- Zotero 条目存在且 `extra` 格式正确；
- Zotero 无 PDF 附件；
- 标签和摘要非空、非乱码；
- 同一 SHA256 没有重复 Zotero 条目；
- IMA 与 Zotero 的关联字段一致。
