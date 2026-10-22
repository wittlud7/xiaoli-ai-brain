import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
  rm,
  lstat,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
const dir = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(dir, "..");
const out = resolve(root, "dist");
const existing = await lstat(out).catch(() => null);
if (existing?.isSymbolicLink()) throw new Error("dist must not be a symlink");
if (await lstat(resolve(out, ".env")).catch(() => null))
  throw new Error("Preserve dist/.env before building");
await rm(out, { recursive: true, force: true });
const assets = {};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};
async function addTree(path, prefix) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const absolute = resolve(path, entry.name),
      url = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await addTree(absolute, url);
    else if (entry.isFile() && !entry.name.endsWith(".map"))
      assets[url] = [
        types[extname(entry.name)] || "application/octet-stream",
        (await readFile(absolute)).toString("base64"),
      ];
  }
}
await addTree(resolve(root, "web"), "");
// Mark the hosted build so even an expired platform session shows sign-in,
// rather than the local server's shared access-key dialog.
assets["/index.html"][1] = Buffer.from(
  Buffer.from(assets["/index.html"][1], "base64")
    .toString("utf8")
    .replace('<html lang="zh-CN">', '<html lang="zh-CN" data-hosting="sites">'),
).toString("base64");
for (const name of ["build", "cmaps", "standard_fonts"])
  await addTree(
    resolve(root, "node_modules/pdfjs-dist", name),
    `/vendor/pdfjs/${name}`,
  );
const identity = (
  await readFile(resolve(root, "web/identity.js"), "utf8")
).replaceAll("export ", "");
const study = (await readFile(resolve(root, "lib/study.mjs"), "utf8"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export \{.*;\r?\n/gm, "")
  .replaceAll("export ", "");
const worker = await readFile(resolve(dir, "worker/index.js"), "utf8");
await mkdir(resolve(out, "server"), { recursive: true });
await mkdir(resolve(out, ".openai"), { recursive: true });
await writeFile(
  resolve(out, "server/index.js"),
  `const ASSETS=${JSON.stringify(assets)};\nconst randomUUID = () => crypto.randomUUID();\n${identity}\n${study}\n${worker}`,
);
await copyFile(
  resolve(root, ".openai/hosting.json"),
  resolve(out, ".openai/hosting.json"),
);
console.log(`Built private Worker with ${Object.keys(assets).length} assets.`);
