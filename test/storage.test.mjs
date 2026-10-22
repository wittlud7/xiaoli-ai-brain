import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  openStorage,
  createRepository,
  ConflictError,
  recoveryData,
} from "../web/storage.js";
import {
  emptyWorkspace,
  migrateWorkspace,
  validateDocument,
  dueCards,
  reviewSchedule,
} from "../web/model.js";
import { studyGenerate } from "../lib/study.mjs";
import { structuredFixture } from "../fixtures/providers.mjs";
import { sourceVersion } from "../web/identity.js";

const source = {
  id: "file-1",
  name: "物理笔记",
  content: "牛顿第二定律：F = ma。",
  subject: "physics",
  kind: "note",
  createdAt: "2026-10-22T00:00:00.000Z",
};
const legacy = (value) => ({
  getItem: (key) => (key === "xiaoli-workspace-v1" ? value : null),
});
async function connect(t, options = {}) {
  const indexedDB = options.indexedDB || new IDBFactory();
  const storage = await openStorage({
    indexedDB,
    name: "test",
    legacyStorage: null,
    ...options,
  });
  t.after(() => storage.close());
  return { storage, indexedDB, repository: createRepository(storage) };
}
async function insertEntry(repository, kind = "cards") {
  const entry = await studyGenerate(
    { kind, sources: [source] },
    structuredFixture,
  );
  await repository.mutate((document) => {
    document.files = [source];
    document.notebooks = [
      { id: "book-1", name: "物理", fileIds: [source.id], history: [entry] },
    ];
    document.activeNotebookId = "book-1";
  });
  return entry;
}
test("new storage has a real empty state and committed revision", async (t) => {
  const { storage } = await connect(t);
  assert.equal(storage.document.revision, 1);
  assert.deepEqual(storage.document.files, []);
  assert.deepEqual(storage.document.notebooks, []);
  assert.deepEqual(await storage.read(), storage.document);
});
test("v1 migration preserves text and history without claiming old citations", async (t) => {
  const old = {
    version: 1,
    files: [source],
    notebooks: [
      {
        id: "book-1",
        name: "物理",
        fileIds: [source.id],
        history: [
          {
            id: "history-1",
            tool: "summary",
            title: "旧摘要",
            createdAt: source.createdAt,
            data: { markdown: "这是旧版摘要", activeFileIds: [source.id] },
          },
        ],
      },
    ],
    graphMastery: {},
  };
  const raw = JSON.stringify(old),
    previous = legacy(raw);
  const { storage } = await connect(t, { legacyStorage: previous });
  const migrated = storage.document;
  assert.equal(migrated.version, 2);
  assert.equal(migrated.files[0].content, source.content);
  assert.equal(migrated.notebooks[0].history[0].legacy, true);
  assert.deepEqual(migrated.notebooks[0].history[0].references, []);
  assert.equal(previous.getItem("xiaoli-workspace-v1"), raw);
  assert.deepEqual(
    migrateWorkspace(JSON.parse(JSON.stringify(migrated))),
    migrated,
  );
});
test("invalid legacy data is not replaced with an empty workspace", async () => {
  const indexedDB = new IDBFactory(),
    raw = "{broken";
  await assert.rejects(
    openStorage({ indexedDB, name: "broken", legacyStorage: legacy(raw) }),
    /旧版/,
  );
  const recovery = await recoveryData({
    indexedDB,
    name: "broken",
    legacyStorage: legacy(raw),
  });
  assert.equal(recovery.legacy["xiaoli-workspace-v1"], raw);
  assert.equal(recovery.indexedDB, null);
});
test("migration preserves long legacy names, titles and complete podcast scripts", () => {
  const title = "旧标题".repeat(100),
    name = "旧笔记本".repeat(50),
    script = "主持人A：旧版内容。".repeat(2000);
  const old = {
    version: 1,
    files: [source],
    notebooks: [
      {
        id: "old",
        name,
        fileIds: [source.id],
        history: [
          {
            id: "entry",
            tool: "podcast",
            title,
            createdAt: source.createdAt,
            data: { text: script, activeFileIds: [source.id] },
          },
        ],
      },
    ],
    graphMastery: {},
  };
  const migrated = migrateWorkspace(old);
  assert.equal(migrated.notebooks[0].name, name);
  assert.equal(migrated.notebooks[0].history[0].title, title);
  assert.equal(migrated.notebooks[0].history[0].data.script, script);
});
test("serialized mutations on one repository preserve both operations", async (t) => {
  const { repository, storage } = await connect(t);
  await Promise.all([
    repository.mutate((document) => {
      document.files.push(source);
    }),
    repository.mutate((document) => {
      document.files.push({ ...source, id: "file-2", name: "另一份" });
    }),
  ]);
  assert.equal((await storage.read()).files.length, 2);
  assert.equal(repository.document.revision, 3);
});
test("two connections reject a stale write and allow an explicit retry", async (t) => {
  const indexedDB = new IDBFactory();
  const first = await connect(t, { indexedDB }),
    second = await connect(t, { indexedDB });
  const results = await Promise.allSettled([
    first.repository.mutate((document) => {
      document.files.push(source);
    }),
    second.repository.mutate((document) => {
      document.files.push({ ...source, id: "file-2" });
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const failure = results.find((result) => result.status === "rejected");
  assert.ok(failure.reason instanceof ConflictError);
  const loser = results[0].status === "rejected" ? first : second;
  assert.equal(loser.repository.document.files.length, 1);
  await loser.repository.mutate((document) => {
    document.files.push({ ...source, id: "retry" });
  });
  assert.equal((await first.storage.read()).files.length, 2);
});
test("invalid mutations and failed saves leave committed state unchanged", async (t) => {
  const { storage } = await connect(t);
  const repo = createRepository({
    ...storage,
    save: async () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
  });
  await assert.rejects(
    repo.mutate((document) => {
      document.files.push(source);
    }),
    /quota/,
  );
  assert.equal(repo.document.files.length, 0);
  assert.equal((await storage.read()).files.length, 0);
  const ordinary = createRepository(storage);
  await assert.rejects(
    ordinary.mutate((document) => {
      document.files.push({ ...source, id: '"><script>' });
    }),
  );
  assert.equal((await storage.read()).revision, 1);
});
test("audio survives reopen and is deleted atomically with its record", async (t) => {
  const { repository, storage, indexedDB } = await connect(t);
  const entry = await insertEntry(repository, "podcast");
  const blob = new Blob(["fixture audio"], { type: "audio/mpeg" });
  await storage.saveAudio(entry.id, blob);
  const reopened = await connect(t, { indexedDB });
  assert.equal(
    await (await reopened.storage.getAudio(entry.id)).text(),
    "fixture audio",
  );
  await repository.mutate((document) => {
    document.notebooks[0].history = [];
  });
  assert.equal(await storage.getAudio(entry.id), null);
  await assert.rejects(storage.saveAudio(entry.id, blob), /删除/);
});

test("importing a changed script cannot reuse or attach old audio", async (t) => {
  const { repository, storage } = await connect(t);
  const entry = await insertEntry(repository, "podcast");
  const blob = new Blob(["original audio"], { type: "audio/mpeg" });
  await storage.saveAudio(entry.id, blob);
  const oldVersion = sourceVersion({ content: entry.data.script });
  await repository.mutate((document) => {
    document.notebooks[0].history[0].data.script += "\n主持人A：新内容。";
  });
  assert.equal(await storage.getAudio(entry.id), null);
  await assert.rejects(
    storage.saveAudio(entry.id, blob, { scriptVersion: oldVersion }),
    /变化/,
  );
});
test("deleting a source unbinds it while the historical quote remains available", async (t) => {
  const { repository } = await connect(t);
  const entry = await insertEntry(repository, "brief");
  await repository.mutate((document) => {
    document.files = [];
    document.notebooks[0].fileIds = [];
  });
  assert.equal(
    repository.document.notebooks[0].history[0].references[0].text,
    source.content,
  );
  assert.equal(repository.document.notebooks[0].history[0].id, entry.id);
});
test("review scheduling is real, persistent and independent of notebook selection", async (t) => {
  const { repository, storage } = await connect(t);
  const entry = await insertEntry(repository);
  const now = new Date("2026-10-22T00:00:00.000Z");
  assert.equal(dueCards(repository.document, now).length, 2);
  const key = `${entry.id}:${entry.data.cards[0].id}`;
  await repository.mutate((document) => {
    document.reviews[key] = reviewSchedule(null, "good", now);
  });
  assert.equal(dueCards(await storage.read(), now).length, 1);
  assert.equal(
    dueCards(await storage.read(), new Date("2026-10-23T00:00:01.000Z")).length,
    2,
  );
  assert.equal(
    reviewSchedule(null, "again", now).dueAt,
    "2026-10-22T00:10:00.000Z",
  );
  assert.equal(reviewSchedule(null, "easy", now).intervalDays, 4);
  await repository.mutate((document) => {
    document.notebooks[0].history = [];
  });
  assert.deepEqual(repository.document.reviews, {});
});
test("v2 backups reject injected identities and dangling graph edges", async () => {
  const entry = await studyGenerate(
    { kind: "map", sources: [source] },
    structuredFixture,
  );
  const document = {
    ...emptyWorkspace(),
    files: [source],
    notebooks: [
      { id: "book", name: "学习", fileIds: [source.id], history: [entry] },
    ],
  };
  assert.equal(validateDocument(document).notebooks.length, 1);
  document.notebooks[0].history[0].data.links[0].to = "missing";
  assert.throws(() => validateDocument(document));
  document.notebooks[0].history = [];
  document.files[0] = { ...source, id: '" onclick="alert(1)' };
  assert.throws(() => validateDocument(document));
});
