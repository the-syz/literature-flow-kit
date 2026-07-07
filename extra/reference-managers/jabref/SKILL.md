---
name: jabref-bibtex-manager
description: 当用户要求使用 JabRef、BibTeX、BibLaTeX、references.bib、citation key 或 PDF file 字段完成新增文献、修改条目、删除条目、去重、检索条目、生成 LaTeX/Pandoc 引用，或维护可被 JabRef 打开的 .bib/.biblatex 文件时使用。该技能只描述工作流，不包含安装、配置或开发说明。
---

# JabRef / BibTeX 工作流

## 基本原则

- 直接维护 `.bib` 或 `.biblatex` 文件，不控制 JabRef 桌面端。
- JabRef 只作为用户本地查看、编辑、校验和导出的工具。
- 默认保留用户已有字段、已有 citation key 和文件排序。
- 元数据错误必须修复 `.bib` 源条目，不要只修改 `.tex`、`.md` 或临时导出文件。

## 新增文献

1. 先提取或确认题名、作者、年份、期刊或会议、DOI、URL、摘要、关键词和 PDF 路径。
2. 读取目标 `.bib` 文件；若不存在，创建空引用库。
3. 按 DOI、PDF SHA256、规范化题名加年份进行去重。
4. 若已存在同一文献，更新原条目而不是新增重复条目。
5. 若是新文献，生成稳定 citation key。
6. 归档 PDF 后写入 `file` 字段，默认使用相对路径。
7. 写入前备份 `.bib`。
8. 写入后重新解析 `.bib`，确认无语法错误、citation key 唯一、PDF 路径可定位。

## 修改条目

1. 先读取目标条目，确认 citation key、题名、作者、年份和 DOI 匹配用户意图。
2. 只修改用户指定字段或明显错误字段。
3. 默认保留已有 citation key；除非用户明确要求，不要主动重命名。
4. 修改前备份 `.bib`。
5. 修改后重新解析 `.bib` 并检查目标字段。
6. 若 citation key 被修改，提醒用户同步更新 LaTeX、Markdown 或 Pandoc 文档中的引用。

## 删除条目

1. 先确认要删除的 citation key。
2. 默认只删除 `.bib` 条目，不删除 PDF 文件。
3. 如果用户要求删除 PDF，必须先列出待删除文件并得到明确确认。
4. 删除前备份 `.bib`。
5. 删除后重新解析 `.bib`，确认目标 key 已移除且其他条目未受影响。

## 检索和引用

1. 优先在 `.bib` 中按 citation key、题名、作者、年份、DOI、关键词检索。
2. 读取候选条目后，展示题名、作者、年份、来源和 DOI 供用户确认。
3. 生成 LaTeX 引用时使用 `\cite{key}` 或用户指定命令。
4. 生成 Markdown / Pandoc 引用时使用 `[@key]`。
5. 如果引用 undefined，检查 citation key、`.bib` 路径、构建配置和文档中的引用命令。

## 字段规则

- 每条记录至少应有 `title` 和 `year`。
- 优先补全 `author`、`journal` 或 `booktitle`、`doi`、`url`、`abstract`、`keywords`、`file`。
- `file` 字段默认使用相对路径，例如 `file = {../papers/paper.pdf:PDF}`。
- 可保留 `local_sha256`、`archive_no`、`managed_by` 等追踪字段。
- 不要删除 JabRef 或用户自定义字段。

## citation key 规则

1. 默认使用 `author_year_shorttitle`。
2. 只使用小写 ASCII 字母、数字和下划线。
3. 作者缺失时使用 `unknown`。
4. 年份缺失时使用 `nd`。
5. 标题取 1 到 3 个关键词。
6. 冲突时追加 `a`、`b`、`c`。
7. 已存在且被用户使用的 key 默认保留。

## 完成检查

1. `.bib` 可以被解析。
2. 新增或修改条目字段完整。
3. citation key 唯一。
4. `file` 字段指向的 PDF 存在。
5. 没有误删用户字段、误改已有 key 或写入本机私有绝对路径。
