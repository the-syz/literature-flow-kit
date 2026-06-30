# IMA 知识库

接口根路径：`openapi/wiki/v1`。完整字段和响应结构见 `references/api.md`。

## 接口决策表

| 用户意图 | 调用接口 |
| --- | --- |
| 上传文件到知识库 | `check_repeated_names` -> `create_media` -> COS 上传 -> `add_knowledge` |
| 上传文件到指定文件夹 | 先定位 `folder_id`，再走上传文件流程 |
| 添加网页或微信公众号文章 | `import_urls` |
| 添加笔记到知识库 | `add_knowledge`，`media_type=11` |
| 搜索知识库内容 | `search_knowledge` |
| 搜索知识库列表 | `search_knowledge_base` |
| 查看可添加的知识库 | `get_addable_knowledge_base_list` |
| 浏览知识库或文件夹 | `get_knowledge_list` |
| 获取知识库信息 | `get_knowledge_base` |
| 查看、分析、导出原文 | `get_media_info` |

如果用户已经明确给出知识库名称，用 `search_knowledge_base` 定位；如果用户没有指定目标知识库，用 `get_addable_knowledge_base_list` 展示可选项，不要猜测。

## 文件上传安全门

只要是文件上传到知识库，必须按顺序执行：

1. **类型检查**：先运行 `knowledge-base/scripts/preflight-check.cjs`。不支持的类型立即拒绝。
2. **重名检查**：调用 `check_repeated_names`。重复时按上层策略追加时间戳或取消，不支持替换。
3. **创建媒体**：调用 `create_media`，取得 `media_id` 和 COS 临时凭证。
4. **COS 上传**：运行 `knowledge-base/scripts/cos-upload.cjs`。进程非 0 时立即停止，不得调用 `add_knowledge`。
5. **添加知识**：调用 `add_knowledge`，其中 `title` 必须等于 `file_name`。

## 上传命令模板

```bash
node vendor/ima-skill/knowledge-base/scripts/preflight-check.cjs --file "/path/to/report.pdf"
```

`preflight-check.cjs` 返回 `file_name`、`file_ext`、`file_size`、`media_type`、`content_type`。后续用这些字段调用 IMA API。

COS 上传模板：

```bash
node vendor/ima-skill/knowledge-base/scripts/cos-upload.cjs \
  --file "/path/to/report.pdf" \
  --secret-id "<cos_credential.secret_id>" \
  --secret-key "<cos_credential.secret_key>" \
  --token "<cos_credential.token>" \
  --bucket "<cos_credential.bucket_name>" \
  --region "<cos_credential.region>" \
  --cos-key "<cos_credential.cos_key>" \
  --content-type "<content_type>" \
  --start-time "<cos_credential.start_time>" \
  --expired-time "<cos_credential.expired_time>" \
  --timeout 300000
```

## URL 处理

- 普通网页和微信公众号文章使用 `import_urls`。
- 指向 PDF、Word、PPT、Excel 等文件的 URL，应先下载到临时目录，再按文件上传流程处理。
- Bilibili、YouTube 和本地 `file://` URL 不支持通过 skill 添加到知识库。

## 文件夹操作

- 根目录操作通常省略 `folder_id`。
- 不要把 `knowledge_base_id` 当作普通文件夹 ID 使用，除非对应接口明确要求根目录 ID。
- 用户只给文件夹名称时，先用 `search_knowledge` 搜索，或用 `get_knowledge_list` 逐级浏览。

## 查询类操作

查询、浏览、搜索不需要文件上传安全门。所有列表接口按游标分页：首次 `cursor` 传空字符串，之后用响应中的 `next_cursor`，`is_end=true` 时停止。

## 响应处理

IMA 响应统一为：

```json
{ "code": 0, "msg": "...", "data": {} }
```

- `code=0` 表示成功，从 `data` 提取字段。
- `code!=0` 表示业务错误，直接展示 `msg`。

## 展示规则

- 面向用户展示知识库名称、文件名和文件夹名，不主动暴露 `knowledge_base_id`、`media_id`、`folder_id`。
- 批量操作应汇总成功和失败数量。
- 失败时展示具体文件和后端 `msg`。
