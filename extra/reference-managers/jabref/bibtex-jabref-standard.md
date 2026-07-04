# BibTeX / JabRef 兼容规范

本规范用于让使用 JabRef 的用户开箱即用地接入文献整理流程。核心原则是：**不连接 JabRef 桌面端，只维护 JabRef 可读取的 `.bib` / `.biblatex` 文件和 PDF 路径**。

JabRef 在这个流程中是可选人工工具：

- AI 负责扫描 PDF、识别元数据、生成或更新 BibTeX 条目、去重、维护 citation key 和附件路径。
- JabRef 负责人工查看、修改、校验 `.bib` 文件，或配合 LaTeX / Overleaf 使用。
- 主流程不依赖 JabRef MCP、GUI 自动化、插件或本地端口。

## 用户需要提供什么

用户只需要提供以下信息：

| 配置项 | 示例占位符 | 用途 |
| --- | --- | --- |
| 文献工作区根目录 | `<literature_root>` | 存放 PDF、references 和备份 |
| BibTeX 文件路径 | `<literature_root>/references/references.bib` | AI 生成和更新的主引用库 |
| PDF 归档目录 | `<literature_root>/papers` | AI 整理后的 PDF 存放位置 |
| citation key 规则 | `author_year_shorttitle` | 生成稳定引用键 |
| 是否写入 file 字段 | `true` | 让 JabRef 能直接定位 PDF |

可选信息：

- 是否使用 BibTeX 还是 BibLaTeX；
- 是否保留现有 citation key；
- 是否按主题拆分多个 `.bib` 文件；
- PDF 路径使用相对路径还是绝对路径。

## 推荐目录结构

```text
<literature_root>/
  papers/
    0001-paper-title.pdf
    0002-another-paper.pdf
  references/
    references.bib
    backups/
      references-YYYYMMDD-HHmmss.bib
  indexes/
    paper_index.json
    paper_index.md
```

默认建议：

- `references/references.bib` 是唯一主引用库；
- `papers/` 存放整理后的 PDF；
- `.bib` 中的 `file` 字段使用相对路径，便于 GitHub 下载后迁移；
- 写入前先备份旧 `.bib` 到 `references/backups/`。

## 推荐 BibTeX 字段

每条记录至少需要：

- `title`
- `year`

推荐补充：

- `author`
- `journal` 或 `booktitle`
- `doi`
- `url`
- `abstract`
- `keywords`
- `file`

流程管理字段建议写入自定义字段：

```bibtex
local_sha256 = {<file_sha256>},
archive_no = {<archive_no>},
managed_by = {literature-workflow}
```

这些字段 JabRef 可以保留，AI 也可以用它们做去重和追踪。

## citation key 规则

默认规则：

```text
author_year_shorttitle
```

示例：

```text
smith_2024_transformer
wang_2023_heat_transfer
unknown_2025_review
```

规则要求：

- 小写；
- 只用 ASCII 字母、数字和下划线；
- 作者缺失时使用 `unknown`；
- 年份缺失时使用 `nd`；
- 标题取 1 到 3 个关键词；
- 冲突时追加 `a`、`b`、`c`。

## file 字段规则

默认写入相对路径：

```bibtex
file = {../papers/0001-paper-title.pdf:PDF}
```

不建议默认写入本机绝对路径，因为绝对路径不利于 GitHub 分享和跨机器迁移。

如果用户明确要求，也可以在本机私有配置中改为绝对路径，但不要把真实路径写进公开模板。

## AI 执行步骤

AI 在 JabRef 兼容模式下应按以下顺序执行：

1. 读取本规范和 `extra/reference-managers/jabref/bibtex-backend.example.json`。
2. 确认用户提供了 `<literature_root>`、`.bib` 文件路径和 PDF 归档目录。
3. 如果 `.bib` 不存在，创建空文件并写入说明注释。
4. 扫描待整理 PDF，提取 DOI、标题、作者、年份和摘要。
5. 按 `doi`、`local_sha256`、`normalized_title_year` 去重。
6. 生成或保留 citation key。
7. 归档 PDF，并写入相对 `file` 字段。
8. 写入前备份旧 `.bib`。
9. 更新 `.bib` 后运行格式检查。
10. 输出整理报告，列出新增、更新、跳过和需要人工确认的条目。

## 验证方式

基础检查：

```powershell
node scripts/doctor.cjs
```

人工检查：

1. 用 JabRef 打开 `references/references.bib`。
2. 检查是否有 BibTeX 解析错误。
3. 随机打开 3 条记录，确认 `file` 字段能定位 PDF。
4. 搜索 DOI 或标题，确认没有明显重复。
5. 在 LaTeX / Markdown 中引用一条 citation key，确认能被识别。

## 适用边界

适合：

- JabRef 用户；
- LaTeX / Overleaf / Pandoc 用户；
- 希望把文献库随 GitHub 一起分享或迁移的用户；
- 希望 AI 直接整理引用库的用户。

不适合：

- 必须实时控制 JabRef GUI 的流程；
- 必须依赖 EndNote 专有库格式的流程；
- 必须用 Zotero Web API 同步云端库的流程。

## 推荐配置

公开模板见：

- `extra/reference-managers/jabref/bibtex-backend.example.json`

正式使用时，AI 应复制模板到用户本机私有配置位置，再替换 `<literature_root>` 等占位符。
