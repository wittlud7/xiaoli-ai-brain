import { test } from "node:test";
import assert from "node:assert/strict";
import {
  persist,
  snapshot,
  validateWorkspace,
  WORKSPACE_KEY,
} from "../web/workspace.js";
import { readSource } from "../web/files.js";
import { buildSpeechSegments, chunkText } from "../lib/speech.mjs";

function state() {
  return {
    files: [
      {
        id: "file-1",
        name: "笔记",
        subject: "physics",
        kind: "note",
        content: "F = ma",
        createdAt: "2026-10-17",
      },
    ],
    notebooks: [
      {
        id: "book-1",
        name: "物理",
        fileIds: ["file-1"],
        history: [
          {
            id: "entry-1",
            tool: "podcast",
            title: "播客",
            createdAt: "2026-10-17",
            data: {
              text: "主持人A：你好",
              activeFileIds: ["file-1"],
              audioData: { data: "huge-audio", mimeType: "audio/mpeg" },
            },
          },
        ],
      },
    ],
    graph: { mastery: { force: "learning" } },
    accessToken: "secret",
  };
}
test("backup roundtrip retains source text and history while dropping audio and secrets", () => {
  const data = snapshot(state());
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(data))), data);
  assert.equal(data.files[0].content, "F = ma");
  assert.doesNotMatch(
    JSON.stringify(data),
    /huge-audio|secret|accessToken|audioData/,
  );
  assert.ok(state().notebooks[0].history[0].data.audioData);
});
test("atomic workspace writes preserve prior data on quota errors", () => {
  let saved = "previous";
  const storage = {
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.throws(() => persist(storage, state()), /quota/);
  assert.equal(saved, "previous");
  persist(
    {
      setItem: (key, value) => {
        assert.equal(key, WORKSPACE_KEY);
        saved = value;
      },
    },
    state(),
  );
  assert.equal(JSON.parse(saved).files.length, 1);
});
test("backup validation rejects unsafe identifiers, broken associations and oversized content", () => {
  const invalid = [
    (data) => {
      data.files[0].id = '\" onmouseover=alert(1)';
    },
    (data) => {
      data.notebooks[0].fileIds = ["missing"];
    },
    (data) => {
      data.files[0].content = "x".repeat(100001);
    },
    (data) => {
      data.graphMastery = JSON.parse('{"__proto__":"mastered"}');
    },
    (data) => {
      data.files.push({ ...data.files[0] });
    },
    (data) => {
      data.notebooks[0].history[0].data.text = {};
    },
  ];
  for (const mutate of invalid) {
    const data = snapshot(state());
    mutate(data);
    assert.throws(() => validateWorkspace(data));
  }
  assert.throws(() => validateWorkspace({ version: 2 }));
});
test("source reader imports plain text and rejects unsupported, empty or oversized files", async () => {
  assert.equal(
    await readSource(new File(["学习资料"], "notes.md")),
    "学习资料",
  );
  await assert.rejects(readSource(new File(["hello"], "notes.exe")), /Choose/);
  await assert.rejects(readSource(new File(["  "], "notes.txt")), /1–100,000/);
  await assert.rejects(
    readSource(new File(["x".repeat(100001)], "notes.txt")),
    /1–100,000/,
  );
  await assert.rejects(
    readSource({ size: 11 * 1024 * 1024, name: "large.pdf" }),
    /10 MB/,
  );
});
test("speech parsing identifies hosts, strips formatting and bounds chunks", () => {
  const parts = buildSpeechSegments(
    "主持人 A：**你好**\nHost B: 欢迎\n主持人B：继续",
  );
  assert.equal(parts.length, 2);
  assert.equal(parts[0].speaker, "hostA");
  assert.equal(parts[0].input, "你好");
  assert.equal(parts[1].speaker, "hostB");
  assert.equal(parts[1].input, "欢迎 继续");
  assert.deepEqual(chunkText(""), []);
  const chunks = chunkText("中文".repeat(5000));
  assert.ok(chunks.every((chunk) => chunk.length <= 3900));
  assert.equal(chunks.join(""), "中文".repeat(5000));
  assert.ok(
    chunkText("x".repeat(3900) + "。" + "x".repeat(4000)).every(
      (chunk) => chunk.length <= 3900,
    ),
  );
  const emoji = chunkText("x".repeat(3899) + "😀tail");
  assert.equal(emoji.join(""), "x".repeat(3899) + "😀tail");
  assert.ok(emoji.every((part) => !/[\uD800-\uDBFF]$/.test(part)));
  assert.equal(
    buildSpeechSegments("主持人A：hi", { OPENAI_TTS_VOICE_HOST_A: "custom" })[0]
      .voice,
    "custom",
  );
});
