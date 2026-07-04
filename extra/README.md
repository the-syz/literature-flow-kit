# 扩展连接方案候选清单

本目录用于存放 IMA 和 Zotero 主方案之外的扩展连接方案。这里的内容是备选接口，不是主流程必需配置；当用户不使用默认的 IMA / Zotero 组合时，AI 可以从对应子目录读取连接规范、配置模板和测试记录，直接接入其他知识库或引用管理方式。

检索日期：2026-07-04。

## 目录规划

```text
extra/
  knowledge-bases/
    notebooklm/
    notion/
    obsidian/
  reference-managers/
    endnote/
    jabref/
```

## 接入层设计

建议把主流程继续抽象为两类后端：

- `knowledge_backend`：负责知识库、笔记、全文问答、索引笔记或资料库同步。
- `reference_backend`：负责文献条目、引用键、BibTeX/RIS/EndNote XML、PDF 附件和引用导出。

这样主流程仍然以 `skills/literature-organizer/SKILL.md` 为入口，扩展平台只替换后端适配层，不直接改主流程。

## 总体优先级

| 优先级 | 平台 | 建议定位 | 原因 |
|---|---|---|---|
| 1 | Obsidian | 本地知识库后端 | Markdown 文件夹天然适合 Git、AI 代理和本地自动化，隐私边界清晰。 |
| 2 | BibTeX / JabRef 兼容模式 | 本地引用后端 | `.bib` 文件可版本控制，AI 可直接维护；JabRef 只是可选人工校验工具。 |
| 3 | Notion | 云端知识库后端 | 官方 MCP 已存在，适合团队和数据库式笔记，但需要 Notion token 和云端权限。 |
| 4 | NotebookLM | AI 阅读/问答后端 | 研究体验强，但目前主要依赖非官方 MCP/CLI，账号会话和接口稳定性需要重点测试。 |
| 5 | EndNote | 导入导出型引用后端 | 适合机构授权和 Word 写作，但直接 MCP/自动化接口较弱，更适合作为 EndNote XML/RIS 输出目标。 |

## AI 知识库候选

### NotebookLM

NotebookLM 更适合作为“文献阅读和基于来源回答”的 AI 知识库，而不是完全可控的本地归档数据库。当前 GitHub 上有多个非官方 MCP/CLI 项目，重点测试账号登录、会话持久化、上传源文件、查询引用来源和跨客户端复用。

| 项目 | 类型 | 优点 | 风险或限制 | 初步建议 |
|---|---|---|---|---|
| `jacob-bd/notebooklm-mcp-cli` | Python CLI + MCP + AI agent skills | 星标高；同时提供 CLI、MCP 和 skill 思路；适合做自动化 runner 的候选。 | 非官方；可能依赖 Google 登录状态；NotebookLM 页面或接口变化会影响稳定性。 | 优先测试。 |
| `PleasePrompto/notebooklm-mcp` | TypeScript MCP | 明确面向 Claude Code、Codex 等代理；描述中包含持久认证、library management、跨客户端共享。 | 非官方；认证和浏览器状态需要验证；TypeScript 依赖链要单独检查。 | 可作为第二候选。 |
| `claude-world/notebooklm-skill` | Python skill + MCP | 已经带有 skill 形态，适合参考“研究到写作”的流程组织。 | 偏 Claude Code 生态；需要改造成当前仓库的中文 skill 结构。 | 适合参考 skill 设计，不建议直接作为唯一后端。 |
| `Pantheon-Security/notebooklm-mcp-secure` | TypeScript MCP | 强调安全加固，适合研究如何处理登录和权限边界。 | 项目体量较小；配置可能更复杂。 | 作为安全设计参考。 |

建议放置位置：

- `extra/knowledge-bases/notebooklm/`
- 后续可添加 `mcp/`、`skill/`、`config/`、`docs/`、`tests/`。

### Notion

Notion 适合承载结构化笔记、数据库、项目索引和团队可见的文献状态表。它的优势是官方 API 和官方 MCP 项目已经比较明确，缺点是所有真实数据和 token 都在云端权限体系内，需要明确 workspace、database、page 的边界。

| 项目 | 类型 | 优点 | 风险或限制 | 初步建议 |
|---|---|---|---|---|
| `makenotion/notion-mcp-server` | 官方 TypeScript MCP | 官方项目；维护活跃；适合公开文档中作为默认推荐。 | Notion API 权限、database schema、token 范围需要用户配置；云端依赖不可避免。 | 优先测试。 |
| `suekou/mcp-notion-server` | TypeScript MCP | 创建较早，MCP 生态使用面较广；项目描述明确连接 Notion API。 | 第三方维护；功能边界可能与官方项目重叠。 | 官方项目不满足时测试。 |
| `awkoy/notion-mcp-server` | TypeScript MCP | 描述覆盖 pages、databases、blocks、comments、files；面向多个 AI 客户端。 | 第三方项目；需要验证权限和文件能力是否稳定。 | 可作为功能更全的备选。 |
| `Grey-Iris/easy-notion-mcp` | TypeScript MCP | Markdown-first，强调更少 token 和双向保真，适合 AI 写入笔记。 | 项目较新；生态成熟度低于官方项目。 | 适合测试 Markdown 笔记同步场景。 |

建议放置位置：

- `extra/knowledge-bases/notion/`
- 后续重点补充 database schema 模板、Notion token 权限说明、页面/数据库映射规则。

### Obsidian

Obsidian 是当前最适合公开 GitHub 工作流的 IMA 替代方案：本地 vault 本质是 Markdown 文件夹，AI 代理可以直接读写，Git 也可以直接管理版本。是否需要 MCP 取决于目标：如果只是维护 Markdown，直接文件读写足够；如果需要搜索、frontmatter、标签、双链和 Obsidian 插件能力，再接 MCP。

| 项目 | 类型 | 优点 | 风险或限制 | 初步建议 |
|---|---|---|---|---|
| `MarkusPfundstein/mcp-obsidian` | Python MCP | 星标高；通过 Obsidian REST API community plugin 访问 vault；适合标准 MCP 客户端。 | 需要安装并运行 Obsidian REST API 插件；本地端口和 token 要配置。 | 优先测试。 |
| `coddingtonbear/obsidian-local-rest-api` | Obsidian 插件 + REST/MCP | 插件本身成熟；提供安全 REST API 和 MCP server；适合把 Obsidian 当本地服务。 | 依赖 Obsidian 桌面端和插件配置；需要用户授权本地 API。 | 与上一个项目一起比较。 |
| `bitbonsai/mcpvault` | TypeScript MCP | 轻量、安全访问 Obsidian vault；适合只开放必要读写能力。 | 功能可能少于完整 Obsidian 插件方案。 | 适合做“最小可用”方案。 |
| `cyanheads/obsidian-mcp-server` | TypeScript MCP | 支持读写、搜索、精确编辑、tags 和 frontmatter；STDIO/HTTP 都可选。 | 写入能力强，测试时要先 dry-run 或用测试 vault。 | 适合需要结构化编辑的方案。 |
| `aaronsb/obsidian-mcp-plugin` | Obsidian 插件 + MCP | 强调 semantic operations 和知识图谱，适合高级检索。 | 需要验证索引和语义搜索效果；插件方案复杂度更高。 | 作为高级检索候选。 |

建议放置位置：

- `extra/knowledge-bases/obsidian/`
- 后续重点补充 vault 目录约定、frontmatter 字段、文献笔记模板和测试 vault。

## 文献引用候选

### BibTeX / JabRef 兼容模式

JabRef 用户不需要额外连接 JabRef 桌面端。更稳的路线是把引用管理后端定义为 BibTeX：AI 生成或更新 `.bib` / BibLaTeX 文件，维护 citation key、PDF `file` 字段和去重字段；JabRef 只作为可选 GUI 打开和校验 `.bib`。该方案只放在 `extra/` 中，作为不使用 Zotero 时的备选接口。本仓库已提供开箱即用规范和模板：

- `extra/reference-managers/jabref/bibtex-backend.example.json`
- `extra/reference-managers/jabref/bibtex-jabref-standard.md`

| 项目 | 类型 | 优点 | 风险或限制 | 初步建议 |
|---|---|---|---|---|
| `JabRef/jabref` | 官方 Java 桌面应用 | 正统 BibTeX/BibLaTeX 管理器；`.bib` 文件可版本控制；适合 LaTeX 和 GitHub。 | 不是 MCP server；不应作为主流程强依赖。 | 作为可选人工校验工具。 |
| `papis/papis` | CLI 文档和文献管理器 | 命令行友好；可扩展；支持 DOI、Crossref、BibTeX 等生态；适合 AI 调用。 | 不是 JabRef，但可以和 `.bib` / PDF 文件夹共存；需要设计同步边界。 | 若想要 CLI 自动化，可作为 JabRef 的桥接层。 |
| `JabRef/JabRef-Browser-Extension` | 浏览器导入扩展 | 适合从网页导入条目到 JabRef。 | 主要是人工浏览器工作流，不适合无头自动化。 | 作为人工补充工具。 |
| `hunter-heidenreich/academic-tools-mcp` | 学术检索 MCP | 可查 OpenAlex、arXiv、Crossref 等并补元数据。 | 不是引用管理器；不能直接管理 JabRef 库。 | 可作为补元数据工具。 |
| `mlava/scholar-sidekick-mcp` | 标识符解析和引用格式 MCP | 可按 DOI/PMID/arXiv 等输出多种引用格式。 | 不是 JabRef 管理接口。 | 可用于生成 BibTeX/CSL，再写入 `.bib`。 |

建议放置位置：

- `extra/reference-managers/jabref/`
- 后续优先测试 `.bib` 读写、重复 key 检查、PDF `file` 字段、JabRef 打开后的兼容性。

### EndNote

EndNote 更适合被当成“导入导出目标”，而不是实时 AI 后端。当前没有找到成熟、主流、直接面向 EndNote 桌面端的 MCP server。较现实的方式是让主流程输出 RIS、EndNote XML 或 BibTeX，然后由用户导入 EndNote；或者用转换库生成 EndNote XML。

| 项目 | 类型 | 优点 | 风险或限制 | 初步建议 |
|---|---|---|---|---|
| `chugit/EndNote_Chinese_Literature` | 中文 EndNote 类型、过滤器、样式 | 对中文文献、学位论文、双语引用有价值。 | 不是自动化接口；偏配置和样式资源。 | 作为中文 EndNote 兼容资料。 |
| `summonr/reference-js` | Node.js 引文格式转换库 | 支持 BibTeX、EndNote XML、JSON 等格式转换；适合做导出桥。 | 项目较小且更新不算频繁；需要测试转换质量。 | 优先作为 EndNote XML 转换候选。 |
| `collective/bibliograph.parsing` | Python 文献格式解析 | 支持 bibtex、endnote、medline、RIS、MODS 等解析。 | 项目较老；需要测试 Python 版本兼容。 | 可作为解析参考，不建议直接依赖前先测试。 |
| `collective/bibliograph.rendering` | Python 文献格式渲染 | 可渲染 bibtex、endnote、RIS 等格式。 | 项目较老；生态活跃度有限。 | 与 parsing 成对评估。 |
| `Mohamed-Elnahla/Endnote-Library-Generator` | PDF 到 EndNote XML 生成工具 | 扫描 PDF、识别 DOI、用 Crossref 取元数据，并生成 EndNote XML。 | 星标低；场景窄；需要严格测试准确率。 | 可作为思路参考或小范围试验。 |

建议放置位置：

- `extra/reference-managers/endnote/`
- 后续重点测试 RIS/EndNote XML 导入、附件路径保留、中文题名/作者/期刊字段是否丢失。

## 测试方案建议

每个平台测试时建议固定使用同一批测试资料：

- 3 篇英文 PDF：含 DOI、无 DOI、arXiv 预印本各一篇。
- 2 篇中文 PDF：中文期刊和学位论文各一篇。
- 1 条网页资料：含标题、URL、访问日期。
- 1 条手工补录条目：用于测试缺失元数据时的编辑能力。

每个平台至少记录：

- 安装命令和版本；
- 需要的环境变量或本地路径；
- 是否支持只读 dry-run；
- 是否支持新增、搜索、更新、删除或导出；
- 是否能保留 PDF 附件路径；
- 是否能输出稳定的 citation key；
- 是否能被 Codex、TraeSolo、WorkBuddy 等 AI 代理通过 MCP/CLI/文件接口调用；
- 失败时是否会污染真实知识库或真实文献库。

## 当前结论

短期最稳的扩展路线：

1. `Obsidian + JabRef`：本地文件优先，最适合 GitHub、AI 代理和可复现流程。
2. `Notion + JabRef`：适合云端笔记和本地引用库混合。
3. `NotebookLM + JabRef`：适合强化 AI 阅读，但 NotebookLM 自动化稳定性必须先测。
4. `Obsidian + EndNote`：适合需要 Word/EndNote 写作的人，但 EndNote 部分建议只做导入导出。

不建议一开始就把所有平台都写进主流程。更稳妥的做法是先在 `extra/` 中完成单平台连接测试，再把通过测试的平台抽象成统一的 `knowledge_backend` 或 `reference_backend`。
