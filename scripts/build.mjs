import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  lstatSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = resolve(root, "dist");
if (target !== join(resolve(root), "dist"))
  throw new Error("Unexpected output path");
if (existsSync(join(target, ".env")))
  throw new Error(
    "dist/ contains a local .env. Move deployment/configuration outside dist/ before rebuilding; it will not be deleted.",
  );
for (const name of [
  "web/index.html",
  "web/app.js",
  "web/styles.css",
  "server.mjs",
  "lib/speech.mjs",
]) {
  if (!existsSync(join(root, name)))
    throw new Error(`Missing release file: ${name}`);
}
if (!readFileSync(join(root, "web/index.html"), "utf8").includes("/app.js"))
  throw new Error("Missing frontend entry");
function removeOutput(path) {
  const child = relative(target, path);
  if (child.startsWith("..") || isAbsolute(child))
    throw new Error("Unexpected output child");
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    if (path === target)
      throw new Error("Release output root must not be a symbolic link");
    unlinkSync(path);
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) removeOutput(join(path, entry));
    rmdirSync(path);
  } else unlinkSync(path);
}
function copy(source, destination) {
  if (lstatSync(source).isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const entry of readdirSync(source))
      copy(join(source, entry), join(destination, entry));
  } else writeFileSync(destination, readFileSync(source));
}
if (existsSync(target)) removeOutput(target);
mkdirSync(target, { recursive: true });
for (const name of [
  "web",
  "lib",
  "server.mjs",
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".env.example",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs",
]) {
  copy(join(root, name), join(target, name));
}
const manifest = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
manifest.scripts = { start: "node server.mjs" };
writeFileSync(
  join(target, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  "Release prepared in dist/. Copy it to a separate deployment directory, run npm ci --omit=dev, configure .env, then npm start.",
);
