---
name: ima-skill
description: 统一的 IMA OpenAPI helper，支持笔记管理和知识库操作。用于上传文件到知识库、添加网页、搜索知识库内容、读取或追加笔记，以及为文献整理流程提供 IMA API wrapper。
---

# IMA OpenAPI helper

这是随仓库携带的 IMA helper，供 `skills/ima-skill/harness/` 调用。它包含：

- `ima_api.cjs`：统一 API 调用入口；
- `knowledge-base/`：知识库上传、搜索、浏览和媒体读取说明；
- `notes/`：笔记搜索、读取、新建和追加说明。

## 强制规则

1. **写入笔记前必须校验 UTF-8**：调用 `import_doc` 或 `append_doc` 前，`content`、`title` 等字符串必须是合法 UTF-8。
2. **上传文件时不得改名**：`add_knowledge` 的 `title` 必须等于 `file_name`，并包含扩展名。
3. **不支持的类型直接拒绝**：视频、Bilibili/YouTube URL、`file://` URL 不通过 skill 添加，应提示用户使用 IMA 客户端。
4. **文件上传保持二进制原样**：PDF、图片、Office 文件等不得做文本编码转换。
5. **PowerShell 5.1 必须显式 UTF-8 字节发送**：不要直接用字符串 body 调 `Invoke-RestMethod`。

## 模块路由

| 用户意图 | 读取 |
| --- | --- |
| 搜索笔记、浏览笔记本、读取笔记、新建笔记、追加内容 | `notes/SKILL.md` |
| 上传文件、添加网页、搜索知识库、浏览知识库、获取媒体原文 | `knowledge-base/SKILL.md` |
| 既涉及知识库又涉及笔记 | 两个子模块都读取 |

常见边界：

- “把这段内容添加到某篇笔记”是笔记追加，走 `notes`。
- “上传文件到知识库”是文件上传，走 `knowledge-base`。
- “把这篇笔记添加到知识库”需要先在 `notes` 中定位笔记，再用 `knowledge-base` 关联。
- “查看知识库里的笔记原文”先用 `knowledge-base` 获取媒体信息，若媒体类型是笔记，再用 `notes` 读取。

## 凭证

IMA 凭证来自环境变量或本机配置文件：

```bash
export IMA_OPENAPI_CLIENTID="your_client_id"
export IMA_OPENAPI_APIKEY="your_api_key"
```

或：

```bash
mkdir -p ~/.config/ima
echo "your_client_id" > ~/.config/ima/client_id
echo "your_api_key" > ~/.config/ima/api_key
```

缺少凭证时，`node ima_api.cjs ...` 会以非 0 退出，并在 stderr 输出结构化错误。

## API 调用模板

所有请求为 HTTP POST + JSON body，仅发往 `https://ima.qq.com`。

```bash
node vendor/ima-skill/ima_api.cjs "openapi/wiki/v1/get_addable_knowledge_base_list" '{"cursor":"","limit":20}' '{}'
```

返回有两层错误：

- 进程非 0：脚本层错误，例如缺少凭证、参数非法、网络失败。
- 进程为 0 但响应 `code != 0`：后端业务错误，直接把 `msg` 展示给用户。

## UTF-8 写入规则

写入笔记前，必须对来自文件、网页、剪贴板、外部 API 或用户输入的正文进行 UTF-8 校验。文件上传不适用该规则，上传文件必须保持二进制原样。

Node.js 示例：

```bash
content=$(node -e "const fs=require('fs');const buf=fs.readFileSync('tmpfile');process.stdout.write(buf.toString('utf8'))")
```

PowerShell 5.1 请求 body 必须转成 UTF-8 字节数组：

```powershell
$body = @{ title = "标题"; content = $content; content_format = 1 } | ConvertTo-Json -Depth 10
$utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
Invoke-RestMethod -Uri $url -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" -Headers $headers
```

## 更新检查

`ima_api.cjs` 内置更新检查。若返回 `code=-200`，表示发现新版本且原请求未发送；根据 stdout 中的更新说明处理后再重试。若需要强制检查：

```bash
export IMA_FORCE_UPDATE_CHECK=1
```
