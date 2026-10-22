import { emptyWorkspace, migrateWorkspace, validateDocument } from "./model.js";
import { WORKSPACE_KEY } from "./workspace.js";
import { sourceVersion } from "./identity.js";

export class ConflictError extends Error {
  constructor() {
    super("另一个页面已经修改了工作区，已载入最新数据，请重试刚才的操作。");
    this.name = "ConflictError";
  }
}
export class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageError";
  }
}

export async function openStorage({
  indexedDB = globalThis.indexedDB,
  name = "xiaoli-study-v2",
  legacyStorage = globalThis.localStorage,
} = {}) {
  if (!indexedDB)
    throw new StorageError(
      "浏览器未提供 IndexedDB。请使用正常模式的现代浏览器，并允许此站点保存数据。",
    );
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("workspace");
      request.result.createObjectStore("audio", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError("无法打开本地工作区。请检查浏览器存储权限。"));
    request.onblocked = () =>
      reject(
        new StorageError("本地数据库被旧页面占用，请关闭其他页面后重试。"),
      );
  });
  db.onversionchange = () => db.close();

  function transaction(stores, mode, operation) {
    return new Promise((resolve, reject) => {
      let result, failure;
      const tx = db.transaction(stores, mode);
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          failure ||
            new StorageError(
              tx.error?.name === "QuotaExceededError"
                ? "本地存储空间不足。原数据未被覆盖，请导出备份并清理旧资料。"
                : "保存失败。原数据未被覆盖，请重试或导出备份。",
            ),
        );
      tx.onerror = () => {};
      try {
        operation(
          tx,
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
            tx.abort();
          },
        );
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  }
  async function read() {
    return transaction(["workspace"], "readonly", (tx, done, abort) => {
      const request = tx.objectStore("workspace").get("main");
      request.onsuccess = () => {
        try {
          done(request.result ? validateDocument(request.result) : null);
        } catch {
          abort(
            new StorageError(
              "保存的工作区已损坏。原数据保持不变，请先导出原始数据，再导入有效备份。",
            ),
          );
        }
      };
    });
  }
  async function save(data, expectedRevision, removeAudioIds = []) {
    const clean = validateDocument({
      ...data,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    });
    return transaction(
      ["workspace", "audio"],
      "readwrite",
      (tx, done, abort) => {
        const store = tx.objectStore("workspace");
        const request = store.get("main");
        request.onsuccess = () => {
          try {
            const current = request.result;
            if ((current?.revision ?? 0) !== expectedRevision)
              return abort(new ConflictError());
            store.put(clean, "main");
            for (const id of removeAudioIds) tx.objectStore("audio").delete(id);
            done(clean);
          } catch (error) {
            abort(
              error.name === "QuotaExceededError"
                ? new StorageError(
                    "本地存储空间不足，原数据未改变。请导出备份并清理旧资料。",
                  )
                : error,
            );
          }
        };
      },
    );
  }
  let document;
  try {
    document = await read();
    if (!document) {
      let legacy = null;
      try {
        const raw = legacyStorage?.getItem(WORKSPACE_KEY);
        if (raw) legacy = JSON.parse(raw);
        else {
          const files = legacyStorage?.getItem("xiaoli-static-files-v1");
          const notebooks = legacyStorage?.getItem(
            "xiaoli-static-notebooks-v1",
          );
          if (files || notebooks)
            legacy = {
              version: 1,
              files: JSON.parse(files || "[]"),
              notebooks: JSON.parse(notebooks || "[]"),
              graphMastery: JSON.parse(
                legacyStorage?.getItem("xiaoli-static-graph-mastery-v1") ||
                  "{}",
              ),
            };
        }
      } catch {
        throw new StorageError(
          "旧版数据无法读取，已保留原始存储。请导出原始数据后导入有效备份。",
        );
      }
      document = legacy ? migrateWorkspace(legacy) : emptyWorkspace();
      try {
        document = await save(document, 0);
      } catch (error) {
        if (error instanceof ConflictError) document = await read();
        else throw error;
      }
    }
  } catch (error) {
    db.close();
    throw error;
  }

  return {
    document,
    read,
    save,
    raw: () =>
      transaction(["workspace"], "readonly", (tx, done) => {
        const request = tx.objectStore("workspace").get("main");
        request.onsuccess = () => done(request.result);
      }),
    getAudio: (id) =>
      transaction(["workspace", "audio"], "readonly", (tx, done) => {
        const workspace = tx.objectStore("workspace").get("main");
        workspace.onsuccess = () => {
          const entry = workspace.result?.notebooks
            .flatMap((book) => book.history)
            .find((entry) => entry.id === id && entry.kind === "podcast");
          if (!entry) return done(null);
          const request = tx.objectStore("audio").get(id);
          request.onsuccess = () =>
            done(
              request.result?.scriptVersion ===
                sourceVersion({ content: entry.data.script })
                ? request.result.blob
                : null,
            );
        };
      }),
    saveAudio: (id, blob, { scriptVersion } = {}) => {
      if (
        !(blob instanceof Blob) ||
        blob.type !== "audio/mpeg" ||
        blob.size > 25 * 1024 * 1024
      )
        return Promise.reject(new StorageError("音频格式无效或超过 25 MB。"));
      return transaction(
        ["workspace", "audio"],
        "readwrite",
        (tx, done, abort) => {
          const request = tx.objectStore("workspace").get("main");
          request.onsuccess = () => {
            try {
              const entry = request.result?.notebooks
                .flatMap((book) => book.history)
                .find((entry) => entry.id === id && entry.kind === "podcast");
              if (!entry)
                return abort(
                  new StorageError("这条学习记录已被删除，音频未保存。"),
                );
              if (
                scriptVersion &&
                scriptVersion !== sourceVersion({ content: entry.data.script })
              )
                return abort(
                  new StorageError(
                    "播客脚本已经变化，本次音频未写入其他脚本。",
                  ),
                );
              tx.objectStore("audio").put({
                id,
                blob,
                scriptVersion: sourceVersion({ content: entry.data.script }),
              });
              done(true);
            } catch (error) {
              abort(
                new StorageError(
                  error.name === "QuotaExceededError"
                    ? "音频无法保存：本地空间不足，请立即下载备份。"
                    : "音频保存失败，请立即下载备份。",
                ),
              );
            }
          };
        },
      );
    },
    close: () => db.close(),
  };
}

const outputIds = (document) =>
  document.notebooks.flatMap((book) => book.history.map((entry) => entry.id));
export function createRepository(
  storage,
  { onChange = () => {}, onConflict = () => {} } = {},
) {
  let current = storage.document;
  let queue = Promise.resolve();
  function enqueue(operation) {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  }
  return {
    get document() {
      return current;
    },
    mutate(change) {
      return enqueue(async () => {
        const candidate = structuredClone(current);
        change(candidate);
        const clean = validateDocument(candidate);
        const retained = new Set(outputIds(clean));
        try {
          current = await storage.save(
            clean,
            current.revision,
            outputIds(current).filter((id) => !retained.has(id)),
          );
        } catch (error) {
          if (error instanceof ConflictError) {
            current = await storage.read();
            onConflict();
            onChange(current);
          }
          throw error;
        }
        onChange(current);
        return current;
      });
    },
    reload() {
      return enqueue(async () => {
        const fresh = await storage.read();
        if (fresh && fresh.revision !== current.revision) {
          current = fresh;
          onChange(current);
          return true;
        }
        return false;
      });
    },
  };
}

export async function recoveryData({
  indexedDB = globalThis.indexedDB,
  name = "xiaoli-study-v2",
  legacyStorage = globalThis.localStorage,
} = {}) {
  const result = {
    recoveryFormat: 1,
    exportedAt: new Date().toISOString(),
    legacy: {},
    indexedDB: null,
  };
  for (const key of [
    WORKSPACE_KEY,
    "xiaoli-static-files-v1",
    "xiaoli-static-notebooks-v1",
    "xiaoli-static-graph-mastery-v1",
  ]) {
    try {
      const raw = legacyStorage?.getItem(key);
      if (raw !== null && raw !== undefined) result.legacy[key] = raw;
    } catch {
      result.legacyError = "无法访问旧版存储。";
    }
  }
  if (indexedDB) {
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => {
          request.transaction.abort();
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (db.objectStoreNames.contains("workspace"))
        result.indexedDB = await new Promise((resolve, reject) => {
          const request = db
            .transaction(["workspace"], "readonly")
            .objectStore("workspace")
            .get("main");
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
        });
    } catch {
      result.indexedDBError = "无法读取本地数据库，请保留此浏览器原始数据。";
    } finally {
      db?.close();
    }
  }
  return result;
}

// Explicit, confirmed recovery only. Never called during normal boot/migration.
export async function restoreStorageFromBackup(
  raw,
  { indexedDB = globalThis.indexedDB, name = "xiaoli-study-v2" } = {},
) {
  const data = migrateWorkspace(raw);
  if (!indexedDB)
    throw new StorageError(
      "浏览器不允许本地存储，暂时不能恢复。请先检查权限。",
    );
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("workspace");
      request.result.createObjectStore("audio", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError("无法打开恢复数据库。"));
    request.onblocked = () =>
      reject(new StorageError("请关闭其他旧页面后重试恢复。"));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(["workspace"], "readwrite"),
        store = tx.objectStore("workspace");
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () =>
        reject(
          failure ||
            new StorageError("恢复未完成，原记录仍保留。请检查空间和权限。"),
        );
      tx.onerror = () => {};
      const request = store.get("main");
      request.onsuccess = () => {
        try {
          const previous = request.result?.revision;
          const revision = Math.max(
            Date.now(),
            Number.isSafeInteger(previous) && previous < Number.MAX_SAFE_INTEGER
              ? previous + 1
              : 0,
          );
          result = validateDocument({
            ...data,
            revision,
            updatedAt: new Date().toISOString(),
          });
          store.put(result, "main");
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}
