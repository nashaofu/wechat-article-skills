# WeChat Article Skill

微信公众号文章创作 Skill 与 draft-only CLI。Agent 负责选题、研究、写作、排版和审校；CLI 只校验最终文件并执行草稿同步。

新文章或整体重写先做必要的初步核验并提交大纲，用户确认后再深入研究和创作。已有文章审校、局部修改、仅排版或仅同步按请求进入对应阶段，复用已确认内容；评审默认只报告问题，修改按用户授权执行。完整创作交付文章文件和 `review.md`，单项任务只交付所请求阶段的结果。

提示词明确要求同步到公众号草稿箱时，该要求即为本次草稿同步的授权，持续有效直到约定的同步操作完成或用户撤回；大纲确认、资料补充、配置补齐无需重述授权。Agent 按该授权创建或更新本篇草稿，无需重复确认；未要求同步时只交付文章。草稿同步只写入草稿箱，不是群发或公开发布。同步结果不明确时先核实公众号后台，不盲目重试。

## 安装与运行

要求 Node.js 20.19+、22.12+ 或 23+，以及 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js --help
```

在仓库根目录可通过 `node dist/index.js <command>` 本地运行 CLI。若希望使用 `wechat-article` 命令，可在仓库根目录运行 `npm install --global .` 安装当前检出的包。CLI 安装不会配置公众号凭据。

先用 `node dist/index.js config status` 检查凭据状态；返回 `missing` 或 `incomplete` 时，运行 `node dist/index.js config init` 配置单个公众号的 AppID 和 AppSecret。凭据保存在用户目录 `~/.wechat-article/config.json`；状态命令不会显示凭据或修改文件。覆盖已有凭据前会单独确认。

## 文章目录

每篇文章一个目录。Agent 编写 `article.json`，CLI 首次同步时创建 `service.json`：

```text
drafts/20261014-example-topic/
├── article.json
├── service.json
├── article.md
├── article.html
├── review.md
└── media/
    ├── cover.jpg
    └── figure-01.png
```

其他文件名和子目录由 Agent 自行安排。完整创作的 `review.md` 由 Agent 交付；CLI 只读取清单引用的定稿、HTML 和图片，不读取评审或其他创作过程文件。Skill 内含独立的[文章文件规范](skills/wechat-article/references/article-files.md)，无需依赖仓库根目录文档。

article.json 是本地文章清单，元数据字段在顶层：

```json
{
  "$schema": "https://raw.githubusercontent.com/nashaofu/wechat-article-skills/master/schemas/article.schema.json",
  "title": "文章标题",
  "author": "作者",
  "digest": "摘要",
  "content_source_url": "",
  "markdown": "article.md",
  "html": "article.html",
  "cover": "media/cover.jpg",
  "images": ["media/figure-01.png"]
}
```

所有清单文件路径相对于本篇目录，必须位于该目录内。HTML 中本地图片的路径相对于 HTML 文件，并且必须出现在 images 清单中；不使用 `..`、绝对路径、查询参数或片段。建议将 HTML 放在文章目录根部、图片放在其子目录。

CLI 在 `service.json` 中记录 AppID 的 SHA-256 摘要、封面素材 ID、正文图片 URL 和草稿 ID。图片内容未变时复用已有素材；此文件不保存 AppSecret 或 access token。旧版状态若已有远端记录但缺少账号摘要，须先核实所属账号并迁移，CLI 不会猜测其归属。

## 同步草稿

```sh
wechat-article draft sync --dir drafts/20261014-example-topic
```

从仓库 checkout 本地运行时，可将命令写为 `node dist/index.js draft sync --dir drafts/20261014-example-topic`。

只有当前文章任务已有未撤回、适用于本次操作的明确同步授权时才执行，不只依据最新一条消息判断授权。首次同步创建草稿并记录微信返回的 media_id；后续同步更新该草稿。draft get 与 draft list 用于查询。保存草稿不等于公开发布。远端结果不明确时状态记录为 unknown 并阻止盲目重试；先人工核对公众号后台。

静态检查、本地浏览器渲染、微信预览和远端保存分别记录；`draft get` 当前只返回标题和摘要，不能证明远端正文、图片或样式正确。结果不明时不删除状态文件或同步锁绕过阻断，恢复边界见[草稿同步参考](skills/wechat-article/references/draft.md)。

更多命令说明见 [CLI.md](CLI.md)，创作流程见 [Skill](skills/wechat-article/SKILL.md)。
