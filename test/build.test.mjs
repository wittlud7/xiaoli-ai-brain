import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

test("rebuilding refuses to delete a deployed environment file", () => {
  const root = resolve("output", `build-guard-${randomUUID()}`);
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "dist"));
  copyFileSync("scripts/build.mjs", join(root, "scripts", "build.mjs"));
  const marker = "DEPLOYMENT_MARKER=preserve-this-file\n";
  writeFileSync(join(root, "dist", ".env"), marker);
  const result = spawnSync(
    process.execPath,
    [join(root, "scripts", "build.mjs")],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /contains a local \.env/);
  assert.equal(readFileSync(join(root, "dist", ".env"), "utf8"), marker);
});
