import test from "node:test";
import assert from "node:assert/strict";
import {
  analyseLocally,
  parseTopics,
  summarizeTopics,
  serviceTemplate,
} from "../lib/crossborder/local-workbench";
import {
  parseBackup,
  mergeBackup,
  restoreBackup,
  type Backup,
} from "../lib/crossborder/backup";
import { defaultModel } from "../lib/crossborder/product-model";
import { sitePath } from "../lib/site";
import { decodeValues } from "../app/crossborder/tools/tool-actions";
const backup = (products: Backup["products"] = []): Backup => ({
  format: "xiamimate-crossborder",
  version: 1,
  exportedAt: "2026-11-19",
  products,
  templates: [],
});
const product = (
  id = "p1",
  stableId = "s1",
  updatedAt = 1,
): Backup["products"][number] => ({
  id,
  stableId,
  name: "商品",
  marketplace: "amazon-us",
  finance: defaultModel(),
  project: null,
  cloudId: null,
  updatedAt,
  records: [],
});
test("review matching counts each review once, respects English word boundaries and keeps missing ratings", () => {
  const rules = parseTopics("适配: fit, size");
  const stats = summarizeTopics(
    [
      { id: "1", rating: 2, date: "", variant: "", text: "fit and size" },
      { id: "2", rating: 5, date: "", variant: "", text: "a useful benefit" },
      { id: "3", rating: 0, date: "", variant: "", text: "good fit" },
    ],
    rules,
  );
  assert.equal(stats[0].count, 2);
  assert.equal(stats[0].share, 66.7);
  assert.equal(stats[0].low, 1);
  assert.equal(stats[0].high, 0);
});
test("CSV quotes and competitors have independent sample denominators", () => {
  const r = analyseLocally(
    'rating,text\n1,"size, too small"\n5,easy',
    "rating,text\n2,size",
    "尺寸: size",
  );
  assert.equal(r.profile.total, 2);
  assert.equal(r.themes[0].share, 50);
  assert.equal(r.competitor?.themes[0].share, 100);
  assert.throws(() => analyseLocally("wrong\ndata", "", "尺寸: size"));
  assert.throws(() => parseTopics("重复: a\n重复: b"));
});
test("templates don't include buyer identifiers or invent refund commitments; serious issues stop template generation", () => {
  const r = serviceTemplate(
    "order 123-1234567-1234567, buyer@example.com",
    "refund",
    "en",
  );
  assert.ok(!r.safe.includes("buyer@example.com"));
  assert.ok(!r.reply.includes("123-"));
  assert.ok(r.reply.includes("eligibility"));
  assert.equal(
    serviceTemplate("The item burned my hand", "damage", "en").reply,
    "",
  );
  assert.equal(
    serviceTemplate("My lawyer will contact you", "refund", "zh").reply,
    "",
  );
});
test("backup validates all input before changing data and clears remote identity", () => {
  const p = product();
  p.cloudId = "remote";
  const parsed = parseBackup(JSON.stringify(backup([p])));
  assert.equal(parsed.products[0].cloudId, null);
  assert.throws(() =>
    parseBackup(JSON.stringify(backup([{ ...p, stub: true }]))),
  );
  assert.throws(() =>
    parseBackup(
      JSON.stringify(backup([{ ...p, records: [{ id: "bad" }] as never }])),
    ),
  );
  assert.throws(() => parseBackup(JSON.stringify(backup([p, p]))));
});
test("backup merge preserves unrelated products and newer edits and avoids local ID collisions", () => {
  const current = backup([product("p1", "s1", 5), product("p2", "s2", 4)]);
  const result = mergeBackup(
    current,
    backup([product("other", "s1", 2), product("p2", "s3", 9)]),
  );
  assert.equal(result.products.length, 3);
  assert.equal(result.products[0].updatedAt, 5);
  assert.equal(new Set(result.products.map((p) => p.id)).size, 3);
  const newer = mergeBackup(current, backup([product("different", "s1", 10)]));
  assert.equal(newer.products[0].id, "p1");
  assert.equal(newer.products[0].updatedAt, 10);
});
test("failed restore rolls both stores back", () => {
  const entries = new Map([
    [
      "xm:products:v1",
      JSON.stringify({ currentId: "p1", products: [product()] }),
    ],
    ["xm:cost-templates", "[]"],
  ]);
  const before = new Map(entries);
  let writes = 0;
  const storage = {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes++;
      if (writes === 2) throw new Error("quota");
      entries.set(k, v);
    },
    removeItem: (k: string) => {
      entries.delete(k);
    },
  };
  assert.throws(() =>
    restoreBackup(storage, backup([product()]), backup([product("p2", "s2")])),
  );
  assert.deepEqual(entries, before);
});
test("copied parameters preserve percent signs and reject nested unsafe values", () => {
  const v = { name: "20% 折扣", price: 19.5 };
  assert.deepEqual(decodeValues(JSON.stringify(v)), v);
  assert.deepEqual(decodeValues(encodeURIComponent(JSON.stringify(v))), v);
  assert.equal(decodeValues('{"price":{"nested":1}}'), null);
  assert.equal(decodeValues("[1,2]"), null);
});
test("site paths keep query/hash and external links intact", () => {
  assert.equal(sitePath("https://example.com"), "https://example.com");
  assert.equal(
    sitePath("/crossborder/my?x=1#n").endsWith("/crossborder/my/?x=1#n"),
    true,
  );
  assert.equal(sitePath("/favicon.svg").endsWith("/favicon.svg"), true);
});
