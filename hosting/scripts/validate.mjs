import assert from "node:assert/strict";
import { structuredFixture } from "../../fixtures/providers.mjs";
const { default: worker } = await import(
  new URL("../../dist/server/index.js", import.meta.url)
);
const origin = "https://example.chatgpt.site";
const headers = {
  "oai-authenticated-user-id": "test-owner",
  "Content-Type": "application/json",
  Origin: origin,
};
assert.equal((await worker.fetch(new Request(`${origin}/`), {})).status, 200);
assert.equal(
  (
    await worker.fetch(
      new Request(`${origin}/vendor/pdfjs/build/pdf.worker.mjs`),
      {},
    )
  ).status,
  200,
);
assert.equal(
  (await worker.fetch(new Request(`${origin}/.env`), {})).status,
  404,
);
assert.equal(
  (await worker.fetch(new Request(`${origin}/api/config`), {})).status,
  401,
);
assert.equal(
  (
    await worker.fetch(
      new Request(`${origin}/api/config`, {
        headers: { ...headers, Origin: "https://attacker.test" },
      }),
      {},
    )
  ).status,
  403,
);
assert.equal(
  (
    await worker.fetch(
      new Request(`${origin}/api/study/generate`, {
        method: "POST",
        headers,
        body: "{}",
      }),
      { GEMINI_API_KEY: "fixture" },
    )
  ).status,
  400,
);
const original = globalThis.fetch;
try {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.headers["x-goog-api-key"], "fixture");
    const payload = JSON.parse(init.body);
    const text = await structuredFixture(payload.contents[0].parts[0].text);
    return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
  };
  for (const kind of ["brief", "map", "cards", "podcast"]) {
    const response = await worker.fetch(
      new Request(`${origin}/api/study/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind,
          sources: [
            {
              id: "newton",
              name: "牛顿定律",
              content: "牛顿第二定律：F=ma，合外力决定加速度。",
            },
          ],
        }),
      }),
      { GEMINI_API_KEY: "fixture" },
    );
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    assert.ok((await response.json()).references.length);
  }
  const sources = [
    {
      id: "newton",
      name: "牛顿定律",
      content: "牛顿第二定律：F=ma，合外力决定加速度。",
    },
  ];
  const post = (path, body, overrideHeaders = headers) =>
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: overrideHeaders,
      body: JSON.stringify(body),
    });
  const answer = await worker.fetch(
    post("/api/study/ask", { sources, question: "怎样理解加速度？" }),
    { GEMINI_API_KEY: "fixture" },
  );
  assert.equal(answer.status, 200);
  assert.ok((await answer.json()).references.length);
  for (const [status, code] of [
    [401, "PROVIDER_AUTH"],
    [404, "PROVIDER_NOT_FOUND"],
    [429, "PROVIDER_LIMIT"],
  ]) {
    globalThis.fetch = async () =>
      new Response("do-not-expose-upstream-details", { status });
    const response = await worker.fetch(
      post("/api/study/generate", { kind: "brief", sources }),
      { GEMINI_API_KEY: "fixture" },
    );
    assert.equal(response.status, 502);
    const payload = await response.text();
    assert.equal(JSON.parse(payload).code, code);
    assert.doesNotMatch(payload, /do-not-expose-upstream-details/);
  }
  assert.equal(
    (
      await worker.fetch(post("/api/study/generate", []), {
        GEMINI_API_KEY: "fixture",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        post("/api/study/generate", { content: "a".repeat(2 * 1024 * 1024) }),
        { GEMINI_API_KEY: "fixture" },
      )
    ).status,
    413,
  );
  let limited;
  for (let i = 0; i < 21; i++)
    limited = await worker.fetch(
      post(
        "/api/study/generate",
        {},
        { ...headers, "oai-authenticated-user-id": "rate-fixture" },
      ),
      {},
    );
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
} finally {
  globalThis.fetch = original;
}
console.log(
  "Hosted Worker: assets, PDF, authentication, CSRF, four generation modes, follow-up, body limits, provider errors and rate limit passed.",
);
