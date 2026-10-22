import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

for (const directory of [
  ".",
  "lib",
  "web",
  "scripts",
  "test",
  "fixtures",
  "e2e",
  "hosting/worker",
  "hosting/scripts",
]) {
  for (const file of readdirSync(directory)) {
    if (!/\.(mjs|js|cjs)$/.test(file)) continue;
    const result = spawnSync(
      process.execPath,
      ["--check", join(directory, file)],
      { stdio: "inherit" },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log("JavaScript syntax checks passed.");
