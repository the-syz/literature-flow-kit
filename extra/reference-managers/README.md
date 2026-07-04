# 文献引用管理扩展

本目录用于存放 Zotero 之外的引用管理后端连接方案。

当前预留平台：

- `jabref/`：BibTeX / JabRef 兼容方案。AI 直接维护 `.bib` / `.biblatex` 文件，JabRef 作为可选人工校验工具。
- `endnote/`：EndNote XML、RIS、中文文献类型、导入导出方案。

每个平台测试通过前，不建议把配置直接并入主流程。主流程应继续通过 `reference_backend` 抽象调用这些扩展。
