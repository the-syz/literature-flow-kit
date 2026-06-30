---
name: ima-skill
description: 当文献整理流程需要 IMA OpenAPI 操作时使用：凭证预检、知识库解析、重复检查、文件上传、文章索引笔记追加，或校验 IMA 记录与 Zotero/本地归档的一致性。触发词包括 IMA、知识库、资料库、笔记索引、上传文件到知识库、追加文章记录。
---

# IMA 组件

本 skill 是文献整理流程中的 IMA 组件。它通过 `harness/workflow_config.json` 读取本机配置，使仓库下载后只需复制模板并填写本地路径和 ID 即可使用。

## 配置

1. 将 `config/workflow_config.example.json` 复制为 `skills/ima-skill/harness/workflow_config.json`。
2. 填写本机临时存放区、归档目录、IMA 知识库 ID、文章索引笔记 ID 和日志目录。
3. 通过环境变量或本机配置文件提供凭证：
   - `IMA_OPENAPI_CLIENTID`
   - `IMA_OPENAPI_APIKEY`
4. 不要提交真实凭证、真实日志、个人知识库导出或本机私有配置。

## IMA helper

默认配置使用 `vendor/ima-skill`，其中包含 IMA API wrapper 和上传脚本。若本机已有更新版全局 IMA skill，可设置 `IMA_SKILL_DIR`，或修改 `workflow_config.json` 中的 `global_ima_skill_dir`。

## harness 命令

```powershell
node skills/ima-skill/harness/preflight.cjs
node skills/ima-skill/harness/preflight.cjs --list-kb
node skills/ima-skill/harness/dedup_check.cjs --file "path/to/paper.pdf" --kb-name "知识库名称"
node skills/ima-skill/harness/upload_pdf.cjs --file "path/to/paper.pdf" --kb-name "知识库名称"
node skills/ima-skill/harness/verify_workflow.cjs --file "path/to/paper.pdf" --zotero-key "ITEMKEY" --media-id "MEDIAID"
```

## 上传安全门

`upload_pdf.cjs` 强制执行：

- 文件类型和大小检查；
- IMA title 必须等于文件名；
- 上传前重复文件名检查；
- COS 上传成功后才允许调用 `add_knowledge`；
- `add_knowledge` 成功后才返回 uploaded 状态。

## 文章索引笔记

使用 `workflow_config.json` 的 `ima_note_index` 定义：

- 笔记名称；
- 笔记 ID；
- 追加格式；
- 是否追加后核验。

如果笔记 ID 缺失或仍是占位符，不要追加；先要求用户补齐配置。

## 失败处理

- 缺少凭证：停止 IMA 写入，并报告配置方式。
- 网络失败：保留本地归档，记录待重试状态。
- IMA 重复：按 `dedup_strategy` 执行。
- 文件类型不支持：跳过 IMA 上传，标记 `skipped-unsupported-type`。

面向用户的报告必须写明失败 gate，并保留足够记录供后续重试。
