// Exercise the built Worker and its embedded assets, rather than Express.
// Identity injection and provider fixtures exist only in this loopback test bridge.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { structuredFixture } from "../fixtures/providers.mjs";
import { pdfFixture } from "../fixtures/pdf.mjs";
import worker from "../dist/server/index.js";

let browser,
  server,
  origin,
  upstreamStatus = 200;
const originalFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async (url, init) => {
    assert.ok(
      String(url).startsWith("https://generativelanguage.googleapis.com/"),
    );
    if (upstreamStatus !== 200)
      return new Response("private upstream details", {
        status: upstreamStatus,
      });
    const payload = JSON.parse(init.body);
    const text = await structuredFixture(payload.contents[0].parts[0].text);
    return Response.json({ candidates: [{ content: { parts: [{ text }] } }] });
  };
  server = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = new Headers(req.headers);
      headers.set("oai-authenticated-user-id", "browser-fixture-owner");
      const response = await worker.fetch(
        new Request(`${origin}${req.url}`, {
          method: req.method,
          headers,
          ...(["GET", "HEAD"].includes(req.method)
            ? {}
            : { body: Buffer.concat(chunks) }),
        }),
        { GEMINI_API_KEY: "browser-fixture" },
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500);
      res.end("Test bridge failed");
    }
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  await mkdir("output/playwright", { recursive: true });
});
after(async () => {
  globalThis.fetch = originalFetch;
  await browser?.close();
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});
async function open(t) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await context.close();
    assert.deepEqual(
      errors,
      [],
      "Hosted UI has no unhandled browser exceptions",
    );
  });
  await page.goto(origin);
  await page.getByRole("navigation", { name: "主要导航" }).waitFor();
  return page;
}
async function stored(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import("/storage.js");
    const storage = await openStorage();
    const data = await storage.read();
    storage.close();
    return data;
  });
}
test("hosted import, four outputs, citations, follow-up, review and backup persist", async (t) => {
  const page = await open(t);
  assert.equal(
    await page.locator("html").getAttribute("data-hosting"),
    "sites",
  );
  await page.locator("#file-import").setInputFiles({
    name: "物理.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "牛顿第二定律 F = ma，合外力决定加速度。合外力为零时物体保持静止或匀速直线运动。",
    ),
  });
  await page
    .getByRole("checkbox", { name: "关联资料：物理.txt", exact: true })
    .waitFor();
  for (const [kind, label] of [
    ["brief", "复习摘要"],
    ["map", "概念图"],
    ["cards", "记忆卡"],
    ["podcast", "双人播客"],
  ]) {
    const count = await page.locator(".history-row").count();
    await page.locator(`.tool[data-id="${kind}"]`).click();
    await page
      .getByRole("button", { name: `生成${label}`, exact: true })
      .click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".history-row").length === count + 1,
      count,
    );
    await page.locator(".references summary").click();
    await page.locator(".reference-list button").first().click();
    await page.locator("dialog[open] .source-quote").waitFor();
    assert.match(await page.locator(".source-quote").textContent(), /F = ma/);
    await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  }
  assert.equal(
    await page
      .getByRole("button", { name: "合成音频", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("textbox", { name: "向资料提问", exact: true })
    .fill("合力为零是否一定静止？");
  await page.getByRole("button", { name: "提问", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll(".message").length === 2,
  );
  await page.reload();
  await page.locator(".transcript").waitFor();
  assert.equal((await stored(page)).notebooks[0].history[0].messages.length, 2);
  await page.getByRole("link", { name: /^记忆复习/ }).click();
  await page
    .getByRole("button", { name: "想好了，查看答案", exact: true })
    .click();
  await page.getByRole("button", { name: /记住了/ }).click();
  await page.waitForFunction(
    () => document.querySelector(".stat strong")?.textContent === "1",
  );
  await page.getByRole("link", { name: "数据与设置", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出工作区备份", exact: true })
    .click();
  const backup = await readFile(await (await downloading).path());
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#backup-import").setInputFiles({
    name: "workspace.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.locator(".notice").filter({ hasText: "备份已恢复" }).waitFor();
  assert.equal((await stored(page)).notebooks[0].history.length, 4);
  assert.equal(Object.keys((await stored(page)).reviews).length, 1);
});
test("hosted settings and expired login offer ChatGPT sign-in without a service-key form", async (t) => {
  const page = await open(t);
  await page.getByRole("link", { name: "数据与设置", exact: true }).click();
  await page.getByText("此网站使用 ChatGPT 登录", { exact: false }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "输入服务访问口令", exact: true })
      .count(),
    0,
  );
  assert.doesNotMatch(
    await page.locator(".settings-grid").textContent(),
    /\.env|GEMINI_API_KEY|OPENAI_API_KEY/,
  );
  await page.screenshot({
    path: "output/playwright/hosted-settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["workspace", "review", "graph", "settings"]) {
    await page.goto(`${origin}/#${route}`);
    await page.getByRole("navigation", { name: "主要导航" }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route,
    );
  }
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status: 401,
      contentType: "text/html",
      body: "<h1>需要登录</h1>",
    }),
  );
  await page.reload();
  const signin = page.locator('.notice a[href^="/signin-with-chatgpt"]');
  await signin.waitFor();
  assert.equal(await signin.getAttribute("target"), "_top");
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.screenshot({
    path: "output/playwright/hosted-expired-mobile.png",
    fullPage: true,
  });
});
test("hosted connection recovery and provider quota errors preserve source data", async (t) => {
  const page = await open(t);
  await page.getByRole("button", { name: "试用示例资料", exact: true }).click();
  await page.locator(".studio").waitFor();
  const before = (await stored(page)).files;
  await page.route("**/api/config", (route) => route.abort());
  await page.reload();
  await page.locator(".notice.error").filter({ hasText: "在线服务" }).waitFor();
  await page.unroute("**/api/config");
  await page.getByRole("button", { name: "重新检查连接", exact: true }).click();
  await page
    .getByRole("button", { name: "生成复习摘要", exact: true })
    .waitFor({ state: "visible" });
  upstreamStatus = 429;
  try {
    await page
      .getByRole("button", { name: "生成复习摘要", exact: true })
      .click();
    await page
      .locator(".notice.error")
      .filter({ hasText: "供应商额度或速率受限" })
      .waitFor();
    assert.deepEqual((await stored(page)).files, before);
    assert.equal((await stored(page)).notebooks[0].history.length, 0);
  } finally {
    upstreamStatus = 200;
  }
});

test("hosted PDF import really runs the embedded parser and worker", async (t) => {
  const page = await open(t);
  await page.locator("#file-import").setInputFiles({
    name: "physics.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await page
    .getByRole("checkbox", { name: "关联资料：physics.pdf", exact: true })
    .waitFor();
  assert.match(
    (await stored(page)).files[0].content,
    /Full PDF source extraction works/,
  );
});
