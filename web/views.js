import { TOOLS, SUBJECTS, dueCards } from "./model.js";
import {
  escapeHtml as h,
  markdown,
  referenceButtons,
  conceptGraph,
} from "./render.js";

export const action = (
  name,
  text,
  extra = "",
  className = "button secondary",
) =>
  `<button class="${className}" data-action="${name}" ${extra}>${text}</button>`;
const empty = (title, message, buttons = "") =>
  `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">✦</span><h2>${title}</h2><p>${message}</p>${buttons}</div>`;
const time = (value) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export function createViews({
  ui,
  current,
  book,
  entryFor,
  allOutputs,
  sourcesFor,
}) {
  function render() {
    const due = dueCards(current());
    document.getElementById("app").innerHTML = `<div class="shell">
      <aside class="sidebar"><a class="brand" href="#workspace"><span class="brand-mark">✦</span><span><strong>小理</strong><small>把知识，学进脑海</small></span></a>
        <nav aria-label="主要导航">${[
          ["workspace", "▤", "学习工作台"],
          ["review", "▧", "记忆复习"],
          ["graph", "⌘", "知识图谱"],
          ["settings", "⚙", "数据与设置"],
        ]
          .map(
            ([id, icon, title]) =>
              `<a href="#${id}" class="nav-item ${ui.route === id ? "active" : ""}" ${ui.route === id ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${title}${id === "review" && due.length ? `<b class="nav-count">${due.length}</b>` : ""}</a>`,
          )
          .join("")}</nav>
        <div class="sidebar-bottom"><span class="local-dot"></span> 本地优先 · v0.2 Beta<p>资料保存在此浏览器。<br>生成时才发送给你配置的模型。</p></div>
      </aside>
      <main class="main"><header class="page-header"><div><p class="eyebrow">XIAOLI · YOUR STUDY SPACE</p><h1>${{ workspace: "留一点时间，真正学会", review: "让知识，成为长期记忆", graph: "把零散知识，连成一张网", settings: "你的资料，由你保管" }[ui.route] || "学习工作台"}</h1></div><span class="version-pill">BETA 0.2</span></header>
      ${ui.notice ? `<div class="notice ${ui.error ? "error" : ""}" role="status"><span>${h(ui.notice)}</span>${action("dismiss", "关闭提示", 'aria-label="关闭提示"', "icon-button")}</div>` : ""}
      ${ui.locked ? `<div class="notice" role="status">${ui.hosted ? '登录已过期，资料仍保存在此浏览器。<a class="button secondary" href="/signin-with-chatgpt?return_to=%2F" target="_top">使用 ChatGPT 重新登录</a>' : `此服务需要访问口令。供应商 API 密钥请只填写在服务器的 .env 中。${action("unlock", "输入访问口令")}`}</div>` : ""}
      ${ui.connectionError ? `<div class="notice error" role="status">${h(ui.connectionError)}${action("refresh-config", "重新检查连接")}</div>` : ""}
      ${ui.job ? `<div class="job-status" role="status"><span class="spinner" aria-hidden="true"></span><span>${h(ui.job.label)} · 可以切换页面查看其他资料</span>${action("cancel", "取消请求")}</div>` : ""}
      ${ui.ask ? `<div class="job-status" role="status"><span class="spinner" aria-hidden="true"></span><span>正在检索原始资料并回答，结果将保存到原记录。</span>${action("cancel-ask", "取消追问")}</div>` : ""}
      ${ui.route === "review" ? renderReview(due) : ui.route === "graph" ? renderGraph() : ui.route === "settings" ? renderSettings() : renderWorkspace()}
      </main></div>`;
  }
  function renderWorkspace() {
    const target = book(),
      entry = entryFor(target);
    return `<div class="workspace-grid"><aside class="workspace-rail">
      <section class="panel notebook-panel"><div class="section-heading"><h2>我的笔记本 <span>${current().notebooks.length}</span></h2>${action("new-book", "＋", 'aria-label="创建笔记本"', "icon-button")}</div>
        <div class="notebook-list">${
          current()
            .notebooks.map(
              (item) =>
                `<button data-action="select-book" data-id="${h(item.id)}" class="notebook ${target?.id === item.id ? "selected" : ""}" aria-pressed="${target?.id === item.id}"><span class="notebook-icon">▤</span><span><strong>${h(item.name)}</strong><small>${item.fileIds.length} 份资料 · ${item.history.length} 条记录</small></span></button>`,
            )
            .join("") ||
          '<p class="muted small">为一个主题创建笔记本，或先添加资料。</p>'
        }</div>
        ${target ? `<div class="row compact">${action("rename-book", "重命名")}${action("delete-book", "删除笔记本", "", "text-button danger")}</div>` : ""}
      </section>
      <section class="panel source-panel"><div class="section-heading"><h2>资料库 <span>${current().files.length}</span></h2><div>${action("new-note", "写笔记", "", "icon-button")}${action("upload", "＋", 'aria-label="导入资料"', "icon-button")}</div></div><p class="muted small">勾选资料，关联到当前笔记本。</p>
        <label class="search"><span aria-hidden="true">⌕</span><input id="source-search" type="search" placeholder="查找资料…" aria-label="查找资料" value="${h(ui.search)}"/></label>
        <div id="source-list">${renderSources()}</div><p class="muted micro">PDF / TXT / MD · 每份 10 MB<br>PDF 最多 100 页，不含扫描件 OCR</p>
      </section></aside>
      <div class="workspace-main">${
        !target
          ? empty(
              "从一份好奇开始",
              "导入你的课程资料，或写下一个想学会的主题。小理会帮你整理重点、连接概念，再通过记忆卡巩固。",
              `<div class="row">${action("upload", "导入学习资料", "", "button primary")}${action("sample", "试用示例资料")}</div>`,
            )
          : `
        <section class="panel studio"><div class="section-heading"><div><p class="eyebrow">今天，学懂一点</p><h2>${h(target.name)}</h2></div><span class="soft-pill">${target.fileIds.length} / 20 份资料</span></div>
        <label class="goal-label" for="study-goal">这次想学会什么？<span>可选；填写问题后，会优先检索相关原文</span></label><textarea id="study-goal" data-draft="goal" data-book="${h(target.id)}" maxlength="1000" rows="2" placeholder="例如：解释第二定律，并指出容易混淆的条件">${h(ui.goals.get(target.id) || "")}</textarea>
        <div class="tool-grid" role="group" aria-label="生成内容类型">${[
          ["brief", "≡", "复习摘要", "梳理重点，带原文引用"],
          ["map", "⌘", "概念图", "提取概念，理清关系"],
          ["cards", "▧", "记忆卡", "主动回忆，间隔复习"],
          [
            "podcast",
            "♫",
            "双人播客",
            ui.capabilities?.audioReady
              ? "先读脚本，再选择合成音频"
              : "生成双人文稿，可阅读与导出",
          ],
        ]
          .map(
            ([id, icon, title, desc]) =>
              `<button class="tool ${ui.tool === id ? "selected" : ""}" data-action="tool" data-id="${id}" aria-pressed="${ui.tool === id}"><span aria-hidden="true">${icon}</span><strong>${title}</strong><small>${desc}</small></button>`,
          )
          .join("")}</div>
        <div class="generate-row">${action("generate", `生成${TOOLS[ui.tool]}`, `${ui.job || !target.fileIds.length || !ui.capabilities?.textReady || ui.locked ? "disabled" : ""}`, "button primary")}<span class="muted small">${ui.capabilities?.textReady ? "检索整份资料，使用有限原文片段；AI 结果请结合引用核对。" : ui.locked ? (ui.hosted ? "请重新登录后生成。" : "请输入服务访问口令后生成。") : ui.connectionError ? "服务连接暂不可用，资料与历史记录仍可查看。" : ui.capabilities ? "尚未配置文本模型。可先整理资料；配置方法见“数据与设置”。" : "正在检查模型连接…"}</span></div></section>
        ${entry ? `<section class="panel output-panel"><div class="section-heading"><div><p class="eyebrow">${TOOLS[entry.kind]}${entry.legacy ? " · 旧版记录，无原文引用" : " · 可追溯来源"}</p><h2>${h(entry.title)}</h2><p class="muted small">${time(entry.createdAt)}</p></div>${action("export-output", "导出文本")}</div>${renderOutput(entry)}${renderReferences(entry)}${renderChat(entry)}</section>` : empty("准备好第一份学习成果", "选好左侧资料，选择一种学习方式。生成的内容和原文引用会保存在这个笔记本里。")}
        ${renderHistory(target, entry)}
      `
      }</div></div>`;
  }
  function renderSources() {
    const target = book();
    return (
      current()
        .files.filter((file) =>
          `${file.name} ${SUBJECTS[file.subject]}`
            .toLowerCase()
            .includes(ui.search.toLowerCase()),
        )
        .map(
          (file) =>
            `<div class="source-row"><input type="checkbox" data-bind="${h(file.id)}" ${!target ? "disabled" : ""} ${target?.fileIds.includes(file.id) ? "checked" : ""} aria-label="关联资料：${h(file.name)}"/><button class="source-title" data-action="preview" data-id="${h(file.id)}"><strong>${h(file.name)}</strong><small>${file.kind.toUpperCase()} · ${file.content.length.toLocaleString()} 字符</small></button>${action("delete-file", "×", `data-id="${h(file.id)}" aria-label="删除资料：${h(file.name)}"`, "icon-button subtle")}</div>`,
        )
        .join("") ||
      '<p class="muted small source-empty">还没有资料，或没有匹配的结果。</p>'
    );
  }
  function renderHistory(target, selected) {
    return `<section class="panel history"><div class="section-heading"><h2>学习记录 <span>${target.history.length} / 30</span></h2><span class="muted small">资料删除后，引用原文仍会保留</span></div>${target.history.map((entry) => `<div class="history-row ${entry.id === selected?.id ? "selected" : ""}"><button data-action="select-output" data-id="${h(entry.id)}"><span class="type-tag">${TOOLS[entry.kind]}</span><strong>${h(entry.title)}</strong><small>${time(entry.createdAt)}</small></button>${action("delete-output", "删除", `data-id="${h(entry.id)}" aria-label="删除记录：${h(entry.title)}"`, "text-button danger")}</div>`).join("") || '<p class="muted small">还没有生成记录。</p>'}</section>`;
  }
  function renderOutput(entry) {
    if (entry.kind === "brief")
      return `<article class="prose">${markdown(entry.data.markdown, entry.references)}</article>`;
    if (entry.kind === "podcast")
      return `<div class="podcast-card"><div><span class="podcast-icon">♫</span><h3>让知识说给你听</h3><p>AI 合成语音 · 音频保存在本地，也可以下载。</p></div><div class="row">${action("synthesize", ui.job?.entryId === entry.id ? "合成中…" : "合成音频", `${ui.job || !ui.capabilities?.audioReady || ui.locked ? "disabled" : ""}`, "button primary")}${action("play", "播放已保存音频")}</div>${!ui.capabilities?.audioReady ? '<p class="small">音频服务尚未配置；脚本可以照常阅读与导出。</p>' : ""}</div><div class="transcript">${entry.data.script
        .split(/\n+/)
        .filter(Boolean)
        .map(
          (line, index) =>
            `<p class="${index % 2 ? "host-b" : "host-a"}">${h(line)}</p>`,
        )
        .join("")}</div>`;
    if (entry.kind === "cards")
      return `<div class="row spaced"><p class="muted">${entry.data.cards.length} 张卡片。先尝试回忆，再查看答案。</p><a class="button primary" href="#review">开始复习</a></div><div class="card-previews">${entry.data.cards.map((card) => `<details><summary>${h(card.question)}</summary><p>${h(card.answer)}</p><div>${referenceButtons(card.sourceRefs, entry.references)}</div></details>`).join("")}</div>`;
    return renderConcepts(entry);
  }
  function renderConcepts(entry) {
    const selected =
      entry.data.concepts.find((node) => node.id === ui.conceptId) ||
      entry.data.concepts[0];
    const mastery =
      current().graphMastery[`${entry.id}:${selected.id}`] || "learning";
    return `<div class="graph-layout">${conceptGraph(entry, current().graphMastery, selected.id)}<div class="concept-detail"><span class="eyebrow">当前概念</span><h3>${h(selected.name)}</h3><p>${h(selected.description)}</p><div>${referenceButtons(selected.sourceRefs, entry.references, entry.id)}</div><label>掌握程度<select data-mastery="${h(entry.id)}:${h(selected.id)}">${[
      ["learning", "正在学习"],
      ["review", "需要复习"],
      ["mastered", "已经掌握"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${value === mastery ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label></div></div>${entry.data.links.length ? `<div class="relations"><h3>概念关系</h3>${entry.data.links.map((link) => `<p><strong>${h(entry.data.concepts.find((node) => node.id === link.from).name)}</strong><span>${h(link.label)}</span><strong>${h(entry.data.concepts.find((node) => node.id === link.to).name)}</strong></p>`).join("")}</div>` : ""}`;
  }
  function renderReferences(entry) {
    if (!entry.references.length) return "";
    return `<details class="references"><summary>查看 ${entry.references.length} 段原文依据 <small>引用校验编号，不代表自动验证事实</small></summary><div class="reference-list">${entry.references.map((ref) => `<button data-action="reference" data-ref="${h(ref.id)}" data-scope="${h(entry.id)}"><b>${h(ref.id)}</b><span>${h(ref.sourceName)}<small>${h(ref.text.slice(0, 100))}${ref.text.length > 100 ? "…" : ""}</small></span></button>`).join("")}</div></details>`;
  }
  function renderChat(entry) {
    let ready = true;
    try {
      sourcesFor(entry);
    } catch {
      ready = false;
    }
    return `<section class="chat"><h3>带着原文，继续问</h3><p class="muted small">${ready ? "追问会重新检索这条记录的原始资料，不受当前勾选或其他笔记本影响。" : "这条记录的原始资料不可用或已变化。引用快照仍可查看，请重新生成后再追问。"}</p><div class="messages">${entry.messages.map((message) => `<div class="message ${message.role}"><span>${message.role === "user" ? "你" : "小理"}</span><div class="prose">${message.role === "user" ? `<p>${h(message.content)}</p>` : markdown(message.content, message.references, message.id)}</div></div>`).join("")}</div><form id="ask-form" data-entry="${h(entry.id)}"><label class="sr-only" for="question">向资料提问</label><input id="question" data-draft="question" data-entry="${h(entry.id)}" maxlength="2000" placeholder="这个结论在什么条件下成立？" value="${h(ui.questions.get(entry.id) || "")}" ${!ready ? "disabled" : ""}/><button class="button secondary" type="submit" ${!ready || ui.ask || !ui.capabilities?.textReady || ui.locked ? "disabled" : ""}>${ui.ask?.entryId === entry.id ? "检索中…" : "提问"}</button></form></section>`;
  }
  function renderReview(due) {
    const total = allOutputs()
      .filter((item) => item.entry.kind === "cards")
      .reduce((sum, item) => sum + item.entry.data.cards.length, 0);
    const item = due[0];
    if (item?.key !== ui.reviewKey) {
      ui.reviewKey = item?.key || "";
      ui.revealed = false;
    }
    return `<div class="review-header"><div class="stat"><strong>${due.length}</strong><span>当前待复习</span></div><div class="stat"><strong>${total}</strong><span>真实记忆卡总数</span></div><p class="muted">新卡片先练习；根据你的回忆情况安排下一次复习。<br>这不是考试评分，也没有虚构积分。</p></div>${
      !item
        ? empty(
            total ? "这一轮，完成了" : "先创建一组记忆卡",
            total
              ? "到期后再来复习。你也可以回到工作台查看已有卡片。"
              : "在工作台选中资料，生成记忆卡后，就能在这里进行主动回忆。",
            '<a href="#workspace" class="button primary">回到工作台</a>',
          )
        : `<section class="review-card panel"><p class="eyebrow">${h(item.book.name)} · ${h(item.entry.title)}</p><h2>${h(item.card.question)}</h2>${
            ui.revealed
              ? `<div class="answer"><p>${h(item.card.answer)}</p>${referenceButtons(item.card.sourceRefs, item.entry.references, item.entry.id)}</div><p class="muted small">这次回忆得怎么样？选择后会保存复习计划。</p><div class="ratings">${[
                  ["again", "忘记了", "10 分钟后"],
                  ["hard", "有点困难", "较短间隔"],
                  ["good", "记住了", "逐步延长"],
                  ["easy", "很轻松", "至少 4 天"],
                ]
                  .map(
                    ([value, label, hint]) =>
                      `<button data-action="grade" data-rating="${value}" data-key="${h(item.key)}"><strong>${label}</strong><small>${hint}</small></button>`,
                  )
                  .join("")}</div>`
              : action("reveal", "想好了，查看答案", "", "button primary")
          }</section>`
    }`;
  }
  function renderGraph() {
    const maps = allOutputs().filter((item) => item.entry.kind === "map");
    const selected =
      maps.find((item) => item.entry.id === ui.graphId) || maps[0];
    if (!selected)
      return empty(
        "用自己的资料，长出概念图",
        "概念和关系均从你选定的资料中生成，不再展示预设演示节点。",
        '<a href="#workspace" class="button primary">回到工作台生成</a>',
      );
    ui.graphId = selected.entry.id;
    return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">来源 · ${h(selected.notebook.name)}</p><h2>${h(selected.entry.title)}</h2></div><label class="small">切换概念图<select id="graph-select">${maps.map((item) => `<option value="${h(item.entry.id)}" ${item.entry.id === selected.entry.id ? "selected" : ""}>${h(item.notebook.name)} · ${h(item.entry.title)}</option>`).join("")}</select></label></div>${renderConcepts(selected.entry)}${renderReferences(selected.entry)}</section>`;
  }
  function renderSettings() {
    const connectionHelp = ui.hosted
      ? "此网站使用 ChatGPT 登录，无需输入服务口令或模型密钥。文本服务由站点管理员配置，生成时会把选定的资料片段发送给 Gemini。网页版暂未启用语音合成，播客文稿可以阅读和导出。"
      : "在项目的 .env 文件填写 GEMINI_API_KEY 或 ANTHROPIC_AUTH_TOKEN。语音另外需要 OPENAI_API_KEY，修改后重启服务。供应商调用可能收费。";
    return `<div class="settings-grid"><section class="panel"><p class="eyebrow">连接状态</p><h2>模型只在生成时使用</h2><div class="connection"><span class="status-dot ${ui.capabilities?.textReady ? "ready" : ""}"></span><span>文本生成：${ui.capabilities?.textReady ? "已配置" : ui.locked ? (ui.hosted ? "需要重新登录" : "需要访问口令") : "未配置或无法连接"}</span></div><div class="connection"><span class="status-dot ${ui.capabilities?.audioReady ? "ready" : ""}"></span><span>播客语音：${ui.capabilities?.audioReady ? "已配置" : ui.hosted ? "此网页版暂未启用" : "未配置"}</span></div><p class="muted">${connectionHelp}</p><div class="row">${action("refresh-config", "重新检查连接")}${ui.hosted ? (ui.locked ? '<a class="button secondary" href="/signin-with-chatgpt?return_to=%2F" target="_top">使用 ChatGPT 重新登录</a>' : "") : action("unlock", "输入服务访问口令")}</div></section>
      <section class="panel"><p class="eyebrow">数据与备份</p><h2>你的工作区，只属于你</h2><p class="muted">资料、文字、复习计划和音频保存到本浏览器 IndexedDB。不同域名、端口或浏览器的存储互不共享。</p><div class="row">${action("export", "导出工作区备份", "", "button primary")}${action("restore", "导入备份")}</div><p class="muted small">JSON 备份包含资料正文、引用、对话与复习进度，不包含音频或任何口令。音频请从播放器单独下载。支持旧版备份迁移；导入将替换当前工作区，请先备份。</p></section>
      <section class="panel"><p class="eyebrow">能力边界</p><h2>让结果可以检查</h2><p class="muted">本版按全文分段进行关键词检索，中文使用双字词匹配；每次最多 24 段、约 22,000 字符，不等于模型阅读了整份资料。来源编号会校验，但事实是否正确仍需你核对原文。</p><p class="muted">PDF 只提取文字层，不支持扫描 OCR。资料上限 200 份、每份 100,000 字符；每个笔记本关联最多 20 份，总正文最多 60 万字符；保存最多 30 条生成记录。工作区备份上限 24 MB。</p></section>
      <section class="panel"><p class="eyebrow">学习方式</p><h2>小步学习，持续复习</h2><p class="muted">摘要抓重点，概念图理清关系，记忆卡练习主动回忆，播客适合再次回顾。删去预设图谱、虚构积分和学习连续天数，界面只展示你的真实记录。</p><a href="https://github.com/wittlud7/xiaoli-ai-brain" target="_blank" rel="noopener noreferrer">查看开源代码 ↗</a></section></div>`;
  }
  return { render, renderSources };
}
