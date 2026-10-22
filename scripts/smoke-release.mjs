import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { once } from "node:events";
import { createApp } from "../dist/server.mjs";

assert.equal(
  existsSync(new URL("../dist/.env", import.meta.url)),
  false,
  "Release must not contain .env",
);
assert.equal(
  existsSync(new URL("../dist/legacy", import.meta.url)),
  false,
  "Release must not contain legacy",
);
const server = createApp({ env: {} }).listen(0, "127.0.0.1");
await once(server, "listening");
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "/",
    "/health",
    "/app.js",
    "/files.js",
    "/workspace.js",
    "/model.js",
    "/storage.js",
    "/views.js",
    "/api.js",
    "/identity.js",
    "/render.js",
    "/vendor/pdfjs/build/pdf.worker.mjs",
  ])
    assert.equal((await fetch(origin + path)).status, 200, path);
  assert.equal((await fetch(origin + "/.env")).status, 404);
  assert.equal((await fetch(origin + "/fixtures/providers.mjs")).status, 404);
  const manifest = JSON.parse(
    readFileSync(new URL("../dist/package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    (await (await fetch(origin + "/health")).json()).version,
    manifest.version,
  );
  assert.equal(
    (await (await fetch(origin + "/api/config")).json()).textReady,
    false,
  );
  console.log("Packaged server, frontend and PDF worker smoke checks passed.");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
