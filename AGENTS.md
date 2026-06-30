# AI 代理入口说明

这个仓库可以直接交给 Codex、TraeSolo 或其他 AI 代理，用于配置和执行文献整理流程。

## 首先读取

1. `README.md`
2. `skills/literature-organizer/SKILL.md`
3. `docs/setup.md`
4. `config/workflow_config.example.json`

## 配置前置约定

在执行任何真实写入前，必须向用户确认或读取以下本地配置：

- 临时存放区路径；
- 推荐文献和自行查找文献的本地归档目录；
- IMA 知识库名称和 ID；
- IMA 文章索引笔记 ID；
- Zotero 用户 ID 和 API key；
- 如需本地 Zotero 辅助脚本，确认脚本路径。

不得提交、打印或复述完整凭证。

## 本地检查顺序

先运行离线体检：

```powershell
node scripts/doctor.cjs
```

确认本地配置和凭证已填写后，再运行需要本机环境的检查：

```powershell
python integrations/zotero-mcp/scripts/smoke_mcp.py --server zotero --list-tools
node skills/ima-skill/harness/preflight.cjs
```

## 主流程

实际整理文献时使用 `skills/literature-organizer/SKILL.md`。`skills/ima-skill` 和 `skills/zotero` 是配套组件，不应绕过主流程中的 harness 约束。
