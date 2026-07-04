# 自动化模板说明

本目录存放可公开提交的自动化示例文件，供 Codex、TRAE Work、WorkBuddy 或其他 AI 代理配置文献整理任务时参考。

## 文件关系

- `prompts/literature-organizer.prompt.example.md`：自动化任务的统一 prompt 模板。
- `runners/run-literature-organizer.example.cjs`：固定 runner 示例，说明自动化脚本应如何组织检查、日志和 harness 调用。
- `../config/codex-automation.example.toml`：Codex 自动化任务 TOML 示例。

## 使用约定

1. 所有 `.example` 文件只作为模板提交，不写真实路径、API key、知识库 ID 或笔记 ID。
2. 如果需要真实自动化 runner，应复制 `run-literature-organizer.example.cjs` 为本机私有或项目内正式脚本，再补齐真实执行逻辑。
3. 自动化 prompt 只能要求从本机环境变量或私有配置读取凭证，不得把完整凭证写入 prompt、日志或报告。
4. 真正执行前必须先通过 `node scripts/doctor.cjs` 和 IMA / Zotero 的 live 预检。

## 推荐接入方式

- Codex：参考 `config/codex-automation.example.toml`，将正式 runner 路径填入自动化配置。
- TRAE Work：在自动化任务内容中引用 `prompts/literature-organizer.prompt.example.md` 的结构。
- WorkBuddy：在自动化 prompt 中保留 IMA 托管连接器和 Zotero 直连 / MCP 备选策略。
