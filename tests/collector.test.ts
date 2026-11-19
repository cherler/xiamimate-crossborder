import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { capture } from "../extension/src/adapters/index";
import { parseCaptureBundle, bundleIdentity, reviewsCsv, safeHttpUrl, type CaptureBundle } from "../shared/collector";
import { captureFingerprint, prepareCaptureProduct, collectedReviews } from "../lib/crossborder/collector";
import { buildResearchDraft, parseEvidence } from "../lib/crossborder/research/local";
import { defaultModel } from "../lib/crossborder/product-model";
import type { Product } from "../lib/crossborder/products";
const at = "2026-11-19T02:00:00.000Z";
const identity = { platform: "amazon", marketplace: "amazon-us", externalId: "B012345678", adapterVersion: "test@1" };
const provenance = { sampleType: "featured" as const, pageNumber: 1, starFilter: "", sortBy: "", reviewerType: "", totalReviews: 100,
  productTitle: "测试商品", ratingHistogram: null, sourceUrl: "https://www.amazon.com/dp/B012345678", capturedAt: at };
function bundle(): CaptureBundle {
  return { format: "xiamimate-capture", version: 1, exportedAt: at,
    product: { ...identity, sourceUrl: provenance.sourceUrl, capturedAt: at, fields: { title: "测试商品", price: 25, rating: 4.5 }, missingFields: [] },
    reviews: { ...identity, label: "用户手动采集", reviews: [
      { id: "review1", rating: 2, date: "2026-11-01", variant: "Blue", title: "Size", text: 'Too small, "not fit"', verified: true, helpful: 1 },
    ], provenance, pages: [provenance] }, insights: null };
}
const parse = (v: unknown) => parseCaptureBundle(JSON.stringify(v));
test("bundle validates supported identity and rejects mixed products, unsafe URLs and invalid numbers", () => {
  const b = bundle();
  assert.equal(bundleIdentity(parse(b)).externalId, identity.externalId);
  assert.throws(() => parse({ ...b, version: 2 }));
  assert.throws(() => parse({ ...b, reviews: { ...b.reviews, marketplace: "amazon-de" } }));
  assert.throws(() => parse({ ...b, product: { ...b.product, sourceUrl: "javascript:alert(1)" } }));
  assert.throws(() => parse({ ...b, product: { ...b.product, fields: { price: -1 } } }));
  assert.throws(() => parse({ ...b, product: { ...b.product, fields: { title: {} } } }));
  assert.equal(safeHttpUrl("https://user:secret@example.com"), "");
});
test("re-export and import are idempotent; existing finance, named title and other records survive", async () => {
  const b = parse(bundle()), fingerprint = await captureFingerprint(b);
  assert.equal(fingerprint, await captureFingerprint({ ...b, exportedAt: "2026-11-20T00:00:00Z" }));
  const existing: Product = { id: "p1", stableId: "s1", name: "我的命名", named: true, asin: identity.externalId, marketplace: identity.marketplace,
    finance: { ...defaultModel(), price: 99, cost: 12 }, project: null, updatedAt: 1, cloudId: null,
    records: [{ id: "r1", tool: "profit", label: "测算", values: { price: 99 }, ts: 1 }] };
  const result = prepareCaptureProduct([existing], b, fingerprint);
  assert.equal(result.product.name, existing.name);
  assert.deepEqual(result.product.finance, existing.finance);
  assert.equal(result.product.platform?.price, 25);
  assert.equal(result.product.records?.length, 2);
  assert.equal(existing.records?.length, 1);
  assert.equal(prepareCaptureProduct([result.product], b, fingerprint).duplicate, true);
  const old = { ...b, product: { ...b.product!, capturedAt: "2025-01-01", fields: { price: 5 } } };
  assert.equal(prepareCaptureProduct([result.product], old, "older").product.platform?.price, 25);
});
test("different marketplaces remain separate and overlapping batches deduplicate reviews", () => {
  const b = parse(bundle()), a = prepareCaptureProduct([], b, "a").product;
  const next = prepareCaptureProduct([a], b, "b").product;
  assert.equal(collectedReviews(next).length, 1);
  const foreign = parse({ ...b, product: { ...b.product, marketplace: "amazon-de" }, reviews: null });
  const other = prepareCaptureProduct([a], foreign, "c").product;
  assert.notEqual(other.id, a.id);
  assert.match(reviewsCsv(collectedReviews(next)), /""not fit""/);
});
test("real parser output passes the same handoff validation used by the website", () => {
  const html = readFileSync(new URL("../extension/tests/fixtures/amazon-us.html", import.meta.url), "utf8");
  const doc = parseHTML(html).document as unknown as Document;
  const c = capture(doc, "https://www.amazon.com/dp/B0CTEST123");
  assert.ok(c);
  const result = parse({ ...bundle(), product: { ...c, capturedAt: at }, reviews: null });
  assert.equal(result.product?.fields.title, c.fields.title);
});
test("research requires evidence syntax and a real rival; preserves sample scope and honest generation labels", () => {
  const p = prepareCaptureProduct([], parse(bundle()), "a").product;
  const input = { product: p, mode: "voice" as const, question: "尺寸问题？", evidence: "https://example.com/facts | 用户核对的资料", conclusion: "待验证", actions: "补充样本", topics: "尺寸: small, fit" };
  const draft = buildResearchDraft(input);
  assert.match(draft, /去重后 1 条/);
  assert.match(draft, /未进行自动联网检索或 AI 推理/);
  assert.match(draft, /\[P1\]/);
  assert.match(draft, /\[S1\]/);
  assert.match(draft, /Too small/);
  assert.throws(() => buildResearchDraft({ ...input, mode: "rival" }));
  assert.throws(() => parseEvidence("javascript:alert(1) | bad"));
});
