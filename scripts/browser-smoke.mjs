import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createPreviewServer, BASE } from "./serve-static.mjs";
const server = process.env.LIVE_ORIGIN ? null : createPreviewServer();
if (server)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin =
  process.env.LIVE_ORIGIN ?? "http://127.0.0.1:" + server.address().port;
const errors = [],
  backend = [],
  badResponses = [];
const executablePath =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : "/usr/bin/google-chrome");
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const output =
  process.env.SMOKE_OUTPUT ??
  fs.mkdtempSync(path.join(os.tmpdir(), "xiamimate-crossborder-smoke-"));
fs.mkdirSync(output, { recursive: true });
let page;
try {
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/^\/(v1|api|account|auth|media)(?:\/|$)/.test(new URL(r.url()).pathname.replace(BASE, "")))
      backend.push(r.url());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) badResponses.push(r.status() + " " + r.url());
  });
  await page.setViewport({ width: 1440, height: 1000 });
  const go = async (route = "") => {
    const response = await page.goto(origin + BASE + "/" + route, {
      waitUntil: "networkidle0",
    });
    assert.equal(response.status(), 200, route);
  };
  const button = async (text, scope = "body") => {
    const handle = await page.evaluateHandle(
      (text, scope) =>
        [...document.querySelector(scope).querySelectorAll("button")].find(
          (e) => e.textContent.trim() === text,
        ),
      text,
      scope,
    );
    assert.ok(handle.asElement(), "Button: " + text);
    await handle.asElement().click();
    await handle.dispose();
  };
  const fill = async (selector, value) => {
    await page.waitForSelector(selector);
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value);
  };
  const routes = [
    "",
    "crossborder/",
    "crossborder/assess/",
    "crossborder/my/",
    "crossborder/guide/",
    "crossborder/wiki/",
    "crossborder/tools/profit-calculator/",
    "crossborder/tools/pricing-calculator/",
    "crossborder/tools/acos-break-even/",
    "crossborder/tools/dimensional-weight/",
    "crossborder/tools/landed-cost/",
    "crossborder/workbench/listing-doctor/",
    "crossborder/workbench/voice-insight/",
    "crossborder/workbench/service-copilot/",
    "crossborder/research/sample/",
    "crossborder/research/sample/?type=rival",
    "crossborder/research/sample/?type=full",
    "crossborder/research/sample/?type=tiktok",
  ];
  for (const route of routes) {
    console.log("Checking " + route);
    await go(route);
    const body = await page.$eval("body", (e) => e.innerText);
    assert.ok(body.length > 100, route);
    assert.ok(
      !/登录后云端|账户中心|消耗.{0,12}积分|智能读取 · 即将上线|充值/.test(
        body,
      ),
      route,
    );
    assert.ok(await page.$("header nav"));
    const wrong = await page.$$eval('a[href^="/"]', (els) =>
      els
        .map((e) => e.getAttribute("href"))
        .filter((h) => !h.startsWith("/xiamimate-crossborder/")),
    );
    assert.deepEqual(wrong, [], route);
  }
  await go();
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  await go("crossborder/tools/profit-calculator/");
  await fill("#pf-售价", "49.9");
  await button("保存本次快照");
  await page.waitForSelector('[role="dialog"]');
  await fill(".srm-name", "浏览器验证商品");
  await button("保存", '[role="dialog"]');
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("xm:products:v1") ?? "{}").products?.some(
      (p) =>
        p.name === "浏览器验证商品" &&
        p.records?.some((r) => r.values.price === 49.9),
    ),
  );
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval("#pf-售价", (e) => Number(e.value)), 49.9);
  await browser
    .defaultBrowserContext()
    .overridePermissions(origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
  await button("复制链接");
  await page.waitForFunction(() =>
    navigator.clipboard
      .readText()
      .then((t) =>
        t.includes(
          "/xiamimate-crossborder/crossborder/tools/profit-calculator/",
        ),
      ),
  );
  const share = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(
    new URL(share).pathname,
    BASE + "/crossborder/tools/profit-calculator/",
  );
  const clean = await browser.createBrowserContext();
  const sharedPage = await clean.newPage();
  await sharedPage.goto(share, { waitUntil: "networkidle0" });
  assert.equal(
    await sharedPage.$eval("#pf-售价", (e) => Number(e.value)),
    49.9,
  );
  await clean.close();
  // Download, remove data and restore through the actual file picker.
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: output,
  });
  await go("crossborder/my/");
  await button("导出全部备份");
  const backupName = await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const f = fs
        .readdirSync(output)
        .find((n) => /^xiamimate-crossborder-.*\.json$/.test(n));
      if (f) {
        clearInterval(timer);
        resolve(f);
      } else if (Date.now() - started > 10000) {
        clearInterval(timer);
        reject(new Error("Backup download timed out"));
      }
    }, 100);
  });
  const backup = JSON.parse(
    fs.readFileSync(path.join(output, backupName), "utf8"),
  );
  assert.ok(backup.products.some((p) => p.name === "浏览器验证商品"));
  await page.evaluate(() => localStorage.removeItem("xm:products:v1"));
  await page.reload({ waitUntil: "networkidle0" });
  page.once("dialog", (dialog) => dialog.accept());
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    button("导入备份"),
  ]);
  await chooser.accept([path.join(output, backupName)]);
  await page.waitForFunction(() =>
    document.body.innerText.includes("浏览器验证商品"),
  );
  await go("crossborder/workbench/voice-insight/");
  await button("填入演示样本");
  await button("分析评论样本");
  await page.waitForSelector(".local-table");
  assert.ok(
    (await page.$eval(".local-stats", (e) => e.innerText)).includes("4"),
  );
  await button("保存分析快照");
  await page.waitForSelector('[role="dialog"]');
  await button("保存", '[role="dialog"]');
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("xm:products:v1")).products.some((p) =>
      p.records?.some((r) => r.tool === "reviews"),
    ),
  );
  await go("crossborder/workbench/service-copilot/");
  await fill("textarea", "My parcel has not arrived.");
  await button("填入回复模板");
  assert.ok(
    (
      await page.$eval('textarea[aria-label="回复草稿"]', (e) => e.value)
    ).includes("tracking"),
  );
  await fill("textarea", "The item burned my hand.");
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === "填入回复模板",
        ).disabled,
    ),
    true,
  );
  // Mobile layout and navigation.
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
  });
  for (const route of [
    "",
    "crossborder/my/",
    "crossborder/tools/profit-calculator/",
    "crossborder/workbench/voice-insight/",
  ]) {
    await go(route);
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      view: window.innerWidth,
    }));
    assert.ok(
      width.scroll <= width.view + 2,
      "Horizontal overflow: " + route + " " + JSON.stringify(width),
    );
  }
  await go();
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, [], "Client errors");
  assert.deepEqual(backend, [], "Backend requests");
  assert.deepEqual(badResponses, [], "HTTP failures");
  console.log(
    JSON.stringify(
      {
        pages: routes.length,
        checks: [
          "calculators",
          "local persistence",
          "share in a clean browser",
          "backup download and restore",
          "review statistics",
          "service escalation",
          "mobile navigation",
        ],
        errors,
        backend,
        badResponses,
        screenshots: output,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
