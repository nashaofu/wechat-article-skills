# CLI 安装、配置与数据范围

## 安装与调用

要求 Node.js 20.19+、22.12+ 或 23+。在仓库根目录安装依赖并构建 CLI：

```sh
pnpm install --frozen-lockfile
pnpm run build
node dist/index.js --help
```

从仓库本地调用时使用 `node dist/index.js <command>`。若当前环境已安装全局 CLI，可直接使用 `wechat-article <command>`。用 `wechat-article --version` 检查全局命令；本地 checkout 可用 `node dist/index.js --version`。若 checkout 中有 `package.json` 和已安装的 `node_modules`，但没有 `dist/index.js`，Agent 可运行 `pnpm run build` 后使用本地 CLI。仓库检出版本也可以在根目录通过 `npm install --global .` 安装为全局命令。Agent 不应为单次草稿同步静默执行全局安装或安装依赖；既无可用全局命令、又无法从现有 checkout 构建时，应报告 CLI 尚未就绪。

## 配置状态与初始化

CLI 使用用户目录中的唯一公众号凭据；该凭据只在需要同步草稿时使用，单纯创作和交付文章不需要配置。上传前先运行只读状态查询：

```sh
wechat-article config status
```

本地 checkout 使用 `node dist/index.js config status`。JSON 输出的 `data.credentials_status` 为 `missing`、`configured` 或 `incomplete`。该命令不展示 AppID 或 AppSecret，也不会修改配置文件。无法读取或解析配置文件时会返回错误；不要尝试读取密钥内容来排查。

状态为 `missing` 或 `incomplete` 时，先完成本地文章交付，再指引用户运行以下命令进行配置：

```sh
wechat-article config init
```

本地 checkout 使用 `node dist/index.js config init`。命令交互式读取 AppID 和 AppSecret，并保存到 `~/.wechat-article/config.json`。已有完整凭据时，覆盖前会要求确认；凭据不完整时，确认替换后可重新录入。文章目录和工作区不需要账号配置文件。不要在聊天、文章文件或日志中粘贴密钥。配置完成后重新运行 `config status`，确认状态为 `configured`，再继续草稿同步。

draft sync 会使用公众号凭据换取 access token，并向微信公众号官方接口发送封面、正文图片和文章内容；access token 缓存位于用户目录，不写入文章目录或日志。除该接口外，向其他第三方发送文章内容前应告知用户并取得确认。
