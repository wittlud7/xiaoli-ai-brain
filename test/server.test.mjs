import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { createApp, validateBinding } from "../server.mjs";

async function serve(t, options = {}) {
  const server = createApp({ env: {}, ...options }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (path, options) => fetch(base + path, options),
    post: (path, body, headers = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    rawPost: (path, headers) =>
      new Promise((resolve, reject) => {
        const req = request(
          base + path,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end(JSON.stringify({ prompt: "ok" }));
      }),
  };
}

test("public binding requires a strong access token and valid origin", () => {
  assert.equal(validateBinding({}), "127.0.0.1");
  assert.throws(() => validateBinding({ HOST: "0.0.0.0" }), /requires/);
  assert.throws(() => validateBinding({ APP_ACCESS_TOKEN: "short" }), /24/);
  assert.throws(
    () => validateBinding({ PUBLIC_ORIGIN: "https://example.com/path" }),
    /origin/,
  );
  assert.equal(
    validateBinding({ HOST: "0.0.0.0", APP_ACCESS_TOKEN: "x".repeat(32) }),
    "0.0.0.0",
  );
});
test("serves the maintained UI, PDF assets and minimal health response", async (t) => {
  const api = await serve(t);
  const health = await api.get("/health");
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "xiaoli-ai-brain",
    version: "0.2.0-beta.1",
  });
  const page = await api.get("/");
  assert.match(await page.text(), /\/app.js/);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  for (const path of [
    "/app.js",
    "/workspace.js",
    "/files.js",
    "/vendor/pdfjs/build/pdf.mjs",
    "/vendor/pdfjs/build/pdf.worker.mjs",
  ])
    assert.equal((await api.get(path)).status, 200);
  for (const path of [
    "/.env",
    "/server.mjs",
    "/legacy/server.ts",
    "/package.json",
    "/missing.js",
  ])
    assert.equal((await api.get(path)).status, 404);
});
test("validates input before provider calls, and reports unconfigured providers", async (t) => {
  const api = await serve(t);
  for (const body of [
    {},
    { prompt: 4 },
    { prompt: " " },
    { prompt: "x".repeat(32001) },
    { prompt: "ok", systemInstruction: {} },
  ])
    assert.equal((await api.post("/api/gemini/generate", body)).status, 400);
  assert.equal(
    (await api.post("/api/gemini/generate", { prompt: "ok" })).status,
    503,
  );
  assert.equal(
    (await api.post("/api/audio/podcast-tts", { text: "ok" })).status,
    503,
  );
  assert.equal(
    (await api.post("/api/audio/podcast-tts", { text: "x".repeat(12001) }))
      .status,
    400,
  );
  assert.equal(
    (
      await api.post("/api/audio/podcast-tts", {
        text: Array.from(
          { length: 25 },
          (_, i) => `主持人${i % 2 ? "B" : "A"}：text`,
        ).join("\n"),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api.post("/api/anthropic/generate", {
        prompt: "ok",
        max_tokens: 999999,
      })
    ).status,
    400,
  );
});
test("rejects invalid JSON, non-object bodies, wrong content type and oversized requests", async (t) => {
  const api = await serve(t);
  const raw = (body) =>
    api.get("/api/gemini/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  assert.equal((await raw("{")).status, 400);
  assert.equal((await raw("[]")).status, 400);
  assert.equal((await raw("null")).status, 400);
  assert.equal(
    (await raw(JSON.stringify({ prompt: "x".repeat(270000) }))).status,
    413,
  );
  assert.equal(
    (await api.get("/api/gemini/generate", { method: "POST", body: "hello" }))
      .status,
    400,
  );
});
test("access control, cross-site rejection and DNS rebinding protection", async (t) => {
  const token = "private-workspace-token-1234567890";
  const api = await serve(t, {
    env: { APP_ACCESS_TOKEN: token },
    providers: { generate: async () => "ready" },
  });
  assert.equal(
    (await api.post("/api/gemini/generate", { prompt: "ok" })).status,
    401,
  );
  assert.equal(
    (
      await api.post(
        "/api/gemini/generate",
        { prompt: "ok" },
        { Authorization: "Bearer wrong" },
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await api.post(
        "/api/gemini/generate",
        { prompt: "ok" },
        { Authorization: `Bearer ${token}` },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api.post(
        "/api/gemini/generate",
        { prompt: "ok" },
        {
          Authorization: `Bearer ${token}`,
          Origin: "https://untrusted.example",
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await api.post(
        "/api/gemini/generate",
        { prompt: "ok" },
        { Authorization: `Bearer ${token}`, "Sec-Fetch-Site": "cross-site" },
      )
    ).status,
    403,
  );
  const local = await serve(t);
  assert.equal(
    await local.rawPost("/api/gemini/generate", { Host: "untrusted.example" }),
    403,
  );
});
test("allows explicitly configured HTTPS origin behind a proxy", async (t) => {
  const token = "x".repeat(32);
  const api = await serve(t, {
    env: {
      PUBLIC_ORIGIN: "https://study.example.com",
      APP_ACCESS_TOKEN: token,
    },
    providers: { generate: async () => "ready" },
  });
  const result = await api.post(
    "/api/gemini/generate",
    { prompt: "ok" },
    { Origin: "https://study.example.com", Authorization: `Bearer ${token}` },
  );
  assert.equal(result.status, 200);
});
test("rate limit includes retry information", async (t) => {
  const api = await serve(t, {
    rateLimit: 1,
    providers: { generate: async () => "ok" },
  });
  assert.equal(
    (await api.post("/api/gemini/generate", { prompt: "one" })).status,
    200,
  );
  const second = await api.post("/api/gemini/generate", { prompt: "two" });
  assert.equal(second.status, 429);
  assert.ok(Number(second.headers.get("retry-after")) > 0);
});
test("caps concurrent generation and releases capacity after completion", async (t) => {
  let release, started;
  const waitForStart = new Promise((resolve) => {
    started = resolve;
  });
  const api = await serve(t, {
    maxConcurrent: 1,
    providers: {
      generate: () => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    },
  });
  const first = api.post("/api/gemini/generate", { prompt: "one" });
  await waitForStart;
  try {
    assert.equal(
      (await api.post("/api/gemini/generate", { prompt: "two" })).status,
      429,
    );
  } finally {
    release("done");
  }
  assert.equal((await first).status, 200);
});
test("text, structured summaries, speech and Anthropic contracts use mock providers", async (t) => {
  const api = await serve(t, {
    providers: {
      generate: async (prompt, system, json) =>
        json
          ? JSON.stringify({ points: ["概念", "例子"] })
          : `${system || ""}${prompt}`,
      speech: async (segments) => {
        assert.equal(segments[0].speaker, "hostA");
        assert.equal(segments[1].speaker, "hostB");
        return { data: "bW9jaw==", mimeType: "audio/mpeg" };
      },
      anthropic: async (prompt, system, max) => ({
        content: [{ type: "text", text: `${system}${prompt}${max}` }],
      }),
    },
  });
  assert.deepEqual(
    await (
      await api.post("/api/gemini/generate", {
        prompt: "hello",
        systemInstruction: "test:",
      })
    ).json(),
    { text: "test:hello" },
  );
  assert.deepEqual(
    await (
      await api.post("/api/gemini/knowledge-summary", { term: "force" })
    ).json(),
    { points: ["概念", "例子"] },
  );
  assert.equal(
    (
      await api.post("/api/audio/podcast-tts", {
        text: "主持人A：你好\n主持人B：你好",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api.post("/api/anthropic/generate", { prompt: "hello" })).status,
    200,
  );
});
test("upstream failures do not expose secrets, and unknown API paths return JSON", async (t) => {
  const api = await serve(t, {
    providers: {
      generate: async () => {
        throw new Error("secret-provider-credential");
      },
    },
  });
  const result = await api.post("/api/gemini/generate", { prompt: "hello" });
  assert.equal(result.status, 502);
  assert.doesNotMatch(await result.text(), /secret-provider/);
  const missing = await api.get("/api/missing");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /application\/json/);
});
