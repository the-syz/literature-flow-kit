# Codex 技能安装与自动化配置

本文档面向人和 AI 代理，说明如何把本仓库的文献整理流程安装到 Codex，并配置每日自动化任务。目标是让自动化稳定执行固定脚本，而不是让模型每次临场重写流程。

## 1. 总体原则

- 不要修改用户原有的 Trae skill。若用户已有 `<literature_root>/.trae/skills/literature-organizer`，Codex 只读取它作为参考，不应覆盖、重命名或删除。
- Codex 应使用自己的 skill 副本，默认安装到 `<codex_home>/skills/`。
- 自动化任务应调用固定 runner，例如从 `<repo>/automation/runners/run-literature-organizer.example.cjs` 复制出的正式脚本，不要只写自然语言提示让 AI 自行发挥。
- 日志必须写到稳定目录，例如 `<logs_dir>`，并且每次运行生成独立的 `.log` 和 `.records.json`。
- Zotero 本地写入优先使用 Zotero Connector local API，Web API 只能作为补充检查，不应作为本地自动化成功的唯一判据。
- IMA 上传、Zotero 写入和本地归档都应有末尾验收；任一外部服务失败时，应在记录中标为 pending 或 failed，而不是假装成功。

## 2. 推荐目录

以下路径是当前项目约定，可按本机实际情况替换：

```text
<literature_root>/
  临时存放区\                         # 待归档论文输入目录
  自己提前找的一些文献\               # 自行查找文献归档目录
  推荐文献\                           # 推荐文献归档目录，如启用
  日志\                               # 自动化日志目录
  automation\
    prompts\
      literature-organizer.prompt.example.md
    runners\
      run-literature-organizer.example.cjs
  .trae\skills\literature-organizer\   # 用户原 Trae skill，不要修改

<codex_home>/
  skills\
    literature-organizer\              # Codex-owned 主流程 skill
    ima-skill\                         # Codex-owned IMA skill
  automations\
    automation-2\automation.toml       # Codex 自动化配置示例
```

AI 代理在执行前应先确认这些目录存在。缺失时，只能创建项目工作区内的运行目录，例如 `automation/runners`、`automation/prompts` 和 `日志`；不要自动改动 `.trae` 目录。

## 3. 安装 Codex-owned skills

### 3.1 安装目标

Codex 自动化应依赖以下两个本地 skill：

```text
<codex_home>/skills/literature-organizer
<codex_home>/skills/ima-skill
```

其中：

- `literature-organizer` 编排扫描、去重、归档、IMA 上传、Zotero 写入和验收；
- `ima-skill` 提供 IMA OpenAPI harness、知识库查询、文件上传、笔记索引和预检。

### 3.2 来源选择

优先从本仓库复制：

```text
<repo>\skills\literature-organizer
<repo>\skills\ima-skill
```

如果用户要求参考 Trae skill，只能复制到 Codex-owned 目录后再修改副本。不要直接编辑：

```text
<literature_root>/.trae/skills/literature-organizer
```

### 3.3 安装检查

安装后至少检查：

```powershell
Test-Path <codex_home>\skills\literature-organizer\SKILL.md
Test-Path <codex_home>\skills\ima-skill\SKILL.md
```

AI 代理还应读取 `SKILL.md`，确认主流程仍要求：

- 使用本地配置文件；
- 归档前计算 SHA256；
- 归档编号由脚本扫描生成；
- IMA 和 Zotero 写入后做验收；
- 不绕过 harness。

## 4. IMA 配置要点

IMA 需要真实凭证和本机私有配置。不要打印完整凭证；用户只需提供知识库名称和文章索引笔记名称，AI 负责查询并写入对应 ID。

### 4.1 环境变量

至少需要：

```text
IMA_OPENAPI_CLIENTID
IMA_OPENAPI_APIKEY
```

### 4.2 workflow_config.json

从模板复制：

```text
<repo>\config\workflow_config.example.json
```

到 Codex-owned IMA harness：

```text
<codex_home>/skills/ima-skill/harness/workflow_config.json
```

应填写：

- `paths.intake_dir`：临时存放区；
- `paths.self_collected_archive_dir`：自行查找文献归档目录；
- `paths.recommended_archive_dir`：推荐文献归档目录，如启用；
- `archive_numbering.archive_dir`：编号扫描目录；
- `knowledge_base_mapping`：AI 根据用户提供的 IMA 知识库名称查询后写入名称到 ID 的映射；
- `ima_note_index.note_id`：AI 根据用户提供的文章索引笔记名称查询后写入；
- `logging.log_dir`：日志目录。

### 4.3 IMA 预检

配置完成后运行：

```powershell
node <codex_home>/skills/ima-skill/harness/preflight.cjs --list-kb
```

验收标准：

- 能列出目标知识库；
- 目标知识库名称可解析，且解析出的 ID 与配置一致；
- 失败时先修凭证、网络或配置，不要继续真实归档。

## 5. Zotero 配置要点

Codex 自动化应区分 Zotero 本地接口和 Web API。

### 5.1 本地接口

Zotero Desktop 运行后，默认本地地址为：

```text
http://127.0.0.1:23119
```

基础检查：

```powershell
Invoke-WebRequest http://127.0.0.1:23119/connector/ping
Invoke-WebRequest http://127.0.0.1:23119/api/schema
Invoke-WebRequest "http://127.0.0.1:23119/api/users/0/items/top?limit=1"
```

要点：

- `/api/users/0/...` 适合本地读取；
- 本地写入应使用 connector endpoint，例如 `/connector/saveItems`；
- 自动化创建 index-only 条目时，不应附加 PDF；
- `extra` 字段必须写在主 item 上。

### 5.2 Web API 的边界

Zotero Web API 需要：

```text
ZOTERO_API_KEY
ZOTERO_USER_ID
```

但本地自动化不要依赖 Web API 判断写入是否成功。原因是 Web API 可能因为同步延迟、权限、网络或服务端错误返回 404/502，而本地 Zotero 已经成功写入。

推荐策略：

- 写入：用 `/connector/saveItems`；
- 验收：优先查本地 Zotero 数据；
- Web API：只作为额外诊断，不作为唯一成功条件。

### 5.3 Zotero index-only 字段

Zotero 条目应保存索引元数据，不保存附件。`extra` 建议包含：

```text
Local-Path: <final archived PDF path>
SHA256: <file sha256>
Archive-No: <archive number>
IMA-KB: <knowledge base name or id>
IMA-Media-ID: <ima media id>
IMA-Status: uploaded|pending|failed
Managed-By: codex-literature-organizer
```

去重时不要只凭标题阻止写入。更稳妥的规则是：

- SHA256 相同：视为同一文献；
- DOI 相同：视为强重复候选；
- 只有标题相同但没有匹配 SHA256：不能直接阻止创建带完整 `extra` 的 index item。

## 6. 固定 runner

仓库提供固定 runner 示例：

```text
<repo>/automation/runners/run-literature-organizer.example.cjs
```

该文件默认是示例 runner，只做基础检查和日志写入，不执行真实归档。配置真实自动化时，应复制为正式脚本，例如：

```text
<literature_root>/automation/runners/run-literature-organizer.cjs
```

正式 runner 应负责：

- 读取 Codex-owned skills；
- 扫描 `临时存放区`；
- 跳过已处理、重复或不支持的文件；
- 提取 PDF 文本和元数据；
- 生成保守摘要和标签；
- 计算 SHA256；
- 分配归档编号；
- 复制或移动到最终归档路径；
- 上传 IMA；
- 创建或校验 Zotero index-only item；
- 写入 `.log` 和 `.records.json`；
- 在没有待处理文件时也写空运行日志。

语法检查：

```powershell
node --check <literature_root>/automation/runners/run-literature-organizer.cjs
```

手动试运行：

```powershell
node <literature_root>/automation/runners/run-literature-organizer.cjs
```

注意：手动试运行会真实归档、上传 IMA、写 Zotero。测试前应使用公开可下载、可重复处理的测试论文，并确认临时存放区没有用户不希望处理的文件。

## 7. Codex 自动化配置

仓库提供 Codex 自动化配置模板：

```text
<repo>/config/codex-automation.example.toml
```

复制为实际自动化配置后，再填入本机路径。Codex 自动化配置位于：

```text
<codex_home>/automations/<automation-id>/automation.toml
```

推荐配置要点：

```toml
version = 1
id = "automation-2"
kind = "cron"
name = "每日文献归档（固定脚本）"
status = "ACTIVE"
rrule = "DTSTART;TZID=Asia/Shanghai:20260704T040000\nRRULE:FREQ=DAILY;BYHOUR=4;BYMINUTE=0;BYSECOND=0"
execution_environment = "local"
cwds = ["<literature_root>"]
```

`prompt` 中必须明确写入：

```text
必须执行：node "<literature_root>/automation/runners/run-literature-organizer.cjs"
```

同时写清楚：

- 可参考 `<repo>/automation/prompts/literature-organizer.prompt.example.md`；
- 使用 `<codex_home>/skills/literature-organizer`；
- 使用 `<codex_home>/skills/ima-skill`；
- 不修改、不安装、不依赖原始 Trae skill；
- 输入目录是 `<intake_dir>`；
- 日志目录是 `<logs_dir>`；
- Zotero local API 是 `http://127.0.0.1:23119`；
- 运行结束报告处理数量、跳过原因、IMA 状态、Zotero 状态和日志路径。

如果存在旧自动化，应将旧任务设为 `PAUSED`，保留回滚，不要让两个任务同时处理同一临时存放区。

## 8. 日志与记录

推荐日志目录：

```text
<logs_dir>
```

每次运行至少生成：

```text
literature-organizer-YYYYMMDD-HHmmss.log
literature-organizer-YYYYMMDD-HHmmss.records.json
```

`.log` 面向人阅读，应包含：

- 启动时间；
- runner 路径；
- 输入目录；
- 每个文件的处理状态；
- 跳过原因；
- IMA 上传结果；
- Zotero 写入结果；
- 验收结果。

`.records.json` 面向 AI 和程序读取，应包含：

- 原始文件路径；
- 归档路径；
- SHA256；
- archive number；
- title、authors、year、doi；
- tags、summary；
- `ima_status`、`ima_media_id`；
- `zotero_status`、`zotero_key`；
- `verify_status`；
- error 或 warning。

清理日志时，只删除确认属于 runner 的文件，例如：

```powershell
Get-ChildItem <logs_dir> -File |
  Where-Object { $_.Name -match '^literature-organizer-\d{8}-\d{6}\.(log|records\.json)$' } |
  Remove-Item -Force
```

不要删除用户手写日志或其他工具日志。

## 9. 验收清单

安装和自动化完成后，按以下顺序验收：

1. 原 Trae skill 仍存在且未被修改。
2. Codex-owned `literature-organizer` 和 `ima-skill` 均存在。
3. `workflow_config.json` 指向正确的临时存放区、归档目录、IMA 知识库和日志目录。
4. `node --check run-literature-organizer.cjs` 通过。
5. Zotero Desktop 已打开，`/connector/ping` 可访问。
6. IMA `preflight.cjs --list-kb` 能列出目标知识库。
7. 自动化 TOML 中只有一个 ACTIVE 的每日文献归档任务。
8. ACTIVE 任务的 rrule 是每天 04:00，时区为 Asia/Shanghai。
9. ACTIVE 任务 prompt 明确调用固定 runner。
10. 手动测试运行后，本地归档、IMA 上传、Zotero index-only 写入和本地验收均通过。

一次成功记录通常应呈现：

```text
status=archived
ima_status=uploaded
zotero_status=created 或 updated
verify_status=passed
```

## 10. 常见问题

### Zotero Web API 失败，但本地 Zotero 成功

这通常不是归档失败。优先检查本地 Zotero 是否已有正确 item，并确认 `extra` 中的 `SHA256`、`Local-Path`、`Archive-No` 和 `IMA-Media-ID` 是否完整。

### 有无重复文献被跳过

先看 `.records.json` 的跳过原因。合理跳过应基于 SHA256、DOI 或已有归档记录。若只因标题相似跳过，应视为过度去重，需要修正规则。

### IMA 上传失败

先运行：

```powershell
node <codex_home>/skills/ima-skill/harness/preflight.cjs --list-kb
```

再检查 `workflow_config.json` 中由 AI 解析出的知识库 ID、笔记 ID 和凭证。不要因为 IMA 失败而删除本地归档，应记录为 pending 或 failed。

### 日志被删除后如何排查

日志删除后不能还原历史细节。应从当前状态排查：

- 临时存放区是否还有测试文件；
- 归档目录是否已有目标 PDF；
- Zotero 本地是否已有带 SHA256 的 item；
- IMA 是否能通过 media ID 或知识库检索到文件；
- runner 是否仍能生成新的空运行日志。

### 自动化没有运行

检查：

- 自动化状态是否为 `ACTIVE`；
- rrule 是否为目标时间；
- `cwds` 是否指向 `<literature_root>`；
- prompt 是否包含固定 runner；
- 本机是否在计划时间开机且 Codex 自动化服务可运行；
- Zotero Desktop 是否在需要写入前已打开。

## 11. 给 AI 代理的执行提示

当用户要求在 Codex 配置该流程时，AI 应：

1. 读取 `README.md`、`AGENTS.md`、`docs/setup.md` 和本文档。
2. 确认不会修改 `.trae\skills\literature-organizer`。
3. 安装或更新 Codex-owned skill 副本。
4. 检查 IMA 配置和 Zotero 本地连接。
5. 创建或修正固定 runner。
6. 创建或更新 Codex automation，使其每天 04:00 调用固定 runner。
7. 暂停旧的重复自动化。
8. 用一篇可公开下载的测试论文做手动验收。
9. 清理测试日志或说明保留原因。
10. 向用户报告 ACTIVE 自动化 ID、runner 路径、日志目录和最后一次验收结果。

不要在没有说明的情况下反复跑真实归档；每次真实运行都可能写入 IMA 和 Zotero。
