# 仓库开发约定

- `skills/wechat-article/` 是唯一创作 Skill；主流程在 `SKILL.md`，按需资料在 `references/`。
- CLI 是仓库根目录的 TypeScript/Node.js 包；`src/` 为源码，`test/` 为离线验证。构建产物 `dist/` 不提交。
- 修改 CLI 后在仓库根目录运行 `pnpm run check`（tsc 类型检查 + Biome 校验）和 `pnpm run test`；`pnpm run lint`、`pnpm run format` 用于自动修复。改 Skill 或 README 后检查链接、命令和相对路径。
- 保持选题、研究、写作和审校由 Agent 判断；CLI 只做可重复操作。不得在自动路径加入群发或公开发布。
- 草稿提交必须检查账号、凭据、接口、文件和当前授权；输出不得含密钥、令牌或完整敏感请求。不要把不明确的提交结果当成功，也不要自动重试非幂等请求。
- 保留用户已有的未提交改动；覆盖/删除用户产物前核对授权。离线验证不连接真实公众号或付费服务。
- AI 生成 Git 提交信息时遵循 Conventional Commits：`<type>(<scope>): <简短祈使式摘要>`；常用 type 为 `feat`、`fix`、`docs`、`refactor`、`test`、`build`、`ci`、`chore`、`perf`、`revert`。摘要说明实际变更，使用小写 type，不加句号；有破坏性变更时添加 `!` 或 `BREAKING CHANGE:` footer。提交前仅根据本次实际变更生成，不臆测未暂存内容。
