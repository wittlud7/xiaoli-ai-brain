# 小理 AI 大脑 · XiaoLi AI Brain

本地优先的 AI 学习工作台：整理学习资料，按笔记本生成复习摘要、思维导图提纲和双主持人播客。

**版本：v0.1.0-alpha.1。适合个人本地试用与开发贡献。知识图谱和陪伴页面目前是交互演示。**

![学习资料与摘要工作台，使用测试资料及替代供应商生成结果](docs/images/studio.png)

## 功能与边界

| 功能 | 当前状态 |
| --- | --- |
| PDF / TXT / Markdown 导入、快速笔记 | 可用；PDF 在浏览器提取文字，不支持扫描件 OCR |
| 笔记本与资料关联、生成历史 | 可用；保存在当前浏览器 |
| 复习摘要、思维导图 Markdown 提纲 | 需要 Gemini API；提纲不是可缩放的图形导图 |
| 双主持人脚本、播客追问 | 需要 Gemini API |
| 播客语音与下载 | 另外需要 OpenAI API；音频为 AI 合成，刷新后不保留 |
| 工作区 JSON 备份导出与恢复 | 可用；包含资料、文字历史、图谱掌握状态，不包含音频或密钥 |
| 知识图谱、学习陪伴 | 预设节点、鼓励语和示例数值；不会自动分析资料或计算真实学习积分 |

## 本地启动

需要 **Node.js 22.13 或更高版本**与 npm。推荐 Node.js 22 或 24。

```sh
npm ci
```

复制 `.env.example` 为 `.env`：

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

编辑 `.env`，按需填写自己的密钥，然后启动：

```sh
npm start
```

打开 http://127.0.0.1:3000 。开发时可用 `npm run dev` 自动重启服务器。未配置密钥也能使用资料、笔记本、备份与演示页面；生成接口会提示尚未配置。

| 环境变量 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | 摘要、提纲、播客脚本、追问 |
| `GEMINI_MODEL` | 文本模型名，默认 `gemini-3-flash-preview` |
| `OPENAI_API_KEY` | 播客语音 |
| `OPENAI_TTS_MODEL` | 默认 `gpt-4o-mini-tts` |
| `OPENAI_TTS_VOICE_HOST_A/B/FALLBACK` | 主持人与旁白声音，见示例文件 |
| `HOST` / `PORT` | 默认 `127.0.0.1:3000` |
| `APP_ACCESS_TOKEN` | 工作区访问口令，设置时至少 24 字符；对外监听时必填 |
| `PUBLIC_ORIGIN` | HTTPS 代理后的外部来源，例如 `https://study.example.com`，末尾无斜杠 |
| `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` | 可选兼容接口配置，主界面不使用 |

模型名可以调整；示例默认值不代表账号一定有权限或服务长期可用。供应商请求可能收费。`.env` 由服务器读取，不会发送给浏览器；README 中的文件名是 `.env`，不是 `.env.local`。

## 使用流程

1. 进入 Library 导入资料或保存笔记。
2. 进入 Studio 创建笔记本并勾选资料，最多关联 20 份。
3. 选择 Study Brief、Mind Map 或 AI Podcast，生成后查看历史或追问。
4. 音频生成后及时下载；定期使用 Export backup 备份文字工作区。

文件上限为每份 10 MB、PDF 100 页、提取文字 100,000 字符。文本生成按资料数量分配摘录额度，总上下文不超过约 24,000 字符，**并非全文检索/RAG**。每个笔记本保留最近 12 条生成记录。扫描件请先做 OCR；加密或损坏 PDF 可能无法导入。多语言版式复杂的 PDF 可能存在阅读顺序问题。

界面目前主要为英文，生成提示词默认要求中文。建议使用最新版本桌面 Chrome、Edge 或 Firefox；移动端提供响应式布局。

## 数据与隐私

- 资料和文字历史保存在当前站点的浏览器 localStorage；没有用户账号、数据库同步或云端备份。不同端口、域名、浏览器的工作区互不共享。
- 点击生成时，资料摘录或播客内容会经本地服务器发给 Gemini；生成音频时，脚本会发送给 OpenAI。只有直接调用可选 Anthropic 接口时，相关请求才发送到其配置端点。
- 访问口令只保存在页面内存中，刷新需重新输入；它不同于供应商 API 密钥。
- 音频不写入 localStorage，以免占满存储空间。备份不包含音频，但会包含你的原始资料正文，请妥善保管。
- 工作区应用层上限约 150 万字符，浏览器也有自己的存储额度。写入失败会显示提醒并保留上次成功保存的数据；请导出当前工作区并清理旧记录。
- 升级时会尝试迁移旧静态版的浏览器存储；旧键保留用于恢复。无效存储不会被自动覆盖。
- AI 输出可能出错，不适合作为考试答案或专业判断的唯一依据。

## 检查与发布包

```sh
npm run check
```

依次执行 JavaScript 语法检查、待发布文件的凭证特征扫描、Node 内置测试和发布打包。凭证扫描依赖 Git，仅检测部分常见密钥格式，仍需人工审查。测试使用替代供应商，不使用真实密钥、不产生 API 费用。根目录无编译步骤；`build` 会将运行所需文件复制至 `dist/`，排除 `.env`、历史实现、测试和本地输出。

发布包可独立运行：在 `dist/` 中执行 `npm ci --omit=dev`，复制并配置 `.env.example` 为 `.env`，然后 `node server.mjs`。打包不是静态托管构建，**不能直接部署到 GitHub Pages**；需要 Node.js 服务器。

CI 已配置 Windows / Linux 和 Node.js 22 / 24 的安装与检查矩阵，推送后可查看实际运行结果。开发说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全边界见 [SECURITY.md](SECURITY.md)，本地验证范围见 [docs/VALIDATION.md](docs/VALIDATION.md)，发布步骤见 [docs/RELEASING.md](docs/RELEASING.md)。

## 对外访问

默认只监听本机。若需局域网试用，设置 `HOST=0.0.0.0`，并设置至少 24 字符的随机 `APP_ACCESS_TOKEN`；第一次生成时输入该访问口令。可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 在本机生成口令。

公网必须配合 HTTPS 反向代理，并把 `PUBLIC_ORIGIN` 设置为外部站点来源，例如 `https://study.example.com`。代理应转发原始 `Host`。本服务不信任代理提供的客户端 IP，因此代理后的请求共享限流额度。仅适用于少量受信任用户；未实现多租户、用户隔离和按用户计费。内存限流为每 IP 每分钟 20 次、全局同时生成最多 2 个请求；重启会重置，不能代替供应商预算限制。接口会拒绝跨站请求并隐藏上游错误细节。

## 项目结构

```text
server.mjs          Express API、访问控制、静态文件服务
lib/speech.mjs      主持人识别与语音文本切分
web/               当前维护的浏览器界面、PDF 导入、工作区存储
test/              无外部 API 的回归测试
scripts/           语法检查与发布打包
legacy/            历史 React / TypeScript 原型，仅供参考，不纳入发布包
```

## 后续方向

全文检索与来源引用、真实资料知识图谱、可视化思维导图、更完整的中文界面、IndexedDB 音频持久化，以及更完善的可访问性。欢迎围绕明确问题提交 Issue 或 PR。

## 许可证

项目代码采用 [MIT](LICENSE) 许可证。第三方依赖保留各自许可证；模型服务、声音与生成内容的使用还需遵守所用供应商的条件。请仅提交你有权公开的资料与代码。
