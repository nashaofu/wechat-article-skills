# 文章文件规范

完整文章包建议将 HTML 放在文章目录根部，图片放在其子目录，避免 HTML 通过 `..` 引用图片：

```text
drafts/example-topic/
├── article.json
├── article.md
├── article.html
├── review.md
└── media/
    ├── cover.jpg
    └── figure-01.png
```

`article.json` 的最小完整示例：

```json
{
  "$schema": "https://raw.githubusercontent.com/nashaofu/wechat-article-skills/master/schemas/article.schema.json",
  "title": "文章标题",
  "author": "",
  "digest": "与正文一致的摘要",
  "content_source_url": "",
  "markdown": "article.md",
  "html": "article.html",
  "cover": "media/cover.jpg",
  "images": ["media/figure-01.png"]
}
```

示例中的 `$schema` 是 CLI 要求的固定标识，准备清单不需要下载该 URL。所有字段均须提供，不增加其他顶层字段：

- `title`、`digest` 为非空字符串；摘要长度按 CLI 的 JavaScript 字符串长度计算，不超过 128。
- `author` 为字符串；使用用户提供或已确认的署名，未知时留空，不虚构作者。
- `content_source_url` 为空字符串或完整 HTTPS URL，不含首尾空白；它是文章的原文链接，不是参考资料列表，不擅自填入某篇参考来源。
- `markdown`、`html`、`cover` 为非空相对文件路径；`images` 为正文图片路径数组，没有正文图片时用 `[]`。

清单中的路径相对于 `article.json` 所在目录，必须指向该目录内真实存在的文件，不使用绝对路径、`..` 或指向目录外的符号链接。Markdown、HTML 均须有正文。HTML 中的本地图片路径相对于 HTML 文件，必须对应 `images` 中的文件；不使用 `..`、绝对路径、查询参数或片段。示例 HTML 可写 `<img src="media/figure-01.png" alt="图示说明">`。详细图片约束见[排版与图片](layout-images.md)。

运行同步时，工作目录应为文章所在工作区，`--dir` 指向该工作区内的文章目录。若 CLI 位于其他 checkout，使用指向其 `dist/index.js` 的绝对路径，仍从文章工作区运行；不要把文章目录外的仓库当作工作目录。

`service.json` 由 CLI 首次同步创建和持续维护，不由 Agent 预填或修改。它保存 `$schema`、AppID 的 SHA-256 `account_hash`、封面素材记录、正文图片记录、`draft_media_id` 和 `draft_status` 等信息，不保存 AppSecret 或 access token。图片记录按内容哈希复用。账号不匹配、旧记录缺少账号绑定或远端结果不明时，按[草稿同步](draft.md)停止并核实，不通过修改状态文件绕过阻断。

`review.md` 是完整创作的评审报告，格式见[编辑与审校](editorial.md)。CLI 不读取评审和研究笔记；单项任务按请求交付，不强制准备完整文章包。
