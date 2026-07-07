# JabRef / BibTeX 扩展说明

本目录提供一个面向 JabRef 用户的轻量引用管理方案。它不控制 JabRef 桌面端，也不依赖 JabRef MCP；AI 只维护 JabRef 可直接打开的 `.bib` / `.biblatex` 文件、citation key 和 PDF 附件路径，JabRef 作为用户本地查看、编辑、校验和配合 LaTeX 使用的可选工具。

## 能力边界

本扩展适合以下场景：

- 用户主要使用 LaTeX、Overleaf、Pandoc、Markdown 或 BibTeX / BibLaTeX 引用库。
- 用户希望文献库能随项目一起迁移、备份或托管到 GitHub。
- 用户希望 AI 直接生成、更新、去重和校验 `.bib` 文件。
- 用户使用 JabRef 打开 `.bib` 文件做人肉检查、字段补全、清洗和导出。

本扩展不做以下事情：

- 不连接或自动控制 JabRef GUI。
- 不要求用户安装 JabRef 插件、JabRef MCP 或本地端口服务。
- 不写入 Zotero、EndNote 或其他专有数据库。
- 不把用户本机绝对路径写入公开模板，除非用户明确要求本地私有配置。

推荐模式：

```text
reference_backend.type = bibtex
reference_backend.mode = jabref-compatible
```

## 推荐工作流

### 新增文献

1. AI 从 PDF、DOI、题名或用户提供的元数据中提取文献信息。
2. AI 检查目标 `.bib` 文件是否存在；不存在则创建。
3. AI 按 DOI、PDF SHA256、题名与年份做去重。
4. AI 生成稳定 citation key。
5. AI 将 PDF 归档到约定目录。
6. AI 写入或更新 BibTeX / BibLaTeX 条目，并写入 `file` 字段。
7. AI 备份旧 `.bib`，再保存新 `.bib`。
8. 用户可用 JabRef 打开 `.bib` 做人工校验。

### 修改文献

1. AI 先读取目标 `.bib` 条目，确认 citation key、题名、作者和 DOI。
2. AI 只修改用户指定字段或明显错误字段。
3. 修改前备份原 `.bib`。
4. 修改后重新解析 `.bib`，确认没有语法错误。
5. 若 citation key 发生变化，AI 必须同步提醒用户更新 LaTeX / Markdown 中的引用。

### 删除文献

1. AI 先确认要删除的 citation key。
2. 默认只从 `.bib` 删除条目，不删除 PDF。
3. 如果用户要求删除 PDF，必须先列出待删除文件并得到明确确认。
4. 删除前备份 `.bib`。
5. 删除后检查 `.bib` 可解析，并报告删除的 key。

### 检索与引用

1. AI 优先在 `.bib` 中按 citation key、题名、作者、年份、DOI、关键词检索。
2. 找到候选条目后，先展示关键信息让用户确认。
3. 生成 LaTeX 引用时，直接使用已有 citation key。
4. 发现 `.bib` 元数据错误时，先修复 `.bib` 源条目，不要只修复 `.tex` 或导出的临时文件。

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

推荐约定：

- `references/references.bib` 是主引用库。
- `papers/` 存放归档后的 PDF。
- `references/backups/` 存放 `.bib` 写入前备份。
- `.bib` 中的 `file` 字段默认写相对路径，便于 GitHub 分享和跨机器迁移。
- 私有绝对路径只写入用户本机配置，不写入公开模板。

## 用户需要提供的配置

最小配置：

| 配置项 | 示例 | 用途 |
| --- | --- | --- |
| 文献工作区根目录 | `<literature_root>` | 存放 PDF、引用库和备份 |
| BibTeX 文件路径 | `<literature_root>/references/references.bib` | AI 维护的主引用库 |
| PDF 归档目录 | `<literature_root>/papers` | PDF 存放位置 |
| citation key 规则 | `author_year_shorttitle` | 生成稳定引用键 |
| 是否写入 file 字段 | `true` | 让 JabRef 能定位 PDF |

可选配置：

- 使用 BibTeX 还是 BibLaTeX。
- 是否保留已有 citation key。
- 是否按主题拆分多个 `.bib` 文件。
- PDF 路径使用相对路径还是绝对路径。
- 是否写入 `abstract`、`keywords`、`local_sha256`、`archive_no` 等扩展字段。

模板文件：

```text
extra/reference-managers/jabref/bibtex-backend.example.json
```

正式使用时，应复制模板到用户本机私有配置位置，再替换 `<literature_root>` 等占位符。

## BibTeX 字段规范

每条记录至少需要：

- `title`
- `year`

强烈建议补充：

- `author`
- `journal` 或 `booktitle`
- `doi`
- `url`
- `abstract`
- `keywords`
- `file`

流程追踪字段可写入自定义字段：

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

- 只使用小写 ASCII 字母、数字和下划线。
- 作者缺失时使用 `unknown`。
- 年份缺失时使用 `nd`。
- 标题取 1 到 3 个关键词。
- 冲突时追加 `a`、`b`、`c`。
- 已存在且已被用户使用的 citation key 默认保留，不主动重命名。

## file 字段规则

默认写入相对路径：

```bibtex
file = {../papers/0001-paper-title.pdf:PDF}
```

不建议公开配置中写本机绝对路径，因为绝对路径不利于 GitHub 分享和跨机器迁移。如果用户明确要求本机私有路径，可以在本机私有配置中改为绝对路径。

JabRef 通常可以识别 `file` 字段并在条目中打开 PDF。若 JabRef 无法定位 PDF，优先检查：

- `.bib` 文件与 `papers/` 的相对位置是否一致。
- PDF 文件名是否被移动或重命名。
- `file` 字段是否仍使用旧路径。

## 去重策略

按以下顺序判断重复：

1. DOI 完全一致。
2. `local_sha256` 完全一致。
3. 规范化题名 + 年份一致。
4. 题名高度相似且第一作者一致。

发现重复时，默认更新已有条目而不是新增条目；如果两个条目的元数据都不完整，应合并字段并保留更完整的 `file`、`doi`、`abstract` 和 `keywords`。

## 写入安全要求

- 写入 `.bib` 前先备份。
- 修改前先解析现有 `.bib`，保留用户已有字段。
- 不要重排整个 `.bib`，除非用户明确要求格式化。
- 不要删除用户自定义字段。
- 不要擅自重命名 citation key。
- 不要把测试文件、临时 PDF 或本机私有路径提交到公开仓库。

## 验证方式

AI 侧检查：

1. 解析 `.bib`，确认语法有效。
2. 检查每条新增或修改记录有 citation key、title、year。
3. 检查 DOI、作者、期刊、页码等关键字段。
4. 检查 `file` 字段指向的 PDF 是否存在。
5. 检查 citation key 是否唯一。

用户侧检查：

1. 用 JabRef 打开 `references/references.bib`。
2. 确认没有 BibTeX 解析错误。
3. 随机打开 3 条记录，确认 PDF 可定位。
4. 搜索 DOI 或题名，确认没有明显重复。
5. 在 LaTeX / Markdown 中引用一条 citation key，确认能被识别。

项目基础检查可运行：

```powershell
node scripts/doctor.cjs
```

## 与其他后端的关系

- JabRef 方案维护的是开放 `.bib` 文件，适合 LaTeX / GitHub / Overleaf 友好的轻量流程。
- Zotero 方案适合需要本地 Zotero、Web API 或知识库同步的流程。
- EndNote 方案适合用户明确使用 EndNote 图书馆、RIS/XML 或 EndNote Desktop 的流程。

当用户只说“帮我维护 BibTeX / references.bib / JabRef 文献库”时，优先使用本方案。
