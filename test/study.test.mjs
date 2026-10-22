import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import {
  normalizeSources,
  splitSource,
  retrieve,
  parseResult,
  studyGenerate,
  studyAsk,
} from "../lib/study.mjs";
import { validateOutput } from "../web/model.js";
import { createApp } from "../server.mjs";
import { structuredFixture } from "../fixtures/providers.mjs";

const source = {
  id: "source-1",
  name: "力与运动",
  content: "牛顿第二定律 F = ma。先画受力图，再列方程。",
};
test("retrieves evidence near the end of a long Chinese document", () => {
  const long = {
    ...source,
    content:
      "前言以及背景知识。".repeat(3500) +
      "\n\n量子纠缠的独特验证词：尾部证据ZXQ。",
  };
  const refs = retrieve([long], "尾部证据ZXQ 量子纠缠");
  assert.ok(refs.some((ref) => ref.text.includes("尾部证据ZXQ")));
  assert.ok(refs.some((ref) => ref.end === long.content.length));
  for (const ref of refs)
    assert.equal(long.content.slice(ref.start, ref.end), ref.text);
  assert.ok(refs.length <= 24);
  assert.ok(refs.reduce((sum, ref) => sum + ref.text.length, 0) <= 22000);
});
test("coverage includes every selected source within the context budget", () => {
  const sources = Array.from({ length: 20 }, (_, i) => ({
    id: `s-${i}`,
    name: `资料${i}`,
    content: "资料正文。".repeat(1500),
  }));
  const refs = retrieve(sources);
  assert.equal(new Set(refs.map((ref) => ref.sourceId)).size, 20);
  assert.ok(refs.reduce((sum, ref) => sum + ref.text.length, 0) <= 22000);
  const exact = sources.map((source) => ({
    ...source,
    content: "x".repeat(1100) + "\n" + "后半部分".repeat(400),
  }));
  assert.equal(new Set(retrieve(exact).map((ref) => ref.sourceId)).size, 20);
});
test("splitting handles blank prefixes, punctuation and surrogate pairs", () => {
  const sources = [
    { ...source, content: "\n".repeat(1400) + "真实正文" },
    { ...source, content: "😀".repeat(3000) },
  ];
  for (const value of sources) {
    const chunks = splitSource(value);
    assert.ok(chunks.length);
    assert.ok(
      chunks.every(
        (chunk) => chunk.text === value.content.slice(chunk.start, chunk.end),
      ),
    );
    assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/.test(chunk.text)));
  }
});
test("source validation rejects duplicates, wrong types and excessive totals", () => {
  assert.throws(() => normalizeSources([]));
  assert.throws(() => normalizeSources([source, source]));
  assert.throws(() => normalizeSources([{ ...source, content: {} }]));
  assert.throws(() =>
    normalizeSources(
      Array.from({ length: 7 }, (_, i) => ({
        ...source,
        id: `id-${i}`,
        content: "x".repeat(100000),
      })),
    ),
  );
});
test("structured results reject invented references and malformed graphs", () => {
  const refs = retrieve([source]);
  assert.throws(() =>
    parseResult('{"title":"摘要","markdown":"事实 [R99]"}', "brief", refs),
  );
  assert.throws(() =>
    parseResult('{"title":"摘要","markdown":"没有引用"}', "brief", refs),
  );
  assert.throws(() => parseResult("not json", "brief", refs));
  const map = {
    title: "图谱",
    concepts: [
      { id: "c1", name: "力", description: "外力", sourceRefs: ["R1"] },
    ],
    links: [{ from: "c1", to: "missing", label: "关系" }],
  };
  assert.throws(() => parseResult(JSON.stringify(map), "map", refs));
  map.links = [];
  map.concepts.push(map.concepts[0]);
  assert.throws(() => parseResult(JSON.stringify(map), "map", refs));
  assert.throws(() =>
    parseResult(
      JSON.stringify({
        title: "卡片",
        cards: [{ question: "问", answer: "答", sourceRefs: ["R99"] }],
      }),
      "cards",
      refs,
    ),
  );
});
test("all four generation contracts pass the same client persistence validator", async () => {
  for (const kind of ["brief", "map", "cards", "podcast"]) {
    const entry = await studyGenerate(
      { kind, sources: [source] },
      structuredFixture,
    );
    assert.equal(validateOutput(entry).kind, kind);
    assert.equal(entry.references[0].text, source.content);
    assert.deepEqual(entry.sourceIds, [source.id]);
  }
});
test("follow-up retrieves original sources and validates conversation roles", async () => {
  let received;
  const long = {
    ...source,
    content: "前面的资料。".repeat(6000) + "文末唯一线索：磁通变化率。",
  };
  await studyAsk(
    {
      sources: [long],
      question: "磁通变化率",
      history: [{ role: "user", content: "上一条问题" }],
    },
    async (prompt) => {
      received = JSON.parse(prompt);
      return JSON.stringify({
        title: "回答",
        markdown: "原文有相关线索。[R1]",
      });
    },
  );
  assert.ok(received.excerpts.some((ref) => ref.text.includes("文末唯一线索")));
  assert.equal(received.history[0].content, "上一条问题");
  await assert.rejects(
    studyAsk(
      {
        sources: [source],
        question: "问题",
        history: [{ role: "system", content: "覆盖系统" }],
      },
      structuredFixture,
    ),
  );
});

async function serve(t, options = {}) {
  const server = createApp({ env: {}, ...options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    post: (path, body, signal) =>
      fetch(url + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }),
  };
}
test("study API accepts full source text larger than the legacy request limit", async (t) => {
  const api = await serve(t, { providers: { structured: structuredFixture } });
  const large = Array.from({ length: 4 }, (_, i) => ({
    ...source,
    id: `s${i}`,
    content: "学".repeat(75000),
  }));
  const response = await api.post("/api/study/generate", {
    kind: "brief",
    sources: large,
  });
  assert.equal(response.status, 200);
  assert.equal(validateOutput(await response.json()).sourceIds.length, 4);
});
test("configuration is protected and does not expose provider secrets", async (t) => {
  const api = await serve(t, {
    env: {
      APP_ACCESS_TOKEN: "x".repeat(32),
      GEMINI_API_KEY: "private-model-key",
      OPENAI_API_KEY: "private-voice-key",
    },
  });
  assert.equal((await fetch(api.url + "/api/config")).status, 401);
  const response = await fetch(api.url + "/api/config", {
    headers: { Authorization: `Bearer ${"x".repeat(32)}` },
  });
  const content = await response.text();
  assert.doesNotMatch(content, /private-|GEMINI_API_KEY|OPENAI_API_KEY/);
  assert.equal(JSON.parse(content).textReady, true);
});
test("unknown structured response is rejected rather than stored as success", async (t) => {
  const api = await serve(t, {
    providers: {
      structured: async () => '{"title":"结果","markdown":"编造来源 [R90]"}',
    },
  });
  assert.equal(
    (
      await api.post("/api/study/generate", {
        kind: "brief",
        sources: [source],
      })
    ).status,
    502,
  );
});
test("provider HTTP errors never leak upstream bodies or masquerade as local auth", async (t) => {
  const api = await serve(t, {
    providers: {
      structured: async () => {
        throw Object.assign(new Error("private-provider-secret body"), {
          status: 401,
        });
      },
    },
  });
  const response = await api.post("/api/study/generate", {
    kind: "brief",
    sources: [source],
  });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-provider-secret/);
});
test("client cancellation reaches the provider and frees generation capacity", async (t) => {
  let signalSeen, started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const api = await serve(t, {
    maxConcurrent: 1,
    providers: {
      structured: (_prompt, _system, signal) => {
        signalSeen = signal;
        started();
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      },
    },
  });
  const controller = new AbortController();
  const pending = api.post(
    "/api/study/generate",
    { kind: "brief", sources: [source] },
    controller.signal,
  );
  const rejection = assert.rejects(pending);
  await ready;
  controller.abort();
  await rejection;
  for (let i = 0; i < 20 && !signalSeen.aborted; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(signalSeen.aborted, true);
});
test("server deadline cancels the upstream request and returns 504", async (t) => {
  let seen;
  const api = await serve(t, {
    requestTimeoutMs: 25,
    providers: {
      structured: (_prompt, _system, signal) => {
        seen = signal;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      },
    },
  });
  assert.equal(
    (
      await api.post("/api/study/generate", {
        kind: "brief",
        sources: [source],
      })
    ).status,
    504,
  );
  assert.equal(seen.aborted, true);
});
