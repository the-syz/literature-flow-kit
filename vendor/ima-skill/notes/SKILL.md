# IMA 笔记

接口根路径：`openapi/note/v1`。完整字段和响应结构见 `references/api.md`。

> 写入类操作前必须确认 `content`、`title` 等字符串是合法 UTF-8。非法编码会导致 IMA 中出现不可逆乱码。

## 接口决策表

| 用户意图 | 调用接口 |
| --- | --- |
| 搜索或查找笔记 | `search_note` |
| 查看笔记本列表 | `list_notebook` |
| 列出某个笔记本中的笔记 | `list_note` |
| 读取笔记正文 | `get_doc_content` |
| 新建笔记 | `import_doc` |
| 追加到已有笔记 | `append_doc` |

## 新建和追加的边界

- 用户明确说“新建”“创建”“写一篇笔记”时，调用 `import_doc`。
- 用户明确说“追加到”“加到某篇笔记末尾”时，调用 `append_doc`。
- 用户只说“帮我记一下”“保存为笔记”“添加到笔记里”时，必须先确认是新建还是追加。
- `append_doc` 会修改现有笔记，目标笔记不明确时不得自行猜测。

## 本地图片

`import_doc` 和 `append_doc` 的 `content` 字段只支持 Markdown 文本，不支持上传本地图片。

写入前必须：

- 移除 `file:///...`、绝对路径、Windows 路径等本地图片引用；
- 保留 `http://` 或 `https://` 网络图片；
- 告知用户哪些本地图片被过滤。

## 常用流程

### 查找并阅读笔记

```bash
ima_api "openapi/note/v1/search_note" '{"search_type":0,"query_info":{"title":"会议纪要"},"start":0,"end":20}'
ima_api "openapi/note/v1/get_doc_content" '{"note_id":"目标note_id","target_content_format":0}'
```

### 列出笔记

```bash
ima_api "openapi/note/v1/list_note" '{"folder_id":"","sort_type":0,"cursor":"","limit":20}'
```

### 浏览笔记本

```bash
ima_api "openapi/note/v1/list_notebook" '{"cursor":"0","limit":20}'
ima_api "openapi/note/v1/list_note" '{"folder_id":"目标folder_id","cursor":"","limit":20}'
```

### 新建笔记

```bash
ima_api "openapi/note/v1/import_doc" '{"content_format":1,"content":"# 标题\n\n正文内容"}'
```

### 追加内容

```bash
ima_api "openapi/note/v1/append_doc" '{"note_id":"笔记ID","content_format":1,"content":"\n## 补充内容\n\n追加的文本"}'
```

## 响应字段

- `SearchNoteInfo[].note_book_info.note_id`：搜索结果中的笔记 ID。
- `NoteBookInfo.note_id`：笔记列表中的笔记 ID。
- `NoteFolderInfo.folder_id`：笔记本 ID。
- `import_doc` 和 `append_doc` 成功后返回 `note_id`。

## 分页

- `list_notebook` 首次 `cursor` 传 `"0"`。
- `list_note` 首次 `cursor` 传空字符串。
- `search_note` 使用 `start`、`end` 偏移量。
- 响应 `is_end=true` 时停止翻页。

## 枚举值

- `content_format`：`0` 纯文本，`1` Markdown，`2` JSON。写入目前使用 `1`。
- `search_type`：`0` 标题检索，`1` 正文检索。
- `sort_type`：`0` 更新时间，`1` 创建时间，`2` 标题，`3` 大小。
- `folder_type`：`0` 用户自建，`1` 全部笔记，`2` 未分类。

## 隐私和展示

- 笔记内容属于用户隐私，群聊或共享场景中只展示标题、摘要和修改时间。
- 不要主动展示完整正文，除非用户明确要求读取。
- 面向用户展示时隐藏内部 ID。

## 错误处理

| 错误码 | 含义 | 建议处理 |
| --- | --- | --- |
| 100001 | 参数错误 | 检查请求参数和必填字段 |
| 100002 | 无效 ID | 检查凭证和目标 ID |
| 100003 | 服务器内部错误 | 等待后重试 |
| 100004 | size 不合法或空间不足 | 检查大小限制 |
| 100005 | 无权限 | 确认操作对象归属当前用户 |
| 100006 | 笔记已删除 | 告知用户该笔记不存在 |
| 100008 | 版本冲突 | 重新获取内容后再写入 |
| 100009 | 超过大小限制 | 拆分为多次 `append_doc` |
| 310001 | 笔记本不存在 | 检查 `folder_id` |
| 20002 | API key 超过限频 | 等待后重试 |
| 20004 | API key 鉴权失败 | 检查凭证 |
