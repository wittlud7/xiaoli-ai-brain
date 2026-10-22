import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { structuredFixture } from "../../fixtures/providers.mjs";
const source = await readFile(
  new URL("../../dist/server/index.js", import.meta.url),
  "utf8",
);
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
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
} finally {
  globalThis.fetch = original;
}
console.log(
  "Hosted Worker: assets, PDF, authentication, CSRF, validation and four generation modes passed.",
);
