import { openStorage, createRepository } from "./storage.js";
import {
  migrateWorkspace,
  validateOutput,
  TOOLS,
  SUBJECTS,
  MAX_BACKUP_BYTES,
  dueCards,
  reviewSchedule,
} from "./model.js";
import { uniqueId, sourceVersion } from "./identity.js";
import { request, setAccessToken, audioBlob } from "./api.js";
import { escapeHtml as h } from "./render.js";
import { createViews, action } from "./views.js";
import { readSource } from "./files.js";

const app = document.getElementById("app");
const dialog = document.getElementById("editor");
const audioPlayer = document.getElementById("audio-player");
const ui = {
  route: location.hash.slice(1) || "workspace",
  tool: "brief",
  selected: new Map(),
  goals: new Map(),
  questions: new Map(),
  job: null,
  ask: null,
  importing: false,
  notice: "",
  error: false,
  search: "",
  revealed: false,
  grading: false,
  reviewKey: "",
  graphId: "",
  conceptId: "",
  capabilities: null,
  locked: false,
  hosted: document.documentElement.dataset.hosting === "sites",
  connectionError: "",
};
let storage,
  repo,
  channel,
  audioUrl = "",
  playingId = "",
  views;
const current = () => repo.document;
const book = () =>
  current().notebooks.find((item) => item.id === current().activeNotebookId) ||
  null;
const entryFor = (target) =>
  target?.history.find((entry) => entry.id === ui.selected.get(target.id)) ||
  target?.history[0] ||
  null;
const allOutputs = () =>
  current().notebooks.flatMap((notebook) =>
    notebook.history.map((entry) => ({ entry, notebook })),
  );
const fileFor = (id) => current().files.find((file) => file.id === id);
const render = () => views?.render();

function announce(message, error = false) {
  ui.notice = message;
  ui.error = error;
  render();
}
function problem(error) {
  if (!repo) {
    let message = app.querySelector("[data-boot-error]");
    if (!message) {
      message = document.createElement("p");
      message.dataset.bootError = "";
      message.className = "dialog-error";
      message.setAttribute("role", "alert");
      app.querySelector("main")?.append(message);
    }
    message.textContent = error.message || "操作未完成，请检查备份后重试。";
    return;
  }
  if (error.status === 401) ui.locked = true;
  const cancelled = error.name === "AbortError";
  announce(
    cancelled
      ? "已取消本次请求。原有资料与记录保持不变。"
      : error.name === "TimeoutError"
        ? "请求超时，请稍后重试。"
        : error.message || "操作未完成，请重试。",
    !cancelled,
  );
}
async function change(operation) {
  await repo.mutate(operation);
  channel?.postMessage({ revision: current().revision });
}
function sourcesFor(entry) {
  const files = entry.sourceIds.map(fileFor);
  if (
    entry.legacy ||
    files.some((file) => !file) ||
    files.some((file) => sourceVersion(file) !== entry.sourceVersions[file.id])
  )
    throw new Error(
      "这条记录的来源已删除或发生变化。原文引用仍可查看；请使用当前资料重新生成后再追问。",
    );
  return files;
}
function findRecord(document, notebookId, entryId) {
  const entry = document.notebooks
    .find((item) => item.id === notebookId)
    ?.history.find((item) => item.id === entryId);
  if (!entry) throw new Error("这条学习记录已被删除，本次结果未写入其他记录。");
  return entry;
}
function openDialog(title, body) {
  dialog.innerHTML = `<div class="dialog-heading"><h2>${h(title)}</h2><button class="icon-button" data-close-dialog aria-label="关闭窗口">×</button></div>${body}`;
  if (!dialog.open) dialog.showModal();
}
function showReference(id, scope) {
  let entry = allOutputs().find((item) => item.entry.id === scope)?.entry;
  let ref = entry?.references.find((ref) => ref.id === id);
  if (!ref && scope)
    for (const item of allOutputs()) {
      const message = item.entry.messages.find(
        (message) => message.id === scope,
      );
      if (message) {
        entry = item.entry;
        ref = message.references.find((ref) => ref.id === id);
        break;
      }
    }
  if (!ref) {
    entry = entryFor(book());
    ref = entry?.references.find((ref) => ref.id === id);
  }
  if (!ref) throw new Error("未找到这段引用。");
  openDialog(
    `原文引用 ${ref.id}`,
    `<p class="muted">${h(ref.sourceName)} · 字符 ${ref.start + 1}–${ref.end}</p><blockquote class="source-quote">${h(ref.text)}</blockquote><p class="muted small">这是生成时保存的原文快照。编号有效不代表 AI 对原文的解释一定正确。</p>${fileFor(ref.sourceId) ? action("preview", "查看整份资料", `data-id="${h(ref.sourceId)}"`) : ""}`,
  );
}
function showEditor(kind) {
  const target = book();
  if (kind === "new-note")
    openDialog(
      "写一份学习笔记",
      `<form id="note-form"><label>标题<input name="title" required maxlength="300" placeholder="例如：我对牛顿第二定律的理解"/></label><label>正文<textarea name="content" required maxlength="100000" rows="10" placeholder="写下自己的理解，也可以粘贴一段学习资料。"></textarea></label><button class="button primary" type="submit">保存笔记</button></form>`,
    );
  else
    openDialog(
      kind === "new-book" ? "创建笔记本" : "重命名笔记本",
      `<form id="book-form" data-id="${kind === "rename-book" ? h(target?.id || "") : ""}"><label>名称<input name="name" required maxlength="100" value="${kind === "rename-book" ? h(target?.name || "") : ""}" placeholder="例如：物理期中复习"/></label><button type="submit" class="button primary">保存笔记本</button></form>`,
    );
}
async function addFiles(files) {
  if (ui.importing) return;
  ui.importing = true;
  const targetId = book()?.id,
    imported = [],
    errors = [];
  announce("正在读取资料，PDF 解析可能需要一些时间。");
  try {
    if (files.length > 20) throw new Error("一次最多导入 20 份资料。");
    for (const file of files) {
      try {
        imported.push({
          id: uniqueId(),
          name: file.name.slice(0, 300),
          subject: "general",
          kind: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "text",
          content: await readSource(file),
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        errors.push(`${file.name}：${error.message}`);
      }
    }
    if (imported.length)
      await change((document) => {
        document.files.unshift(...imported);
        let target = document.notebooks.find((item) => item.id === targetId);
        if (!target && !document.notebooks.length) {
          target = {
            id: uniqueId(),
            name: "我的学习笔记本",
            fileIds: [],
            history: [],
          };
          document.notebooks.push(target);
          document.activeNotebookId = target.id;
        }
        if (target)
          target.fileIds = [
            ...new Set([...target.fileIds, ...imported.map((file) => file.id)]),
          ].slice(0, 20);
      });
    announce(
      `已导入 ${imported.length} 份资料。${errors.join("；")}${imported.length && book()?.fileIds.length === 20 ? " 每个笔记本最多关联 20 份，请确认左侧勾选。" : ""}`,
      errors.length > 0,
    );
  } finally {
    ui.importing = false;
  }
}
async function generate() {
  if (ui.job) return;
  const target = book();
  if (!target?.fileIds.length)
    throw new Error("先为当前笔记本勾选至少一份资料。");
  if (target.history.length >= 30)
    throw new Error(
      "这个笔记本已有 30 条记录。请先导出备份并删除不需要的记录，再生成。",
    );
  const sources = target.fileIds
    .map(fileFor)
    .map((file) => ({ id: file.id, name: file.name, content: file.content }));
  if (
    sources.some((source) =>
      source.content.startsWith("[PDF uploaded in static runtime."),
    )
  )
    throw new Error(
      "所选旧版 PDF 只有占位文字，没有实际正文。请重新导入原始 PDF 后再生成。",
    );
  const versions = new Map(
    sources.map((file) => [file.id, sourceVersion(file)]),
  );
  const job = {
    id: uniqueId(),
    controller: new AbortController(),
    bookId: target.id,
    sourceIds: sources.map((source) => source.id),
    kind: ui.tool,
    label: `正在为「${target.name}」生成${TOOLS[ui.tool]}`,
  };
  ui.job = job;
  render();
  try {
    const entry = validateOutput(
      await request(
        "/api/study/generate",
        { kind: job.kind, goal: ui.goals.get(target.id) || "", sources },
        { signal: job.controller.signal },
      ),
    );
    job.controller.signal.throwIfAborted();
    ui.selected.set(target.id, entry.id);
    await change((document) => {
      const owner = document.notebooks.find((item) => item.id === target.id);
      if (
        !owner ||
        sources.some(
          (source) =>
            !document.files.some(
              (file) =>
                file.id === source.id &&
                sourceVersion(file) === versions.get(source.id),
            ),
        )
      )
        throw new Error(
          "笔记本或来源在生成期间被删除/修改，本次结果未写入，请重新生成。",
        );
      if (owner.history.length >= 30)
        throw new Error("学习记录已满，请清理后重新生成。");
      owner.history.unshift(entry);
    });
    ui.notice = `${TOOLS[job.kind]}已保存到「${target.name}」。点击引用编号可以核对原文。`;
    ui.error = false;
  } finally {
    if (ui.job?.id === job.id) ui.job = null;
    render();
  }
}
async function ask(entryId) {
  if (ui.ask) return;
  const target = book(),
    entry = target?.history.find((item) => item.id === entryId);
  if (!entry) return;
  const question = (ui.questions.get(entryId) || "").trim();
  if (!question) throw new Error("先写下你想问的问题。");
  const sources = sourcesFor(entry).map((file) => ({
    id: file.id,
    name: file.name,
    content: file.content,
  }));
  const job = {
    id: uniqueId(),
    bookId: target.id,
    sourceIds: entry.sourceIds,
    entryId,
    controller: new AbortController(),
  };
  ui.ask = job;
  render();
  try {
    const result = await request(
      "/api/study/ask",
      {
        sources,
        question,
        history: entry.messages.slice(-6).map((message) => ({
          role: message.role,
          content: message.content.slice(0, 4000),
        })),
      },
      { signal: job.controller.signal },
    );
    job.controller.signal.throwIfAborted();
    const createdAt = new Date().toISOString();
    await change((document) => {
      const owner = findRecord(document, target.id, entryId);
      if (
        owner.sourceIds.some(
          (id) =>
            !document.files.some(
              (file) =>
                file.id === id &&
                sourceVersion(file) === owner.sourceVersions[id],
            ),
        )
      )
        throw new Error("来源已变化，本次回答未写入，请重新生成。");
      owner.messages = [
        ...owner.messages,
        {
          id: uniqueId(),
          role: "user",
          content: question,
          references: [],
          createdAt,
        },
        {
          id: uniqueId(),
          role: "assistant",
          content: result.markdown,
          references: result.references,
          createdAt,
        },
      ].slice(-20);
    });
    if (ui.questions.get(entryId)?.trim() === question)
      ui.questions.delete(entryId);
  } finally {
    if (ui.ask?.id === job.id) ui.ask = null;
    render();
  }
}
function playBlob(blob, entry) {
  const audio = audioPlayer.querySelector("audio");
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(blob);
  playingId = entry.id;
  audio.src = audioUrl;
  audioPlayer.querySelector("[data-player-title]").textContent = entry.title;
  const link = audioPlayer.querySelector("a");
  link.href = audioUrl;
  link.download = "小理学习播客.mp3";
  audioPlayer.hidden = false;
  audio.play().catch(() => {});
}
async function synthesize(entry) {
  if (ui.job) return;
  const job = {
    id: uniqueId(),
    entryId: entry.id,
    controller: new AbortController(),
    label: "正在合成播客音频，脚本已安全保存",
  };
  ui.job = job;
  render();
  try {
    const blob = audioBlob(
      await request(
        "/api/audio/podcast-tts",
        { text: entry.data.script },
        { signal: job.controller.signal },
      ),
    );
    job.controller.signal.throwIfAborted();
    if (!allOutputs().some((item) => item.entry.id === entry.id))
      throw new Error("该记录已删除，音频未附加到其他记录。");
    try {
      await storage.saveAudio(entry.id, blob, {
        scriptVersion: sourceVersion({ content: entry.data.script }),
      });
      announce("音频已保存到此浏览器。也建议下载一份备份。");
    } catch (error) {
      announce(`${error.message} 你仍可从播放器立即下载本次音频。`, true);
    }
    playBlob(blob, entry);
  } finally {
    if (ui.job?.id === job.id) ui.job = null;
    render();
  }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function refreshConfig() {
  try {
    ui.capabilities = await request("/api/config");
    ui.locked = false;
    ui.connectionError = "";
  } catch (error) {
    if (error.status === 401) {
      ui.locked = true;
      ui.connectionError = "";
    } else
      ui.connectionError = ui.hosted
        ? "暂时无法连接在线服务。你仍可整理资料和导出备份，请稍后重新检查连接。"
        : "无法连接本地服务，请检查启动终端。资料仍在本地保存。";
    ui.capabilities = { textReady: false, audioReady: false };
  }
  render();
}
async function restore(file) {
  if (!file) return;
  if (file.size > MAX_BACKUP_BYTES) throw new Error("备份文件不能超过 24 MB。");
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("备份不是有效的 JSON 文件，请选择小理导出的备份。");
  }
  const imported = migrateWorkspace(raw);
  if (!repo) {
    if (
      !window.confirm(
        "请先下载原始恢复文件。确认用这个有效备份替换损坏的工作区？旧版存储和音频数据会保留。",
      )
    )
      return;
    const { restoreStorageFromBackup } = await import("./storage.js");
    await restoreStorageFromBackup(imported);
    if (globalThis.BroadcastChannel) {
      const update = new BroadcastChannel("xiaoli-study-v2");
      update.postMessage({ recovered: true });
      update.close();
    }
    location.reload();
    return;
  }
  if (
    !window.confirm(
      "导入会替换当前工作区，并移除不再关联的音频。确认已导出当前备份后继续？",
    )
  )
    return;
  ui.job?.controller.abort();
  ui.ask?.controller.abort();
  await change((document) => {
    Object.assign(document, imported, { revision: document.revision });
  });
  ui.selected.clear();
  ui.graphId = "";
  ui.revealed = false;
  if (playingId && !allOutputs().some((item) => item.entry.id === playingId))
    closePlayer();
  announce("备份已恢复。原有旧版存储不会被删除。");
}
function closePlayer() {
  const audio = audioPlayer.querySelector("audio");
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = "";
  playingId = "";
  audioPlayer.hidden = true;
}

async function handleAction(element) {
  const name = element.dataset.action,
    id = element.dataset.id,
    target = book(),
    entry = entryFor(target);
  if (name === "dismiss") {
    ui.notice = "";
    return render();
  }
  if (name === "unlock" && ui.hosted) {
    location.assign("/signin-with-chatgpt?return_to=%2F");
    return;
  }
  if (name === "unlock")
    return openDialog(
      "输入工作区访问口令",
      '<form id="unlock-form"><label>访问口令<input name="token" type="password" autocomplete="off" required/></label><p class="muted small">仅保存在当前页面内存，关闭或刷新后清除。不要填写供应商 API 密钥。</p><button type="submit" class="button primary">连接工作区</button></form>',
    );
  if (["new-note", "new-book", "rename-book"].includes(name))
    return showEditor(name);
  if (name === "upload") return document.getElementById("file-import").click();
  if (name === "restore")
    return document.getElementById("backup-import").click();
  if (name === "preview") {
    const file = fileFor(id);
    if (file)
      openDialog(
        file.name,
        `<p class="muted small">${file.content.length.toLocaleString()} 字符 · ${SUBJECTS[file.subject]}</p><pre class="source-content">${h(file.content)}</pre>`,
      );
    return;
  }
  if (name === "select-book")
    return change((document) => {
      document.activeNotebookId = id;
    });
  if (
    name === "delete-book" &&
    target &&
    window.confirm(
      `删除「${target.name}」及其学习记录和音频？资料库原文会保留。`,
    )
  ) {
    const entries = new Set(target.history.map((entry) => entry.id));
    await change((document) => {
      document.notebooks = document.notebooks.filter(
        (item) => item.id !== target.id,
      );
    });
    if (ui.job?.bookId === target.id || entries.has(ui.job?.entryId))
      ui.job.controller.abort();
    if (ui.ask?.bookId === target.id) ui.ask.controller.abort();
    if (entries.has(playingId)) closePlayer();
    return;
  }
  if (
    name === "delete-file" &&
    window.confirm(
      "删除这份资料并取消所有笔记本关联？已有学习记录和引用快照会保留。",
    )
  ) {
    await change((document) => {
      document.files = document.files.filter((file) => file.id !== id);
      for (const item of document.notebooks)
        item.fileIds = item.fileIds.filter((key) => key !== id);
    });
    if (ui.job?.sourceIds?.includes(id)) ui.job.controller.abort();
    if (ui.ask?.sourceIds?.includes(id)) ui.ask.controller.abort();
    return;
  }
  if (
    name === "delete-output" &&
    target &&
    window.confirm("删除这条记录、对话、复习进度和已保存音频？")
  ) {
    await change((document) => {
      const owner = document.notebooks.find((item) => item.id === target.id);
      if (!owner) throw new Error("笔记本已被删除。");
      owner.history = owner.history.filter((item) => item.id !== id);
    });
    if (ui.job?.entryId === id) ui.job.controller.abort();
    if (ui.ask?.entryId === id) ui.ask.controller.abort();
    if (playingId === id) closePlayer();
    return;
  }
  if (name === "select-output") {
    ui.selected.set(target.id, id);
    ui.conceptId = "";
    return render();
  }
  if (name === "tool") {
    ui.tool = id;
    return render();
  }
  if (name === "generate") return generate();
  if (name === "cancel") {
    ui.job?.controller.abort();
    return;
  }
  if (name === "cancel-ask") {
    ui.ask?.controller.abort();
    return;
  }
  if (name === "reference")
    return showReference(element.dataset.ref, element.dataset.scope);
  if (name === "concept") {
    ui.conceptId = id;
    return render();
  }
  if (name === "reveal") {
    ui.revealed = true;
    return render();
  }
  if (name === "grade") {
    if (ui.grading) return;
    const pending = dueCards(current())[0];
    if (!ui.revealed || pending?.key !== element.dataset.key) return;
    ui.grading = true;
    try {
      await change((document) => {
        document.reviews[pending.key] = reviewSchedule(
          document.reviews[pending.key],
          element.dataset.rating,
        );
      });
      ui.revealed = false;
    } finally {
      ui.grading = false;
      render();
    }
    return;
  }
  if (name === "synthesize" && entry?.kind === "podcast")
    return synthesize(entry);
  if (name === "play" && entry) {
    const blob = await storage.getAudio(entry.id);
    if (!blob)
      throw new Error(
        "此记录尚无已保存的音频，请先合成。旧版 JSON 备份不包含音频。",
      );
    if (playingId === entry.id) {
      audioPlayer.hidden = false;
      return;
    }
    return playBlob(blob, entry);
  }
  if (name === "export")
    return download(
      new Blob([JSON.stringify(current(), null, 2)], {
        type: "application/json",
      }),
      `小理工作区-${new Date().toISOString().slice(0, 10)}.json`,
    );
  if (name === "export-output" && entry)
    return download(
      new Blob(
        [
          `# ${entry.title}\n\n${entry.data.markdown || entry.data.script || JSON.stringify(entry.data, null, 2)}\n\n## 原文依据\n\n${entry.references.map((ref) => `[${ref.id}] ${ref.sourceName}\n${ref.text}`).join("\n\n")}`,
        ],
        { type: "text/markdown" },
      ),
      "小理学习记录.md",
    );
  if (name === "refresh-config") return refreshConfig();
  if (name === "sample") {
    await change((document) => {
      const file = {
        id: uniqueId(),
        name: "示例 · 力与运动",
        subject: "physics",
        kind: "note",
        content:
          "牛顿第二定律\n\n在惯性参考系中，物体的加速度与合外力成正比，与质量成反比，方向与合外力相同，写作 F = ma。\n\n受力分析\n\n先确定研究对象，画出所有外力，再选择坐标轴，把合力分解到各轴。合外力为零时，加速度为零，但速度可以不为零。\n\n易错点\n\n合力与速度方向不一定相同。匀速圆周运动的速率不变，但速度方向变化，因此仍有加速度。\n\n小例子\n\n质量为 2 kg 的小车受到 6 N 合外力，加速度为 3 m/s²。若合外力变成 0 N，小车保持原来的运动状态。",
        createdAt: new Date().toISOString(),
      };
      const notebook = {
        id: uniqueId(),
        name: "示例 · 物理学习",
        fileIds: [file.id],
        history: [],
      };
      document.files.unshift(file);
      document.notebooks.unshift(notebook);
      document.activeNotebookId = notebook.id;
    });
    announce(
      "示例资料已添加。生成内容仍会使用你配置的真实模型，没有预设的假成果。",
    );
  }
}

app.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (element && !element.disabled) handleAction(element).catch(problem);
});
app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.dataset.draft === "goal")
    ui.goals.set(target.dataset.book, target.value);
  if (target.dataset.draft === "question")
    ui.questions.set(target.dataset.entry, target.value);
  if (target.id === "source-search") {
    ui.search = target.value;
    document.getElementById("source-list").innerHTML = views.renderSources();
  }
});
app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.bind && book()) {
    const notebookId = book().id,
      checked = target.checked;
    change((document) => {
      const owner = document.notebooks.find((item) => item.id === notebookId);
      if (!owner) throw new Error("笔记本已经被删除。");
      if (checked && owner.fileIds.length >= 20)
        throw new Error("每个笔记本最多关联 20 份资料。");
      owner.fileIds = checked
        ? [...new Set([...owner.fileIds, target.dataset.bind])]
        : owner.fileIds.filter((id) => id !== target.dataset.bind);
    }).catch(problem);
  }
  if (target.dataset.mastery)
    change((document) => {
      document.graphMastery[target.dataset.mastery] = target.value;
    }).catch(problem);
  if (target.id === "graph-select") {
    ui.graphId = target.value;
    ui.conceptId = "";
    render();
  }
});
app.addEventListener("submit", (event) => {
  if (event.target.id === "ask-form") {
    event.preventDefault();
    ask(event.target.dataset.entry).catch(problem);
  }
});
app.addEventListener("keydown", (event) => {
  const target = event.target.closest('g[data-action="concept"]');
  if (target && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    handleAction(target).catch(problem);
  }
});
dialog.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-dialog]")) dialog.close();
  const element = event.target.closest("[data-action]");
  if (element) handleAction(element).catch(problem);
});
dialog.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target,
    fields = new FormData(form),
    submit = form.querySelector('[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  try {
    if (form.id === "unlock-form") {
      setAccessToken(String(fields.get("token") || ""));
      await refreshConfig();
      if (ui.locked) throw new Error("口令未通过验证，请检查后重试。");
    }
    if (form.id === "book-form")
      await change((document) => {
        const name = String(fields.get("name") || "").trim();
        if (!name) throw new Error("名称不能为空。");
        if (form.dataset.id) {
          const owner = document.notebooks.find(
            (item) => item.id === form.dataset.id,
          );
          if (!owner) throw new Error("笔记本已经被删除。");
          owner.name = name;
        } else {
          const notebook = { id: uniqueId(), name, fileIds: [], history: [] };
          document.notebooks.unshift(notebook);
          document.activeNotebookId = notebook.id;
        }
      });
    if (form.id === "note-form")
      await change((document) => {
        const content = String(fields.get("content") || "").trim();
        if (!content) throw new Error("正文不能为空。");
        const file = {
          id: uniqueId(),
          name: String(fields.get("title") || "").trim(),
          content,
          subject: "general",
          kind: "note",
          createdAt: new Date().toISOString(),
        };
        document.files.unshift(file);
        let owner = document.notebooks.find(
          (item) => item.id === document.activeNotebookId,
        );
        if (!owner) {
          owner = {
            id: uniqueId(),
            name: "我的学习笔记本",
            fileIds: [],
            history: [],
          };
          document.notebooks.unshift(owner);
          document.activeNotebookId = owner.id;
        }
        if (owner.fileIds.length < 20) owner.fileIds.push(file.id);
      });
    dialog.close();
  } catch (error) {
    let message = dialog.querySelector("[data-dialog-error]");
    if (!message) {
      message = document.createElement("p");
      message.dataset.dialogError = "";
      message.className = "dialog-error";
      message.setAttribute("role", "alert");
      form.prepend(message);
    }
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
for (const [id, callback] of [
  ["file-import", (input) => addFiles([...input.files])],
  ["backup-import", (input) => restore(input.files[0])],
])
  document.getElementById(id).addEventListener("change", (event) => {
    const pending = callback(event.target);
    event.target.value = "";
    Promise.resolve(pending).catch(problem);
  });
audioPlayer
  .querySelector("[data-close-player]")
  .addEventListener("click", closePlayer);
window.addEventListener("hashchange", () => {
  ui.route = ["workspace", "review", "graph", "settings"].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : "workspace";
  render();
});
window.addEventListener("pagehide", () => {
  ui.job?.controller.abort();
  ui.ask?.controller.abort();
  channel?.close();
});
window.addEventListener("focus", () => repo?.reload().catch(problem));

async function boot() {
  try {
    storage = await openStorage();
    repo = createRepository(storage, {
      onChange: () => render(),
      onConflict: () => {
        ui.notice =
          "另一页面已经更新工作区。已载入最新版本，请重试刚才的操作；输入草稿仍保留。";
        ui.error = true;
      },
    });
    views = createViews({
      ui,
      current,
      book,
      entryFor,
      allOutputs,
      sourcesFor,
    });
    if (
      current().files.some((file) =>
        file.content.startsWith("[PDF uploaded in static runtime."),
      )
    )
      ui.notice =
        "旧版 PDF 未保存实际正文，请重新导入原始 PDF。其他文字资料已保留。";
    if (globalThis.BroadcastChannel) {
      channel = new BroadcastChannel("xiaoli-study-v2");
      channel.onmessage = () =>
        repo
          .reload()
          .then((changed) => {
            if (changed) announce("已同步另一个页面的工作区更新。");
          })
          .catch(problem);
    }
    render();
    await refreshConfig();
  } catch (error) {
    app.innerHTML = `<main class="boot-error"><span class="brand-mark">✦</span><h1>先保护好你的资料</h1><p>${h(error.message)}</p><p>不会用空工作区覆盖原始数据。请先下载原始恢复文件，再导入已知有效的备份，或检查存储权限后重试。</p><button id="recover-data" class="button secondary">下载原始恢复文件</button><button id="restore-data" class="button secondary">从有效备份恢复</button><button id="retry-boot" class="button primary">重新尝试</button></main>`;
    document
      .getElementById("restore-data")
      .addEventListener("click", () =>
        document.getElementById("backup-import").click(),
      );
    document
      .getElementById("retry-boot")
      .addEventListener("click", () => location.reload());
    document
      .getElementById("recover-data")
      .addEventListener("click", async () => {
        const { recoveryData } = await import("./storage.js");
        try {
          download(
            new Blob([JSON.stringify(await recoveryData(), null, 2)], {
              type: "application/json",
            }),
            "小理原始恢复数据.json",
          );
        } catch (error) {
          alert(error.message);
        }
      });
  }
}
boot();
