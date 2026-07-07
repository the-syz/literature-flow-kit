# EndNote 扩展说明

本目录为项目提供 EndNote 相关能力说明和一个最小写入 MCP。EndNote 不并入主文献整理流程；只有用户明确要求使用 EndNote 时，AI agent 才读取本目录。

## 能力边界

本目录把 EndNote 操作分成两类：

1. **写入层**：本项目 `mcp/` 目录下的本地写入 MCP，负责准备导入文件、读取记录、受控修改记录、软删除记录。
2. **输出层**：用户本机安装配置的 `gokmengokhan/endnote-mcp`，负责检索、读取详情、引用格式、BibTeX、bibliography、PDF 片段读取和 TeX 输出辅助。

推荐默认流程是：新增文献优先生成 RIS/XML，再由 EndNote Desktop 导入；如果用户明确要求自动化，并且目标是一次性测试库或已备份的本地图书馆，也可以使用写入 MCP 的受控直写工具。输出引用时，先从 EndNote Desktop 导出最新 XML，再让输出层 MCP 建索引并生成引用结果。

## 推荐工作流

### 新增文献

1. AI 从用户提供的信息、PDF 首页或 DOI 信息提取元数据。
2. 默认由写入 MCP 生成 RIS 或 EndNote 可导入文件。
3. 如果用户要求自动化直写，写入 MCP 先 dry-run，再在确认后同时写入 `.enl` 和 `.Data/sdb/sdb.eni`。
4. 写入或导入完成后，用户从 EndNote Desktop 导出最新 XML。
5. 输出层 MCP 重建索引。
6. AI 再使用输出层 MCP 检索、生成引用或导出 BibTeX。

### 修改文献

1. AI 先读取当前 EndNote 记录。
2. 对比旧值和新值，明确要修改的字段。
3. 写入 MCP 先 dry-run。
4. 用户确认后，写入 MCP 备份并写入 `.enl` 与 `.Data/sdb/sdb.eni`。
5. 用户重新从 EndNote Desktop 导出 XML。
6. 输出层 MCP 重建索引。

### 删除文献

本项目只支持软删除：按明确 record id 将记录移动到 EndNote Trash，不硬删除数据库行。

## 本项目写入 MCP

位置：

```text
extra/reference-managers/endnote/mcp/
```

用途：

- `endnote_status`：检查 `.enl`、`.Data/sdb/sdb.eni`、备份目录和导入文件路径。
- `endnote_get_record`：读取单条 EndNote 记录。
- `endnote_prepare_import`：生成或追加 RIS 导入记录。
- `endnote_direct_insert_records`：实验性直写新增记录，同时写入 `.enl` 与 `.Data/sdb/sdb.eni`，只建议用于测试库或已备份图库。
- `endnote_update_fields`：受控更新已有记录字段。
- `endnote_delete_records`：软删除明确 record id。

安装：

```powershell
cd extra\reference-managers\endnote\mcp
python -m pip install -e .
```

Codex MCP 配置示例：

```json
{
  "mcpServers": {
    "endnote-write": {
      "command": "python",
      "args": [
        "-m",
        "endnote_write_mcp.server"
      ],
      "cwd": "<repo>/extra/reference-managers/endnote/mcp",
      "env": {
        "ENDNOTE_LIBRARY": "<path-to-library.enl>",
        "ENDNOTE_BACKUP_DIR": "<path-to-backups>",
        "ENDNOTE_IMPORT_FILE": "<path-to-import.ris>"
      }
    }
  }
}
```

写入安全要求：

- 修改前关闭 EndNote Desktop。
- 写入前先读取记录并 dry-run。
- 真实写入必须显式确认。
- 写入前备份 `.enl` 和 `.Data/sdb/sdb.eni`。
- 写入时同步更新 `.enl` 和 `.Data/sdb/sdb.eni`。
- 删除只做软删除，不硬删除。
- 直写新增必须显式设置 `allow_experimental_direct_insert=true`，并只用于测试库或用户已接受风险的已备份图库。
- 直写新增不要传入原始 `reference_type` 或 `ref_type` 数字；只传 `reference_type_name`，默认 `Journal Article`。
- EndNote `.enl` 内部类型和 XML 导出的 `<ref-type>` 数字不是同一套编码。期刊文章直写 `.enl` 使用内部 `reference_type = 0`；EndNote XML 导出中 `Journal Article` 常见为 `<ref-type name="Journal Article">17</ref-type>`。
- 如果 EndNote Desktop 中记录类型显示为“法案”等异常类型，优先检查写入 MCP 的类型映射；不要只修改后续生成的 `.bib`、`.tex` 或 XML 测试文件。

## 输出层 EndNote MCP

推荐使用：

https://github.com/gokmengokhan/endnote-mcp

该项目把 EndNote Desktop 导出的 XML 和 PDF 目录索引成本地 SQLite 数据库，通过 MCP 提供检索、引用和导出能力。它不直接修改 `.enl`。

上游 README 描述的工作流是：

```text
EndNote Library
  -> XML Export
  -> endnote-mcp index
  -> SQLite Database (FTS5 + optional embeddings)
  -> MCP Server
  -> AI client
```

### 安装

上游推荐使用 `uv`：

```powershell
uv tool install endnote-mcp
```

也可以使用 pip：

```powershell
python -m pip install endnote-mcp
```

如果需要语义检索：

```powershell
python -m pip install "endnote-mcp[semantic]"
endnote-mcp embed
```

语义检索依赖本地 embedding 模型，首次构建会更慢；普通关键词检索不需要安装 semantic extras。

### 从 EndNote 导出 XML

在 EndNote Desktop 中：

```text
File -> Export -> Save as type: XML
```

建议固定导出到一个稳定路径，例如：

```text
<repo>/extra/reference-managers/endnote/local/library.xml
```

每次新增、修改或删除文献后，都需要重新导出 XML，然后重新索引。

### 初始化与索引

上游提供交互式配置：

```powershell
endnote-mcp setup
```

常用命令：

```powershell
endnote-mcp index
endnote-mcp index --full
endnote-mcp index --skip-pdfs
endnote-mcp status
endnote-mcp serve
```

含义：

- `setup`：交互式创建配置、检测 XML/PDF 路径、建立索引。
- `index`：增量索引最新 XML。
- `index --full`：从头重建索引。
- `index --skip-pdfs`：只索引元数据，不解析 PDF。
- `status`：查看索引状态。
- `serve`：启动 MCP server。

上游配置文件位置：

```text
Windows: %APPDATA%/endnote-mcp/config.yaml
macOS: ~/Library/Application Support/endnote-mcp/config.yaml
Linux: ~/.config/endnote-mcp/config.yaml
```

典型配置：

```yaml
endnote_xml: C:/path/to/library.xml
pdf_dir: C:/path/to/Library.Data/PDF
db_path: C:/path/to/library.db
max_pdf_pages: 30
```

### Codex MCP 配置方案

如果已经通过 `uv tool install endnote-mcp` 安装，可在 Codex MCP 配置中使用：

```json
{
  "mcpServers": {
    "endnote-output": {
      "command": "endnote-mcp",
      "args": [
        "serve"
      ]
    }
  }
}
```

如果使用项目虚拟环境或 pip 安装，建议指定 Python 模块启动：

```json
{
  "mcpServers": {
    "endnote-output": {
      "command": "python",
      "args": [
        "-m",
        "endnote_mcp",
        "serve"
      ]
    }
  }
}
```

如果本机 `endnote-mcp setup` 已经写好配置，MCP server 会读取默认配置文件。若需要在多图书馆之间切换，推荐在使用前先切换 `config.yaml` 中的 `endnote_xml`、`pdf_dir`、`db_path`，然后运行：

```powershell
endnote-mcp index --full
```

### 输出层工具能力

上游 README 列出的 MCP 工具包括：

- `search_references`：按作者、题名、年份、关键词、摘要检索。
- `search_fulltext`：检索 PDF 全文。
- `search_library`：合并元数据和 PDF 检索。
- `search_semantic`：语义检索，需要 semantic extras。
- `get_reference_details`：读取完整文献元数据。
- `get_citation`：生成 APA 7th、Harvard、Vancouver、Chicago、IEEE 引用。
- `get_bibtex`：导出 BibTeX。
- `get_bibliography`：为多条记录生成 bibliography。
- `find_related`：查找相关文献。
- `read_pdf_section`：读取 PDF 指定页。
- `list_references_by_topic`：按主题列出文献。
- `rebuild_index`：更新 EndNote XML 后重建索引。

## 两个 MCP 的协作方式

```text
新增/修改/删除
  -> 写入 MCP
  -> EndNote Desktop 确认或重新导出 XML
  -> 输出 MCP rebuild/index
  -> 检索、引用、BibTeX、TeX
```

常见任务对应关系：

| 任务 | 使用组件 |
| --- | --- |
| 准备导入一篇新文献 | 写入 MCP 生成 RIS/XML |
| 自动新增到测试图库 | 写入 MCP 的 `endnote_direct_insert_records` |
| 修改已有记录元数据 | 写入 MCP |
| 删除已有记录 | 写入 MCP 软删除 |
| 搜索 EndNote 图书馆 | 输出 MCP |
| 生成 APA/IEEE 等引用 | 输出 MCP |
| 生成 BibTeX | 输出 MCP |
| 生成带引用的 TeX | 输出 MCP + LaTeX 工具链 |
| 发现输出字段错误 | 回到写入 MCP 修复源记录，再重新导出 XML |

## 许可说明

- 本项目自带 `mcp/` 是项目内写入 MCP。
- `gokmengokhan/endnote-mcp` 使用 AGPL-3.0-or-later。建议作为用户本地单独安装的输出层服务使用，不把其源码复制混入本项目写入 MCP。
- `endnote-cli` 是 Apache-2.0，可作为实现思路参考；如果复制或修改其代码，应保留相应许可和版权说明。
- EndNote Desktop 是 Clarivate 的专有软件。本项目只面向用户本机授权图书馆做辅助操作，不绕过 EndNote 的正常导入和导出流程。

## 故障排查

- 搜不到新文献：确认已从 EndNote Desktop 重新导出 XML，并运行 `endnote-mcp index` 或输出 MCP 的 `rebuild_index`。
- BibTeX 作者或期刊错误：不要先改 `.bib`，先检查 EndNote 源记录和最新 XML。
- 文献类型显示为“法案”：这是直写 `.enl` 时引用类型编码使用错误造成的风险，不是 EndNote 自动识别。期刊文章应在 `.enl` 中写入 `reference_type = 0`，不要把 XML `<ref-type>` 的 `17` 写入 `.enl`。
- PDF 搜索无结果：检查 `pdf_dir` 是否指向 `.Data/PDF`，必要时运行 `endnote-mcp index --full`。
- MCP 无法启动：先在终端运行 `endnote-mcp status` 和 `endnote-mcp serve`，确认命令可用。
- 写入失败：确认 EndNote Desktop 已关闭，`.enl` 和 `.Data/sdb/sdb.eni` 都存在，且备份目录可写。
