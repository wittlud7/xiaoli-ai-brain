export const WORKSPACE_KEY = "xiaoli-workspace-v1";
const subjects = ["general", "physics", "math", "history", "programming"];
const string = (value, max = 100000) =>
  typeof value === "string" && value.length <= max;
const id = (value) => string(value, 100) && /^[a-zA-Z0-9_-]+$/.test(value);

// Rebuild an allowlisted shape, excluding credentials and transient audio.
export function validateWorkspace(raw) {
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.files) ||
    !Array.isArray(raw.notebooks) ||
    raw.files.length > 200 ||
    raw.notebooks.length > 100
  )
    throw new Error("Unsupported workspace backup.");
  const files = raw.files.map((file) => {
    if (
      !file ||
      !id(file.id) ||
      !string(file.name, 300) ||
      !subjects.includes(file.subject) ||
      !["note", "text", "pdf"].includes(file.kind) ||
      !string(file.content) ||
      !string(file.createdAt, 100)
    )
      throw new Error("Invalid source in workspace.");
    return Object.fromEntries(
      ["id", "name", "subject", "kind", "content", "createdAt"].map((key) => [
        key,
        file[key],
      ]),
    );
  });
  const fileIds = new Set(files.map((file) => file.id));
  if (fileIds.size !== files.length) throw new Error("Duplicate source IDs.");
  const notebooks = raw.notebooks.map((book) => {
    if (
      !book ||
      !id(book.id) ||
      !string(book.name, 300) ||
      !Array.isArray(book.fileIds) ||
      book.fileIds.length > 20 ||
      book.fileIds.some((value) => !fileIds.has(value)) ||
      !Array.isArray(book.history) ||
      book.history.length > 12
    )
      throw new Error("Invalid notebook in workspace.");
    const history = book.history.map((entry) => {
      if (
        !entry ||
        !id(entry.id) ||
        !["summary", "mindmap", "podcast"].includes(entry.tool) ||
        !string(entry.title, 600) ||
        !string(entry.createdAt, 100) ||
        !entry.data ||
        !Array.isArray(entry.data.activeFileIds) ||
        entry.data.activeFileIds.length > 200 ||
        entry.data.activeFileIds.some((value) => !id(value))
      )
        throw new Error("Invalid generation history.");
      const field = entry.tool === "podcast" ? "text" : "markdown";
      if (!string(entry.data[field]))
        throw new Error("Invalid generation text.");
      return {
        id: entry.id,
        tool: entry.tool,
        title: entry.title,
        createdAt: entry.createdAt,
        data: {
          [field]: entry.data[field],
          activeFileIds: entry.data.activeFileIds.filter((value) =>
            fileIds.has(value),
          ),
        },
      };
    });
    if (new Set(history.map((entry) => entry.id)).size !== history.length)
      throw new Error("Duplicate history IDs.");
    return {
      id: book.id,
      name: book.name,
      fileIds: [...new Set(book.fileIds)],
      history,
    };
  });
  if (new Set(notebooks.map((book) => book.id)).size !== notebooks.length)
    throw new Error("Duplicate notebook IDs.");
  const graphMastery = {};
  for (const [key, value] of Object.entries(raw.graphMastery || {})) {
    if (
      !id(key) ||
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !["mastered", "learning", "review", "locked"].includes(value)
    )
      throw new Error("Invalid graph state.");
    graphMastery[key] = value;
  }
  const result = { version: 1, files, notebooks, graphMastery };
  if (JSON.stringify(result).length > 1500000)
    throw new Error(
      "Workspace is too large. Export a backup and remove old sources or history.",
    );
  return result;
}
export function snapshot(state) {
  return validateWorkspace({
    version: 1,
    files: state.files,
    notebooks: state.notebooks,
    graphMastery: state.graph.mastery,
  });
}
export function persist(storage, state) {
  // One atomic write preserves the previous workspace if the quota is exceeded.
  storage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot(state)));
}
