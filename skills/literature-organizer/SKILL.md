---
name: literature-organizer
description: 当用户要求整理文献、处理 PDF、归档论文、更新文章索引、上传到 IMA 知识库，或把整理后的本地文献同步到 Zotero 时，使用该技能编排从临时存放区到本地归档、IMA 和 Zotero 的完整流程，并强制执行 harness 预检和末尾校验。
---

# 文献整理主流程

当用户把仓库路径或本地下载的文件夹交给 AI，并要求整理文献、上传知识库、同步 Zotero 或维护文章索引时，先使用本 skill。工具细节分别见 `skills/ima-skill/SKILL.md` 和 `skills/zotero/SKILL.md`。

## 本地配置

开始真实写入前必须确认：

- `config/workflow_config.example.json` 已复制为 `skills/ima-skill/harness/workflow_config.json`；
- `workflow_config.json` 中的临时存放区、归档目录、IMA 知识库 ID、IMA 笔记 ID 已替换；
- IMA 凭证已通过 `IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY` 或本机配置文件提供；
- Zotero 凭证已通过 `ZOTERO_API_KEY`、`ZOTERO_USER_ID` 提供；
- Zotero MCP 已按 `config/trae-mcp.example.json` 配置。

如果缺少本机配置，只能做离线检查和准备，不得执行上传、写 Zotero 或追加 IMA 笔记。

## 标准流程

1. **扫描临时存放区**：读取 `workflow_config.json` 的 `paths.intake_dir`，跳过未下载完成、类型不支持或已在状态记录中的文件。
2. **提取元数据**：从 PDF 文本优先提取 DOI、标题、作者、年份、期刊；外部元数据只作为补充。
3. **阅读内容并生成标签/摘要**：阅读摘要、引言、方法、结果、结论。标签和中文摘要必须基于文章内容，禁止只凭标题推断。
4. **运行内容预检**：执行 `skills/literature-organizer/harness/content_check.cjs`。失败则回到阅读和摘要生成步骤。
5. **运行去重检查**：执行 `skills/literature-organizer/harness/dedup_guard.cjs`。本地或 IMA 命中重复时，跳过整篇流程或向用户报告；Zotero 命中只作为信息，不触发 IMA 上传。
6. **生成归档编号**：执行 `skills/literature-organizer/harness/next_archive_no.cjs`，按归档目录最大编号加一。禁止 AI 手填编号。
7. **本地归档**：将文件重命名为 `archive_numbering.naming_pattern` 指定格式，移动到目标归档目录，并计算 SHA256。
8. **上传 IMA**：执行 `skills/ima-skill/harness/upload_pdf.cjs`，上传到目标知识库。
9. **追加文章索引笔记**：按 `ima_note_index.append_format` 追加到 IMA 文章索引笔记；缺少笔记 ID 时跳过并记录 pending。
10. **运行 Zotero 写入预检**：执行 `skills/literature-organizer/harness/zotero_guard.cjs`，检查 title、tags、extra。
11. **写入 Zotero index-only 条目**：通过 Zotero MCP 创建或更新条目，不附加 PDF。
12. **末尾校验**：执行 `skills/ima-skill/harness/verify_workflow.cjs`，确认本地归档、IMA、IMA 笔记索引和 Zotero 一致。
13. **保存流程记录**：记录归档编号、SHA256、IMA media_id、Zotero item key、状态和错误信息。

## 内容质量规则

- 标签数量为 3-8 个。
- 标签使用中文为主，可保留必要英文术语。
- 标签应来自研究方法、研究对象、关键技术或应用领域。
- 中文摘要建议 200-300 字，至少说明研究目标、方法、关键结果和结论。
- 不得把标题翻译成摘要。
- 无法读取全文时，必须在报告中说明摘要和标签的依据及可信度。

## 本地归档规则

- 归档目录来自 `workflow_config.json`：
  - 推荐文献使用 `paths.recommended_archive_dir`；
  - 自行查找文献使用 `paths.self_collected_archive_dir` 和 `archive_numbering.archive_dir`。
- 编号必须由 `next_archive_no.cjs` 扫描归档目录后生成。
- 文件名格式由 `archive_numbering.naming_pattern` 决定，默认 `{archive_no}-{title}.pdf`。
- 归档后立即计算 SHA256，后续 IMA 和 Zotero 都引用该归档路径。

## IMA 规则

- IMA 是文件本体存储层，本地归档与 IMA 应保持一一对应。
- IMA 知识库路由使用 `knowledge_base_routing` 和 `knowledge_base_mapping`。
- 上传使用 `upload_pdf.cjs`，不得绕过类型检查、重名检查、COS 上传检查和 `add_knowledge` 检查。
- IMA 上传失败不回滚本地归档，应记录状态：
  - `uploaded`
  - `pending`
  - `skipped-unsupported-type`
  - `skipped-duplicate`
  - `failed-cos`
  - `failed-add`
- 文章索引笔记由 `ima_note_index` 配置。笔记 ID 仍是占位符时，不得追加。

## Zotero 规则

- Zotero 是独立索引层，不存储 PDF。
- Zotero 缺失条目时，只创建 Zotero 索引，不重新触发本地归档或 IMA 上传。
- Zotero 已有条目但缺少标签、摘要或 extra 时，只修补 Zotero。
- 写入必须幂等，按 DOI、SHA256、标题加年份去重。
- 写入前必须通过 `zotero_guard.cjs`。
- 写入后必须验证没有 PDF/file attachment 子条目。

## Zotero extra 字段

```text
Local-Path: <归档后绝对路径>
SHA256: <64位十六进制>
Archive-No: <归档编号>
IMA-KB: <知识库名称>
IMA-Media-ID: <media_id>
IMA-Status: uploaded | pending | skipped-unsupported-type | skipped-duplicate | failed-cos | failed-add
Managed-By: traesolo-zotero-latex-integration
```

## 主流程 harness

### `content_check.cjs`

用途：写入任何系统前，检查标签和摘要质量。

```powershell
node skills/literature-organizer/harness/content_check.cjs `
  --title "<论文标题>" `
  --tags "<标签1,标签2,标签3>" `
  --abstract "<中文摘要>"
```

检查项：标签数量、标签乱码、标签是否疑似标题拆词、摘要长度、摘要乱码、摘要是否疑似标题改写、标签非空、摘要非空。

### `dedup_guard.cjs`

用途：归档前查重。本地和 IMA 命中重复会阻塞；Zotero 只报告状态。

```powershell
node skills/literature-organizer/harness/dedup_guard.cjs `
  --file "<待处理PDF路径>" `
  --title "<论文标题>" `
  --kb-name "<目标知识库>" `
  --doi "<DOI，可选>"
```

检查项：

- D1：本地 SHA256 去重，阻塞型；
- D2：IMA 去重，阻塞型，优先查文章索引笔记，再用 `search_knowledge` 兜底；
- D3：Zotero 状态检查，信息型。

### `next_archive_no.cjs`

用途：扫描归档目录并生成下一个编号。

```powershell
node skills/literature-organizer/harness/next_archive_no.cjs
node skills/literature-organizer/harness/next_archive_no.cjs --check 243
```

返回 `next_no`、`max_no`、`total_files`、`duplicates`。传入 `--check` 时，候选编号必须等于 `max_no + 1` 且未被占用。

### `zotero_guard.cjs`

用途：Zotero 写入前防止乱码和缺字段。

```powershell
node skills/literature-organizer/harness/zotero_guard.cjs `
  --title "<论文标题>" `
  --tags "<标签1,标签2,标签3>" `
  --extra "Local-Path: <路径>`nSHA256: <哈希>`nManaged-By: traesolo-zotero-latex-integration"
```

检查项：标题乱码、标题非空、标签乱码、标签非空、extra 必需字段、extra 乱码、SHA256 格式、Local-Path 路径异常。

## IMA harness

### 预检

```powershell
node skills/ima-skill/harness/preflight.cjs
node skills/ima-skill/harness/preflight.cjs --list-kb
node skills/ima-skill/harness/preflight.cjs --resolve-kb "<知识库名称>"
```

### 上传

```powershell
node skills/ima-skill/harness/upload_pdf.cjs `
  --file "<归档后的PDF路径>" `
  --kb-name "<知识库名称>"
```

### 末尾校验

```powershell
node skills/ima-skill/harness/verify_workflow.cjs `
  --file "<归档后的PDF路径>" `
  --zotero-key "<Zotero item key>" `
  --media-id "<IMA media_id>" `
  --kb-name "<知识库名称>"
```

任何校验项失败时，不得把任务标记为完成；必须报告具体失败项，并在可修复时修复后重新校验。

## 执行边界

- 不提交 `.env`、PDF、日志、`skills/ima-skill/harness/workflow_config.json` 或个人导出数据。
- 不把凭证写入文档、日志或 Zotero extra。
- 不因 Zotero 缺失而触发 IMA 上传。
- 不因 IMA 上传失败而破坏本地归档。
- 不绕过 harness 脚本手动判断编号、去重或 Zotero 字段。
