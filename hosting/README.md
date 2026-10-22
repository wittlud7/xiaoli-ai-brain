# 网页版部署

站点：https://xiaoli-ai-brain-wittlud7.youngcoin22.chatgpt.site

网页版使用 Sites 的私有访问控制，只有站点所有者登录后可使用。请保留私有访问权限：服务端使用所有者的 Gemini 配额。密钥通过 Sites 环境变量 GEMINI_API_KEY 配置，不进入代码或 GitHub；GEMINI_MODEL 可选。

资料和成果保存在当前浏览器的 IndexedDB，换设备不会自动同步，请使用 JSON 备份迁移。支持 PDF/TXT/MD、简报、图谱、卡片、播客文稿与追问；线上音频合成暂未启用。本地 Node 版本仍支持自配语音服务。

仓库根目录运行 `npm ci`，然后：

```sh
npm run build:site
npm run test:site
npm run test:browser:site
```

首次执行浏览器检查前安装 Chromium：`npx playwright install chromium`。GitHub CI 会自动检查部署包及其主要浏览器流程。设置页会区分网页版与本地版；线上登录失效时通过 ChatGPT 重新登录，不需要填写本地服务口令。

构建复用 web/ 和 lib/study.mjs，将网页、PDF 资源和学习逻辑打入 dist/server/index.js。dist 与本地 Node 发布包共用，请分别构建；若存在 dist/.env，构建拒绝覆盖。

通过 Sites 插件的源码同步、打包和私有部署流程发布，同一站点身份位于根目录 .openai/hosting.json。GitHub 更新不会自动部署 Sites。

当前 Windows Node 运行环境的目录复制存在遗漏；如打包未包含 `dist/server/index.js`，仅为发布辅助进程设置 `NODE_OPTIONS` 加载 `hosting/scripts/windows-copy.cjs`，然后重新运行 Sites 打包辅助流程。该兼容层不在浏览器或云端运行，打包后仍应检查归档包含 Worker 入口。

限制：每个 Worker 实例每用户每分钟 20 次、并发 2 次，不是跨实例的全局配额。线上仅支持 Gemini，不提供旧版兼容 API。请勿改成公开 AI 服务。
