import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createApp } from "../server.mjs";
import { structuredFixture, speechFixture } from "../fixtures/providers.mjs";

let browser, server, origin;
before(async () => {
  server = createApp({
    env: {},
    rateLimit: 10000,
    providers: { structured: structuredFixture, speech: speechFixture },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
  await mkdir("output/playwright", { recursive: true });
});
after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
});
async function pageFor(t, setup) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  if (setup) await context.addInitScript(setup);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    if (t.passed === false)
      await page
        .screenshot({
          path: `output/playwright/failure-${t.name.replace(/[^a-z0-9]/gi, "-").slice(0, 60)}.png`,
          fullPage: true,
        })
        .catch(() => {});
    await context.close();
    assert.deepEqual(errors, [], "No unhandled browser exceptions");
  });
  await page.goto(origin);
  return { page, context, errors };
}
async function ready(page) {
  await page.getByRole("navigation", { name: "主要导航" }).waitFor();
}
async function sample(page) {
  await ready(page);
  await page.getByRole("button", { name: "试用示例资料", exact: true }).click();
  await page.locator(".notebook.selected").waitFor();
}
async function documentFor(page) {
  return page.evaluate(async () => {
    const { openStorage } = await import("/storage.js");
    const storage = await openStorage();
    const data = await storage.read();
    storage.close();
    return data;
  });
}
async function createBook(page, name) {
  await page.getByRole("button", { name: "创建笔记本", exact: true }).click();
  await page.getByRole("textbox", { name: "名称", exact: true }).fill(name);
  await page.getByRole("button", { name: "保存笔记本", exact: true }).click();
  await page.locator(".notebook.selected").filter({ hasText: name }).waitFor();
}
const labels = {
  brief: "复习摘要",
  map: "概念图",
  cards: "记忆卡",
  podcast: "双人播客",
};
async function generate(page, kind) {
  const count = await page.locator(".history-row").count();
  await page.locator(`.tool[data-id="${kind}"]`).click();
  await page
    .getByRole("button", { name: `生成${labels[kind]}`, exact: true })
    .click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".history-row").length === count + 1,
    count,
  );
  await page.waitForFunction(() => !document.querySelector(".job-status"));
}
async function confirmNext(page) {
  page.once("dialog", (dialog) => dialog.accept());
}
function gateRoute(page, pattern) {
  let release,
    started,
    count = 0,
    body;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const installed = page.route(pattern, async (route) => {
    count++;
    body = route.request().postDataJSON();
    started();
    await gate;
    await route.continue().catch(() => {});
  });
  return {
    installed,
    ready,
    release,
    get count() {
      return count;
    },
    get body() {
      return body;
    },
  };
}

test("Chinese empty state, notebook CRUD, note preservation and escaping", async (t) => {
  const { page } = await pageFor(t);
  await ready(page);
  assert.equal(await page.locator(".notebook").count(), 0);
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await createBook(page, "物理甲");
  await page.getByRole("button", { name: "写笔记", exact: true }).click();
  const name = '<img src=x onerror="window.compromised=1">';
  await page.getByRole("textbox", { name: "标题", exact: true }).fill(name);
  await page
    .getByRole("textbox", { name: "正文", exact: true })
    .fill("知识来源：牛顿第二定律。");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await page
    .getByRole("checkbox", { name: `关联资料：${name}`, exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.compromised), undefined);
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  await page
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("物理甲修订");
  await page.getByRole("button", { name: "保存笔记本", exact: true }).click();
  await page
    .locator(".notebook.selected")
    .filter({ hasText: "物理甲修订" })
    .waitFor();
  await page.reload();
  await ready(page);
  assert.equal(
    (await documentFor(page)).files[0].content,
    "知识来源：牛顿第二定律。",
  );
  await confirmNext(page);
  await page.getByRole("button", { name: "删除笔记本", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".notebook"));
  assert.equal((await documentFor(page)).files.length, 1);
});

test("four grounded outputs, source inspection, concept state and real card reviews", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "brief");
  await page.locator(".prose .citation").first().click();
  await page.locator("dialog[open] .source-quote").waitFor();
  assert.match(await page.locator(".source-quote").textContent(), /F = ma/);
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/v2-desktop.png",
    fullPage: true,
  });
  await generate(page, "map");
  assert.equal(await page.locator(".concept-graph .concept").count(), 2);
  await page.getByRole("link", { name: "知识图谱", exact: true }).click();
  await page.locator("[data-mastery]").selectOption("mastered");
  await page.waitForFunction(() => document.querySelector(".concept.mastered"));
  await page.reload();
  await ready(page);
  await page.locator(".concept.mastered").waitFor();
  await page.getByRole("link", { name: "学习工作台", exact: true }).click();
  await generate(page, "cards");
  await page.getByRole("link", { name: "开始复习", exact: true }).click();
  await page
    .getByRole("button", { name: "想好了，查看答案", exact: true })
    .click();
  await page.getByRole("button", { name: /记住了/ }).click();
  await page.waitForFunction(
    () => document.querySelector(".stat strong")?.textContent === "1",
  );
  const stored = await documentFor(page);
  assert.equal(Object.keys(stored.reviews).length, 1);
  assert.ok(Date.parse(Object.values(stored.reviews)[0].dueAt) > Date.now());
  await page.reload();
  await ready(page);
  assert.equal(await page.locator(".stat strong").first().textContent(), "1");
});

test("audio survives reload and its element remains stable during navigation", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "podcast");
  await page.getByRole("button", { name: "合成音频", exact: true }).click();
  await page.locator("#audio-player:not([hidden])").waitFor();
  await page.waitForFunction(
    () => document.querySelector("audio").readyState >= 1,
  );
  await page.locator("audio").evaluate((audio) => {
    audio.pause();
    audio.currentTime = 1;
    window.originalPlayer = audio;
  });
  await page.getByRole("link", { name: "数据与设置", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.querySelector("audio") === window.originalPlayer,
    ),
    true,
  );
  assert.equal(
    await page.locator("audio").evaluate((audio) => audio.currentTime),
    1,
  );
  await page.reload();
  await ready(page);
  await page.getByRole("link", { name: "学习工作台", exact: true }).click();
  await page
    .getByRole("button", { name: "播放已保存音频", exact: true })
    .click();
  await page.locator("#audio-player:not([hidden])").waitFor();
  await page.waitForFunction(
    () => document.querySelector("audio").readyState >= 1,
  );
});

test("backup export/import roundtrip and invalid import preserve prior data", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "cards");
  await page.getByRole("link", { name: "数据与设置", exact: true }).click();
  const downloadWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出工作区备份", exact: true })
    .click();
  const download = await downloadWait,
    backup = await readFile(await download.path());
  const data = JSON.parse(backup.toString());
  assert.equal(data.version, 2);
  assert.equal(data.notebooks[0].history[0].kind, "cards");
  assert.doesNotMatch(
    backup.toString(),
    /APP_ACCESS_TOKEN|OPENAI_API_KEY|audioData/,
  );
  await page.locator("#backup-import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await page.locator(".notice.error").waitFor();
  assert.equal((await documentFor(page)).files.length, 1);
  await page.getByRole("link", { name: "学习工作台", exact: true }).click();
  await createBook(page, "临时笔记本");
  await confirmNext(page);
  await page.locator("#backup-import").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".notebook").length === 1,
  );
  const restored = await documentFor(page);
  assert.equal(
    restored.notebooks[0].history[0].id,
    data.notebooks[0].history[0].id,
  );
});

test("generation completion after switching notebooks belongs to the initiating notebook", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  const original = (await documentFor(page)).activeNotebookId;
  const gate = gateRoute(page, "**/api/study/generate");
  await gate.installed;
  t.after(() => gate.release());
  await page.getByRole("button", { name: "生成复习摘要", exact: true }).click();
  await gate.ready;
  await createBook(page, "另一门课");
  gate.release();
  await page.waitForFunction(() => !document.querySelector(".job-status"));
  const stored = await documentFor(page);
  assert.equal(
    stored.notebooks.find((book) => book.id === original).history.length,
    1,
  );
  assert.equal(
    stored.notebooks.find((book) => book.id === stored.activeNotebookId).history
      .length,
    0,
  );
});

test("duplicate Enter and notebook switching cannot mix follow-up conversations", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "brief");
  const original = (await documentFor(page)).notebooks[0];
  const gate = gateRoute(page, "**/api/study/ask");
  await gate.installed;
  t.after(() => gate.release());
  await page
    .getByRole("textbox", { name: "向资料提问", exact: true })
    .fill("第二定律的条件是什么？");
  await page
    .getByRole("textbox", { name: "向资料提问", exact: true })
    .press("Enter");
  await gate.ready;
  await page
    .locator("#ask-form")
    .dispatchEvent("submit", { bubbles: true, cancelable: true });
  await page
    .locator("#ask-form")
    .dispatchEvent("submit", { bubbles: true, cancelable: true });
  await createBook(page, "另一门课");
  gate.release();
  await page.waitForFunction(() => !document.querySelector(".job-status"));
  const stored = await documentFor(page);
  assert.equal(gate.count, 1);
  assert.equal(gate.body.sources[0].id, original.fileIds[0]);
  assert.equal(
    stored.notebooks.find((book) => book.id === original.id).history[0].messages
      .length,
    2,
  );
  assert.equal(
    stored.notebooks.find((book) => book.id !== original.id).history.length,
    0,
  );
});

test("cancelled or deleted notebook generation leaves no stray output", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  const gate = gateRoute(page, "**/api/study/generate");
  await gate.installed;
  t.after(() => gate.release());
  await page.getByRole("button", { name: "生成复习摘要", exact: true }).click();
  await gate.ready;
  await page.getByRole("button", { name: "取消请求", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".job-status"));
  gate.release();
  assert.equal((await documentFor(page)).notebooks[0].history.length, 0);
  await page.unroute("**/api/study/generate");
  const second = gateRoute(page, "**/api/study/generate");
  await second.installed;
  t.after(() => second.release());
  await page.getByRole("button", { name: "生成复习摘要", exact: true }).click();
  await second.ready;
  await confirmNext(page);
  await page.getByRole("button", { name: "删除笔记本", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector(".job-status"));
  second.release();
  assert.equal((await documentFor(page)).notebooks.length, 0);
  assert.equal((await documentFor(page)).files.length, 1);
});

test("a second tab receives committed source and notebook updates", async (t) => {
  const { page, context } = await pageFor(t);
  await sample(page);
  const second = await context.newPage();
  await second.goto(origin);
  await ready(second);
  await createBook(page, "跨页同步");
  await second.locator(".notebook").filter({ hasText: "跨页同步" }).waitFor();
  assert.equal((await documentFor(second)).notebooks.length, 2);
  await second.getByRole("button", { name: "写笔记", exact: true }).click();
  await second
    .getByRole("textbox", { name: "标题", exact: true })
    .fill("另一页新增资料");
  await second
    .getByRole("textbox", { name: "正文", exact: true })
    .fill("这份资料不能覆盖之前的物理示例。");
  await second.getByRole("button", { name: "保存笔记", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "关联资料：另一页新增资料", exact: true })
    .waitFor();
  assert.equal((await documentFor(page)).files.length, 2);
});

test("legacy migration and malformed data recovery preserve original storage", async (t) => {
  const { page } = await pageFor(t, () => {
    if (!localStorage.getItem("xiaoli-workspace-v1"))
      localStorage.setItem(
        "xiaoli-workspace-v1",
        JSON.stringify({
          version: 1,
          files: [
            {
              id: "old-file",
              name: "旧笔记",
              subject: "general",
              kind: "note",
              content: "旧版原文不可丢失。",
              createdAt: "2026-10-17",
            },
          ],
          notebooks: [
            {
              id: "old-book",
              name: "旧笔记本",
              fileIds: ["old-file"],
              history: [],
            },
          ],
          graphMastery: {},
        }),
      );
  });
  await ready(page);
  assert.equal(
    (await documentFor(page)).files[0].content,
    "旧版原文不可丢失。",
  );
  assert.equal(
    await page.evaluate(() => !!localStorage.getItem("xiaoli-workspace-v1")),
    true,
  );
  const validBackup = Buffer.from(JSON.stringify(await documentFor(page)));
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("xiaoli-study-v2");
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(
        { broken: "keep original damaged record" },
        "main",
      );
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("heading", { name: "先保护好你的资料", exact: true })
    .waitFor();
  const downloadWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载原始恢复文件", exact: true })
    .click();
  const downloaded = JSON.parse(
    (await readFile(await (await downloadWait).path())).toString(),
  );
  assert.equal(downloaded.indexedDB.broken, "keep original damaged record");
  assert.match(downloaded.legacy["xiaoli-workspace-v1"], /旧版原文不可丢失/);
  await page.locator("#backup-import").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await page.getByRole("alert").waitFor();
  await confirmNext(page);
  await page.locator("#backup-import").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: validBackup,
  });
  await ready(page);
  assert.equal(
    (await documentFor(page)).files[0].content,
    "旧版原文不可丢失。",
  );
});

test("quota failure preserves the note draft and permits retry after storage recovery", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "workspace")
        throw new DOMException("quota", "QuotaExceededError");
      return window.originalPut.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "写笔记", exact: true }).click();
  await page
    .getByRole("textbox", { name: "标题", exact: true })
    .fill("空间不足时的草稿");
  await page
    .getByRole("textbox", { name: "正文", exact: true })
    .fill("这段文字不能因为保存失败而消失。");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: "正文", exact: true }).inputValue(),
    "这段文字不能因为保存失败而消失。",
  );
  assert.equal((await documentFor(page)).files.length, 1);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = window.originalPut;
  });
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "关联资料：空间不足时的草稿", exact: true })
    .waitFor();
  assert.equal((await documentFor(page)).files.length, 2);
});

function pdfFixture() {
  const stream =
    "BT /F1 18 Tf 50 750 Td (Full PDF source extraction works.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("malformed model output and speech failure keep prior learning records intact", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "brief");
  await page.route("**/api/study/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"bad":"shape"}',
    }),
  );
  await page.getByRole("button", { name: "生成复习摘要", exact: true }).click();
  await page.locator(".notice.error").waitFor();
  assert.equal((await documentFor(page)).notebooks[0].history.length, 1);
  await page.unroute("**/api/study/generate");
  await generate(page, "podcast");
  await page.route("**/api/audio/podcast-tts", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: '{"error":"test unavailable"}',
    }),
  );
  await page.getByRole("button", { name: "合成音频", exact: true }).click();
  await page
    .locator(".notice.error")
    .filter({ hasText: "脚本已保留" })
    .waitFor();
  assert.equal((await documentFor(page)).notebooks[0].history.length, 2);
  assert.match(await page.locator(".transcript").textContent(), /主持人A/);
});

test("workspace access key is required again after reload and never enters backups", async (t) => {
  const { page } = await pageFor(t);
  const token = "browser-test-access-token-123456789";
  await page.route("**/api/config", (route) =>
    route.fulfill({
      status:
        route.request().headers().authorization === `Bearer ${token}`
          ? 200
          : 401,
      contentType: "application/json",
      body:
        route.request().headers().authorization === `Bearer ${token}`
          ? '{"textReady":true,"audioReady":true}'
          : '{"error":"locked"}',
    }),
  );
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: "输入访问口令", exact: true }).click();
  await page
    .getByRole("textbox", { name: "访问口令", exact: true })
    .fill(token);
  await page.getByRole("button", { name: "连接工作区", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.doesNotMatch(
    JSON.stringify(await documentFor(page)),
    new RegExp(token),
  );
  await page.reload();
  await ready(page);
  await page
    .getByRole("button", { name: "输入访问口令", exact: true })
    .waitFor();
});
test("PDF text is really extracted and empty imports do not overwrite files", async (t) => {
  const { page } = await pageFor(t);
  await ready(page);
  await page.locator("#file-import").setInputFiles({
    name: "physics.pdf",
    mimeType: "application/pdf",
    buffer: pdfFixture(),
  });
  await page
    .getByRole("checkbox", { name: "关联资料：physics.pdf", exact: true })
    .waitFor();
  assert.match(
    (await documentFor(page)).files[0].content,
    /Full PDF source extraction works/,
  );
  await page.locator("#file-import").setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("  "),
  });
  await page.locator(".notice.error").waitFor();
  assert.equal((await documentFor(page)).files.length, 1);
});

test("desktop and mobile pages have no horizontal overflow or lost draft text", async (t) => {
  const { page } = await pageFor(t);
  await sample(page);
  await generate(page, "brief");
  await page
    .getByRole("textbox", { name: /这次想学会什么/ })
    .fill("从受力分析理解牛顿第二定律，梳理常见误区");
  await page.locator('.tool[data-id="map"]').click();
  assert.equal(
    await page.locator("#study-goal").inputValue(),
    "从受力分析理解牛顿第二定律，梳理常见误区",
  );
  await page.screenshot({
    path: "output/playwright/v2-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["workspace", "review", "graph", "settings"]) {
    await page.goto(`${origin}/#${route}`);
    await ready(page);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      route,
    );
    if (route === "workspace")
      await page.screenshot({
        path: "output/playwright/v2-mobile.png",
        fullPage: true,
      });
  }
});
