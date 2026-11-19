import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { createPreviewServer, BASE } from "./serve-static.mjs";
const server = process.env.LIVE_ORIGIN ? null : createPreviewServer();
if (server) await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = process.env.LIVE_ORIGIN ?? "http://127.0.0.1:" + server.address().port;
const output = fs.mkdtempSync(path.join(os.tmpdir(), "xiamimate-collector-smoke-"));
const executablePath = process.env.CHROME_PATH ?? (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");
let browser;
const errors = [];
async function click(page, label) {
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll("button")].find(e => e.textContent.trim() === text), label);
  assert.ok(handle.asElement(), "Button: " + label);
  await handle.asElement().click(); await handle.dispose();
}
async function waitFile(name) {
  const file = path.join(output, name);
  const start = Date.now();
  while (!fs.existsSync(file)) {
    if (Date.now() - start > 15000) throw new Error("Missing download: " + name);
    await new Promise(r => setTimeout(r, 100));
  }
  return file;
}
try {
  const metaRes = await fetch(origin + BASE + "/downloads/collector.json");
  assert.equal(metaRes.status, 200);
  const meta = await metaRes.json();
  const zipRes = await fetch(origin + BASE + "/downloads/" + meta.file);
  assert.equal(zipRes.status, 200);
  const zip = Buffer.from(await zipRes.arrayBuffer());
  assert.equal(createHash("sha256").update(zip).digest("hex"), meta.sha256);
  const zipFile = path.join(output, "collector.zip"), unpacked = path.join(output, "unpacked");
  fs.writeFileSync(zipFile, zip); fs.mkdirSync(unpacked);
  execFileSync("unzip", ["-q", zipFile, "-d", unpacked]);
  const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, "manifest.json"), "utf8"));
  assert.equal(manifest.version, meta.version);
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal(manifest.host_permissions, undefined); assert.equal(manifest.background, undefined);
  browser = await puppeteer.launch({
    executablePath, headless: true, pipe: true, ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-extension-debugging"],
  });
  const cdp = await browser.target().createCDPSession();
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: unpacked });
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
  console.log("Loaded downloadable extension " + manifest.version + ": " + id);
  const productPage = await browser.newPage();
  const fixtureBody = name => fs.readFileSync("extension/tests/fixtures/" + name, "utf8").replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  const amazonFixture = "<!doctype html><html><body>" +
    fixtureBody("amazon-us.html").replaceAll("B0CTEST123", "B0016HF5GK") +
    fixtureBody("amazon-reviews-featured.html") + fixtureBody("amazon-customers-say.html") + "</body></html>";
  let fixture = amazonFixture;
  await productPage.setRequestInterception(true);
  productPage.on("request", r => r.respond({ status: 200, contentType: r.isNavigationRequest() ? "text/html" : "text/plain", body: r.isNavigationRequest() ? fixture : "" }));
  const openPopup = async () => {
    await productPage.bringToFront();
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const targetInfo = targetInfos.find(t => t.type === "tab" && t.url === productPage.url());
    assert.ok(targetInfo, "Product tab target: " + JSON.stringify(targetInfos));
    await cdp.send("Extensions.triggerAction", { id, targetId: targetInfo.targetId });
    const target = await browser.waitForTarget(t => t.url() === "chrome-extension://" + id + "/popup/index.html");
    const popup = await target.asPage();
    assert.ok(popup);
    popup.on("pageerror", e => errors.push(e.message));
    popup.on("dialog", d => d.accept());
    await popup.waitForSelector("#view button");
    return popup;
  };
  await productPage.goto("https://www.amazon.com/dp/B0016HF5GK", { waitUntil: "domcontentloaded" });
  let popup = await openPopup();
  await click(popup, "采集本页商品");
  await popup.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "导出商品与评论 JSON"));
  await click(popup, "导出商品与评论 JSON");
  const captureFile = await waitFile("xiamimate-amazon-us-B0016HF5GK.json");
  const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
  assert.equal(capture.product.externalId, "B0016HF5GK");
  assert.ok(capture.reviews.reviews.length > 0);
  assert.ok(capture.insights.topics.length > 0);
  const saved = await popup.evaluate(() => chrome.storage.local.get(null));
  assert.ok(saved.lastCapture); assert.ok(saved.reviewCart.reviews.length);
  assert.equal(saved.session, undefined);
  await popup.screenshot({ path: path.join(output, "collector.png") });
  await popup.close();
  console.log("Amazon page -> actual popup -> JSON download passed.");

  const page = await browser.newPage();
  page.on("pageerror", e => errors.push(e.message));
  const backend = [];
  page.on("request", r => { if (/^\/(v1|api|auth|account)(\/|$)/.test(new URL(r.url()).pathname.replace(BASE, ""))) backend.push(r.url()); });
  const go = route => page.goto(origin + BASE + route, { waitUntil: "networkidle0" });
  await go("/extension/import/");
  await (await page.$('input[type="file"]')).uploadFile(captureFile);
  await page.waitForSelector('[data-testid="capture-preview"]');
  assert.equal(await page.evaluate(() => localStorage.getItem("xm:products:v1")), null);
  await click(page, "确认导入本地档案");
  await page.waitForFunction(() => document.body.innerText.includes("已导入本地商品档案"));
  let store = await page.evaluate(() => JSON.parse(localStorage.getItem("xm:products:v1")));
  assert.equal(store.products.length, 1); assert.equal(store.products[0].records.length, 1);
  const beforeDuplicate = store.products[0].records.length;
  await go("/extension/import/");
  await (await page.$('input[type="file"]')).uploadFile(captureFile);
  await page.waitForSelector('[data-testid="capture-preview"]'); await click(page, "确认导入本地档案");
  await page.waitForFunction(() => document.body.innerText.includes("已经导入，没有重复"));
  store = await page.evaluate(() => JSON.parse(localStorage.getItem("xm:products:v1")));
  assert.equal(store.products[0].records.length, beforeDuplicate);
  // Fail a real storage write and check that the existing archive remains byte-for-byte intact.
  const changed = structuredClone(capture); changed.product.fields.price = 999;
  const changedFile = path.join(output, "changed.json"); fs.writeFileSync(changedFile, JSON.stringify(changed));
  await go("/extension/import/");
  const oldStorage = await page.evaluate(() => localStorage.getItem("xm:products:v1"));
  await (await page.$('input[type="file"]')).uploadFile(changedFile);
  await page.waitForSelector('[data-testid="capture-preview"]');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Quota", "QuotaExceededError"); }; });
  await click(page, "确认导入本地档案");
  await page.waitForFunction(() => document.body.innerText.includes("现有档案已保留"));
  assert.equal(await page.evaluate(() => localStorage.getItem("xm:products:v1")), oldStorage);
  await go("/crossborder/workbench/voice-insight/");
  await click(page, "读取当前商品的采集评论");
  await page.waitForFunction(() => document.querySelector('[aria-label="我的评论 CSV"]').value.includes("miracle worker"));
  await click(page, "分析评论样本");
  await page.waitForFunction(() => document.body.innerText.includes("样本统计"));
  await go("/crossborder/research/workspace/");
  await page.type('[aria-label="研究问题"]', "核对用户反馈和商品定位");
  await click(page, "整理研究底稿");
  await page.waitForSelector(".research-draft");
  const draft = await page.$eval(".research-draft", e => e.textContent);
  assert.ok(draft.includes("未进行自动联网检索或 AI 推理"));
  assert.ok(draft.includes("miracle worker"));
  await click(page, "保存到商品档案");
  await page.waitForFunction(() => document.body.innerText.includes("底稿已保存"));
  await click(page, "导出研究底稿");
  const draftFile = await waitFile("xiamimate-research.md");
  assert.equal(fs.readFileSync(draftFile, "utf8"), draft);
  await page.screenshot({ path: path.join(output, "research.png"), fullPage: true });
  await go("/crossborder/my/");
  assert.ok((await page.$eval("body", e => e.innerText)).includes("本地研究底稿"));
  assert.deepEqual(backend, []);
  console.log("Preview -> confirm -> deduplicate -> quota rollback -> review analysis -> saved research passed.");

  fixture = fs.readFileSync("extension/tests/fixtures/tiktok-us.html", "utf8");
  await productPage.goto("https://shop.tiktok.com/us/pdp/test/1731873437826453780", { waitUntil: "domcontentloaded" });
  popup = await openPopup();
  await click(popup, "采集本页商品");
  await popup.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "导出商品与评论 JSON"));
  await click(popup, "导出商品与评论 JSON");
  const tikFile = await waitFile("xiamimate-tiktok-us-1731873437826453780.json");
  const tik = JSON.parse(fs.readFileSync(tikFile, "utf8"));
  assert.equal(tik.product.platform, "tiktok"); assert.ok(tik.reviews.reviews.length > 0);
  assert.equal(tik.reviews.externalId, tik.product.externalId);
  console.log("TikTok capture and product isolation passed.");
  assert.deepEqual(errors, []);
  console.log("Extension and research browser verification passed. Artifacts: " + output);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(r => server.close(r));
}
