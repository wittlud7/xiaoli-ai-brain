import { validateWorkspace } from "./workspace.js";
import { uniqueId } from "./identity.js";

export const VERSION = "0.2.0-beta.1";
export const TOOLS = {
  brief: "复习摘要",
  map: "概念图",
  cards: "记忆卡",
  podcast: "双人播客",
};
export const SUBJECTS = {
  general: "综合",
  physics: "物理",
  math: "数学",
  history: "历史",
  programming: "编程",
};
export const MAX_BACKUP_BYTES = 24 * 1024 * 1024;
const fail = (message) => {
  throw new Error(message);
};
const str = (value, max = 100000) =>
  typeof value === "string" && value.length <= max;
const id = (value) =>
  str(value, 100) &&
  /^[\w-]+$/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
const date = (value) => str(value, 40) && Number.isFinite(Date.parse(value));
const list = (value, max) => Array.isArray(value) && value.length <= max;
const text = (value, max) => str(value, max) && value.trim().length > 0;
const cloneFields = (value, fields) =>
  Object.fromEntries(fields.map((field) => [field, value[field]]));

export function emptyWorkspace() {
  return {
    version: 2,
    revision: 0,
    updatedAt: new Date().toISOString(),
    files: [],
    notebooks: [],
    activeNotebookId: null,
    reviews: {},
    graphMastery: {},
  };
}
function references(value) {
  if (!list(value, 24)) fail("原文引用格式无效。");
  const result = value.map((ref) => {
    if (
      !ref ||
      !/^R\d{1,2}$/.test(ref.id) ||
      !id(ref.sourceId) ||
      !text(ref.sourceName, 300) ||
      !text(ref.text, 1600) ||
      !Number.isInteger(ref.start) ||
      !Number.isInteger(ref.end) ||
      ref.start < 0 ||
      ref.end < ref.start ||
      ref.end - ref.start !== ref.text.length
    )
      fail("原文片段无效。");
    return cloneFields(ref, [
      "id",
      "sourceId",
      "sourceName",
      "text",
      "start",
      "end",
    ]);
  });
  if (new Set(result.map((ref) => ref.id)).size !== result.length)
    fail("引用编号重复。");
  return result;
}
function sourceRefs(value, refs) {
  if (
    !list(value, 24) ||
    !value.length ||
    value.some((key) => !refs.some((ref) => ref.id === key))
  )
    fail("生成内容的来源编号无效。");
  return [...new Set(value)];
}
export function validateOutput(entry) {
  if (
    !entry ||
    !id(entry.id) ||
    !Object.hasOwn(TOOLS, entry.kind) ||
    !text(entry.title, entry.legacy === true ? 600 : 150) ||
    !date(entry.createdAt) ||
    !entry.data ||
    !list(entry.sourceIds, 20) ||
    entry.sourceIds.some((value) => !id(value))
  )
    fail("学习记录格式无效。");
  const refs = references(entry.references);
  const legacy = entry.legacy === true;
  if (!legacy && refs.length === 0) fail("学习记录缺少原文引用。");
  if (
    !legacy &&
    (!entry.sourceIds.length ||
      refs.some((ref) => !entry.sourceIds.includes(ref.sourceId)))
  )
    fail("学习记录引用了未选中的资料。");
  const sourceVersions = {};
  for (const key of entry.sourceIds) {
    if (!legacy && !text(entry.sourceVersions?.[key], 100))
      fail("学习记录缺少来源版本。");
    if (str(entry.sourceVersions?.[key], 100))
      sourceVersions[key] = entry.sourceVersions[key];
  }
  const data = entry.data;
  let clean;
  if (entry.kind === "brief") {
    if (!text(data.markdown, 100000)) fail("摘要正文无效。");
    if (!legacy)
      sourceRefs(
        [...data.markdown.matchAll(/\[(R\d+)\]/g)].map((match) => match[1]),
        refs,
      );
    clean = { markdown: data.markdown };
  } else if (entry.kind === "podcast") {
    if (!text(data.script, legacy ? 100000 : 12000)) fail("播客脚本无效。");
    clean = {
      script: data.script,
      sourceRefs: legacy ? [] : sourceRefs(data.sourceRefs, refs),
    };
  } else if (entry.kind === "cards") {
    if (!list(data.cards, 12) || !data.cards.length) fail("记忆卡格式无效。");
    const cards = data.cards.map((card) => {
      if (
        !card ||
        !id(card.id) ||
        !text(card.question, 500) ||
        !text(card.answer, 2000)
      )
        fail("记忆卡内容无效。");
      return {
        id: card.id,
        question: card.question,
        answer: card.answer,
        sourceRefs: sourceRefs(card.sourceRefs, refs),
      };
    });
    if (new Set(cards.map((card) => card.id)).size !== cards.length)
      fail("记忆卡编号重复。");
    clean = { cards };
  } else {
    if (
      !list(data.concepts, 16) ||
      !data.concepts.length ||
      !list(data.links, 32)
    )
      fail("概念图格式无效。");
    const concepts = data.concepts.map((node) => {
      if (
        !node ||
        !id(node.id) ||
        !text(node.name, 100) ||
        !text(node.description, 1500)
      )
        fail("概念内容无效。");
      return {
        id: node.id,
        name: node.name,
        description: node.description,
        sourceRefs: sourceRefs(node.sourceRefs, refs),
      };
    });
    if (new Set(concepts.map((node) => node.id)).size !== concepts.length)
      fail("概念编号重复。");
    const links = data.links.map((link) => {
      if (
        !link ||
        !concepts.some((node) => node.id === link.from) ||
        !concepts.some((node) => node.id === link.to) ||
        link.from === link.to ||
        !text(link.label, 100)
      )
        fail("概念连线无效。");
      return cloneFields(link, ["from", "to", "label"]);
    });
    clean = { concepts, links };
  }
  const messages = entry.messages ?? [];
  if (!list(messages, 20)) fail("对话记录超出上限。");
  const cleanMessages = messages.map((message) => {
    if (
      !message ||
      !id(message.id) ||
      !["user", "assistant"].includes(message.role) ||
      !text(message.content, 20000) ||
      !date(message.createdAt)
    )
      fail("对话记录无效。");
    const messageRefs = references(message.references || []);
    if (message.role === "assistant")
      sourceRefs(
        [...message.content.matchAll(/\[(R\d+)\]/g)].map((match) => match[1]),
        messageRefs,
      );
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      references: messageRefs,
    };
  });
  if (
    new Set(cleanMessages.map((message) => message.id)).size !==
    cleanMessages.length
  )
    fail("对话编号重复。");
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    createdAt: entry.createdAt,
    data: clean,
    sourceIds: [...new Set(entry.sourceIds)],
    sourceVersions,
    references: refs,
    messages: cleanMessages,
    ...(legacy ? { legacy: true } : {}),
  };
}

export function validateDocument(raw) {
  if (
    !raw ||
    raw.version !== 2 ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 0 ||
    !date(raw.updatedAt) ||
    !list(raw.files, 200) ||
    !list(raw.notebooks, 100)
  )
    fail("工作区版本或格式无效。");
  const files = raw.files.map((file) => {
    if (
      !file ||
      !id(file.id) ||
      !text(file.name, 300) ||
      !Object.hasOwn(SUBJECTS, file.subject) ||
      !["note", "text", "pdf"].includes(file.kind) ||
      !text(file.content, 100000) ||
      !date(file.createdAt)
    )
      fail("资料格式无效。");
    return cloneFields(file, [
      "id",
      "name",
      "subject",
      "kind",
      "content",
      "createdAt",
    ]);
  });
  if (new Set(files.map((file) => file.id)).size !== files.length)
    fail("资料编号重复。");
  const outputIds = new Set();
  const notebooks = raw.notebooks.map((book) => {
    if (
      !book ||
      !id(book.id) ||
      !text(book.name, 300) ||
      !list(book.fileIds, 20) ||
      book.fileIds.some((key) => !files.some((file) => file.id === key)) ||
      !list(book.history, 30)
    )
      fail("笔记本格式或资料关联无效。");
    const history = book.history.map(validateOutput);
    for (const entry of history) {
      if (outputIds.has(entry.id)) fail("学习记录编号重复。");
      outputIds.add(entry.id);
    }
    return {
      id: book.id,
      name: book.name,
      fileIds: [...new Set(book.fileIds)],
      history,
    };
  });
  if (new Set(notebooks.map((book) => book.id)).size !== notebooks.length)
    fail("笔记本编号重复。");
  const reviewKeys = new Set(
    notebooks.flatMap((book) =>
      book.history
        .filter((entry) => entry.kind === "cards")
        .flatMap((entry) =>
          entry.data.cards.map((card) => `${entry.id}:${card.id}`),
        ),
    ),
  );
  const conceptKeys = new Set(
    notebooks.flatMap((book) =>
      book.history
        .filter((entry) => entry.kind === "map")
        .flatMap((entry) =>
          entry.data.concepts.map((node) => `${entry.id}:${node.id}`),
        ),
    ),
  );
  const reviews = {};
  if (
    !raw.reviews ||
    typeof raw.reviews !== "object" ||
    Array.isArray(raw.reviews) ||
    Object.keys(raw.reviews).length > 36000
  )
    fail("复习进度格式无效。");
  for (const [key, review] of Object.entries(raw.reviews)) {
    if (!reviewKeys.has(key)) continue;
    if (
      !review ||
      !date(review.dueAt) ||
      !date(review.lastReviewedAt) ||
      !Number.isInteger(review.intervalDays) ||
      review.intervalDays < 0 ||
      review.intervalDays > 3650 ||
      !Number.isInteger(review.repetitions) ||
      review.repetitions < 0 ||
      review.repetitions > 100000
    )
      fail("复习计划无效。");
    reviews[key] = cloneFields(review, [
      "dueAt",
      "lastReviewedAt",
      "intervalDays",
      "repetitions",
    ]);
  }
  const graphMastery = {};
  if (
    !raw.graphMastery ||
    typeof raw.graphMastery !== "object" ||
    Array.isArray(raw.graphMastery)
  )
    fail("概念掌握状态无效。");
  for (const [key, value] of Object.entries(raw.graphMastery))
    if (conceptKeys.has(key)) {
      if (!["learning", "review", "mastered"].includes(value))
        fail("概念掌握状态无效。");
      graphMastery[key] = value;
    }
  const activeNotebookId = notebooks.some(
    (book) => book.id === raw.activeNotebookId,
  )
    ? raw.activeNotebookId
    : notebooks[0]?.id || null;
  const result = {
    version: 2,
    revision: raw.revision,
    updatedAt: raw.updatedAt,
    files,
    notebooks,
    activeNotebookId,
    reviews,
    graphMastery,
  };
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    MAX_BACKUP_BYTES
  )
    fail("工作区超过 24 MB，请导出备份并清理旧记录。");
  return result;
}

export function migrateWorkspace(raw) {
  if (raw?.version === 2) return validateDocument(raw);
  const old = validateWorkspace(raw);
  const workspace = emptyWorkspace();
  workspace.files = old.files
    .filter((file) => file.content.trim())
    .map((file) => ({ ...file, name: file.name || "未命名资料" }));
  workspace.notebooks = old.notebooks.map((book) => ({
    ...book,
    name: book.name || "未命名笔记本",
    fileIds: book.fileIds.filter((key) =>
      workspace.files.some((file) => file.id === key),
    ),
    history: book.history
      .filter((entry) => (entry.data.text || entry.data.markdown || "").trim())
      .map((entry) => ({
        id: uniqueId(),
        kind: entry.tool === "podcast" ? "podcast" : "brief",
        title: entry.title || "旧版记录",
        createdAt: entry.createdAt,
        sourceIds: entry.data.activeFileIds.slice(0, 20),
        sourceVersions: {},
        references: [],
        messages: [],
        legacy: true,
        data:
          entry.tool === "podcast"
            ? { script: entry.data.text, sourceRefs: [] }
            : { markdown: entry.data.markdown },
      })),
  }));
  return validateDocument(workspace);
}

export function reviewSchedule(previous, rating, now = new Date()) {
  if (!["again", "hard", "good", "easy"].includes(rating))
    fail("请选择复习结果。");
  const old = previous?.intervalDays || 0;
  const intervalDays =
    rating === "again"
      ? 0
      : rating === "hard"
        ? Math.max(1, Math.ceil(old * 1.2))
        : rating === "easy"
          ? Math.max(4, Math.ceil(old * 2.5))
          : old === 0
            ? 1
            : Math.max(old + 1, Math.ceil(old * 2.2));
  const bounded = Math.min(3650, intervalDays);
  return {
    intervalDays: bounded,
    repetitions: Math.min(100000, (previous?.repetitions || 0) + 1),
    lastReviewedAt: now.toISOString(),
    dueAt: new Date(
      now.getTime() + (bounded ? bounded * 86400000 : 600000),
    ).toISOString(),
  };
}

export function dueCards(workspace, now = new Date()) {
  return workspace.notebooks
    .flatMap((book) =>
      book.history
        .filter((entry) => entry.kind === "cards")
        .flatMap((entry) =>
          entry.data.cards.map((card) => ({
            key: `${entry.id}:${card.id}`,
            book,
            entry,
            card,
            review: workspace.reviews[`${entry.id}:${card.id}`],
          })),
        ),
    )
    .filter(
      (item) => !item.review || Date.parse(item.review.dueAt) <= now.getTime(),
    )
    .sort(
      (a, b) =>
        Date.parse(a.review?.dueAt || 0) - Date.parse(b.review?.dueAt || 0),
    );
}
