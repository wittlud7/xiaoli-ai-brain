# 发布到 GitHub

本地准备不等于已在 GitHub 发布。以下步骤由仓库拥有者在确认文件范围后执行。

1. 运行 `npm ci`、`npm run check`，确认全部通过。
2. 阅读 README 的功能边界，检查 LICENSE 的署名与 MIT 许可证是否符合项目预期。确认代码和演示素材可公开。
3. 使用 `git status --short --untracked-files=all` 与 `git status --short --ignored` 检查范围。`.env`、`node_modules/`、`dist/`、`output/`、工作区备份和密钥文件不应被提交。不要使用 `git add -f`。
4. 先 `git add .`，再用 `git diff --cached --stat`、`git diff --cached --check` 和 `git diff --cached` 检查真实提交内容。若发现凭证，移出暂存区并撤销已经暴露的密钥。
5. 在 GitHub 创建空仓库，添加远程地址，提交并推送。不要在公开 Issue 中粘贴 `.env` 或私人资料。
6. 在仓库 Settings 中启用可用的安全告警与私下漏洞报告，并确认 Actions 成功。
7. 创建 `v0.1.0-alpha.1` 标签和预发布 Release，说明 Alpha 限制与验证范围。可将 `dist/` 内容打成压缩包作为附件，务必排除本机 `.env` 和安装后的 `node_modules/`。

首次推送示例（将 `YOUR_NAME` 替换为实际 GitHub 用户名）：

```sh
git add .
git diff --cached --check
git diff --cached --stat
git commit -m "Prepare v0.1.0-alpha.1 open-source release"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/xiaoli-ai-brain.git
git push -u origin main
```

已有远程仓库时先执行 `git remote -v` 确认地址，不要盲目覆盖。这里不提供强制推送命令。

开发验证与真实供应商验证应分别记录。替代供应商测试通过，不表示真实账号、模型权限、余额或音频质量已经验证。若尚未进行真实调用，请在 Release 中写明。
