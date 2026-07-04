# BibTeX / JabRef 兼容扩展

本扩展是不用 Zotero 主方案时的备选接口，不连接 JabRef 桌面端，也不要求 JabRef MCP。AI 只负责生成和维护 JabRef 可读取的 `.bib` / `.biblatex` 文件、citation key 和 PDF 附件路径；JabRef 只是用户后续人工查看、编辑和校验 `.bib` 的可选工具。

开箱即用入口：

- `bibtex-jabref-standard.md`：完整规范，说明目录、字段、citation key、file 字段、AI 执行步骤和验证方法。
- `bibtex-backend.example.json`：本目录下的最小配置模板。

推荐模式：

```text
reference_backend.type = bibtex
reference_backend.mode = jabref-compatible
```

用户只需要向 AI 提供：

- 文献工作区根目录；
- `.bib` 文件路径；
- PDF 归档目录；
- citation key 规则，如果不提供则使用 `author_year_shorttitle`。

候选项目和替代方案详见 `extra/README.md` 的 JabRef 小节。
