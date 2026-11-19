import { test } from "node:test";
import assert from "node:assert/strict";

import { seededProject, slotByKey, type ProductFact, type ProductProject } from "../lib/crossborder/product-facts.ts";
import { emptySnapshot, type PolicyRule, type PolicySnapshot } from "../lib/crossborder/policy-snapshot.ts";
import {
  diagnose, factFindings, keywordCoverage, keywordFindings, policyFindings,
  summarize, summaryText, type DiagnosisInput,
} from "../lib/crossborder/listing-diagnosis.ts";

const NOW = Date.parse("2026-07-16T12:00:00Z");

/** 把某个槽位设成已确认。 */
function withFact(p: ProductProject, key: string, value: string, status: ProductFact["status"] = "confirmed"): ProductProject {
  return {
    ...p,
    facts: p.facts.map((f) => (f.key === key
      ? { ...f, value, status, source: "document" as const, sourceNote: "规格书第 2 页" }
      : f)),
  };
}

const titleRule = (over: Partial<PolicyRule> = {}): PolicyRule => ({
  id: "r1",
  claim: "标题不超过 75 字符（媒体类目除外）",
  scope: "amazon-us",
  effectiveFrom: "2026-07-27",
  url: "https://sellercentral.amazon.com/seller-forums/discussions/t/abc",
  sourceTitle: "Updates to improve your product titles begin on July 27",
  tier: "official",
  quote: "titles in all categories except for media will need to be 75 characters or less",
  constraint: { kind: "title_max_chars", value: 75 },
  retrievedAt: NOW,
  status: "confirmed",
  ...over,
});

const snapWith = (rules: PolicyRule[]): PolicySnapshot =>
  ({ ...emptySnapshot(), rules, retrievedAt: NOW });

const input = (over: Partial<DiagnosisInput> = {}): DiagnosisInput => ({
  listingTitle: "HydraPeak 保温水杯 32oz",
  bullets: [],
  keywords: [],
  project: seededProject("p1", "杯子"),
  snapshot: emptySnapshot(),
  now: NOW,
  ...over,
});

/* ---------------- 事实一致性（工作台存在的理由） ---------------- */

// 文案写了「防水」，事实库里防水是 unknown —— 这正是普通 AI 对话框抓不到的。
test("factFindings · 文案提到未知事实即报高风险", () => {
  const f = factFindings(input({ listingTitle: "Waterproof Insulated Bottle" }));
  const hit = f.find((x) => x.id === "fact-waterproof");
  assert.ok(hit, "应抓到防水");
  assert.equal(hit.level, "risk"); // 防水是高风险槽位
  assert.match(hit.detail, /虚假宣传/);
  assert.match(hit.evidence!, /未知/);
});

test("factFindings · 已确认的事实不报", () => {
  const p = withFact(seededProject("p1", "杯子"), "material", "304 stainless steel");
  const f = factFindings(input({ listingTitle: "304 stainless steel bottle", project: p }));
  assert.equal(f.find((x) => x.id === "fact-material"), undefined);
  assert.equal(f.find((x) => x.id === "fact-overclaim-material"), undefined);
});

// 抽取到但没点头的，同样不许写进成品。
test("factFindings · 已抽取但未确认，照样拦", () => {
  const p = withFact(seededProject("p1", "杯子"), "material", "304 stainless steel", "unconfirmed");
  const hit = factFindings(input({ listingTitle: "304 stainless steel bottle", project: p })).find((x) => x.id === "fact-material");
  assert.ok(hit);
  assert.match(hit.detail, /还没确认/);
});

test("factFindings · 非高风险槽位报 gap 而不是 risk", () => {
  const hit = factFindings(input({ listingTitle: "Bottle for the gym", bullets: ["Great for commute"] }))
    .find((x) => x.id === "fact-scenario");
  assert.ok(hit);
  assert.equal(hit.level, "gap");
  assert.equal(slotByKey("scenario")?.risky, undefined);
});

test("factFindings · 分得清问题出在标题还是五点", () => {
  const inTitle = factFindings(input({ listingTitle: "Waterproof Bottle" }))[0];
  assert.equal(inTitle.field, "title");
  const inBullets = factFindings(input({ listingTitle: "Bottle", bullets: ["IPX7 rated design"] }))[0];
  assert.equal(inBullets.field, "bullets");
});

// 用户文档里点名的例子：标题写 waterproof，资料只确认 water-resistant。
test("factFindings · 用词强于已确认事实要提示", () => {
  const p = withFact(seededProject("p1", "杯子"), "waterproof", "water-resistant");
  const hit = factFindings(input({ listingTitle: "Waterproof Bottle", project: p }))
    .find((x) => x.id === "fact-overclaim-waterproof");
  assert.ok(hit, "应抓到 waterproof vs water-resistant");
  assert.equal(hit.level, "risk");
  assert.match(hit.title, /只到「water-resistant」/);
});

// 跨语言比不了就说比不了：规格书是中文、Listing 是英文时，
// 「304 不锈钢」与「stainless steel」机器看不出是同一件事，硬判夸大会淹没真问题。
test("factFindings · 中文事实 vs 英文文案：如实说无法比对，不硬判夸大", () => {
  const p = withFact(seededProject("p1", "杯子"), "material", "304 不锈钢，双层真空");
  const f = factFindings(input({ listingTitle: "Stainless Steel Bottle", project: p }));
  assert.equal(f.find((x) => x.id === "fact-overclaim-material"), undefined, "不该报夸大");
  const hit = f.find((x) => x.id === "fact-uncomparable-material");
  assert.ok(hit, "应报无法比对");
  assert.equal(hit.level, "unknown");
  assert.match(hit.detail, /人工核对/);
});

// 照实写就不该报 —— 否则用户会被噪音淹没。
test("factFindings · 照已确认的值写不报夸大", () => {
  const p = withFact(seededProject("p1", "杯子"), "waterproof", "water-resistant");
  const f = factFindings(input({ listingTitle: "Water-resistant Bottle", project: p }));
  assert.equal(f.find((x) => x.id?.startsWith("fact-overclaim")), undefined);
});

/* ---------------- 关键词覆盖 ---------------- */

test("keywordCoverage · 只回答词有没有写进去，忽略大小写", () => {
  const c = keywordCoverage(input({
    listingTitle: "Insulated Water Bottle 32oz",
    bullets: ["Keeps drinks cold"],
    keywords: ["insulated water bottle", "desk organizer", "KEEPS DRINKS COLD"],
  }));
  assert.deepEqual(c.covered, ["insulated water bottle", "KEEPS DRINKS COLD"]);
  assert.deepEqual(c.missing, ["desk organizer"]);
  assert.equal(Math.round(c.ratio * 100), 67);
});

test("keywordFindings · 未覆盖时明说覆盖率不代表值得投", () => {
  const f = keywordFindings(input({ keywords: ["a", "b"], listingTitle: "a" }))[0];
  assert.equal(f.level, "gap");
  assert.match(f.detail, /不代表值得写/);
  assert.match(f.detail, /没有/); // 我们没有搜索量数据
});

test("keywordFindings · 没上传关键词就说没上传，不报问题", () => {
  const f = keywordFindings(input({ keywords: [] }))[0];
  assert.equal(f.level, "info");
  assert.match(f.detail, /不提供搜索量数据/);
});

/* ---------------- 硬规则 ---------------- */

// 最要紧的一条：没有官方规则时输出「无法判断」，绝不因为没查到就说没问题。
test("policyFindings · 无官方规则 → 标题长度无法判断", () => {
  const f = policyFindings(input()).find((x) => x.id === "title-len-unknown");
  assert.ok(f);
  assert.equal(f.level, "unknown");
  assert.match(f.detail, /不代表没有问题/);
});

test("policyFindings · 软文里的 75 字符不能用来判定", () => {
  const blogRule = titleRule({ tier: "secondary", url: "https://zonguru.com/x" });
  const f = policyFindings(input({ snapshot: snapWith([blogRule]) }));
  assert.ok(f.find((x) => x.id === "title-len-unknown"), "软文不能当判定依据");
});

test("policyFindings · 官方规则未经你核对也不能判定", () => {
  const f = policyFindings(input({ snapshot: snapWith([titleRule({ status: "unconfirmed" })]) }));
  assert.ok(f.find((x) => x.id === "title-len-unknown"));
});

test("policyFindings · 官方 + 已核对 → 超限判违反，并附原文与来源", () => {
  const long = "A".repeat(90);
  const f = policyFindings(input({ listingTitle: long, snapshot: snapWith([titleRule()]) }))
    .find((x) => x.id === "title-len-over")!;
  assert.equal(f.level, "violation");
  assert.match(f.title, /90 字符，超出上限 75/);
  assert.match(f.detail, /超出 15 个字符/);
  assert.match(f.detail, /2026-07-27 起生效/); // 11 天后才生效，现在还有时间改
  assert.match(f.evidence!, /75 characters or less/);
  assert.equal(f.sourceUrl, "https://sellercentral.amazon.com/seller-forums/discussions/t/abc");
});

test("policyFindings · 未超限不报违反", () => {
  const f = policyFindings(input({ listingTitle: "短标题", snapshot: snapWith([titleRule()]) }))
    .find((x) => x.id === "title-len-ok")!;
  assert.equal(f.level, "info");
});

// emoji 按码点算，不能因为编码把长度算成两倍。
test("policyFindings · 标题长度按码点计", () => {
  const f = policyFindings(input({ listingTitle: "🧊".repeat(80), snapshot: snapWith([titleRule()]) }))
    .find((x) => x.id === "title-len-over")!;
  assert.match(f.title, /80 字符/);
});

test("policyFindings · 快照过期要提醒", () => {
  const old = NOW - 40 * 86_400_000;
  const f = policyFindings(input({ snapshot: { ...snapWith([titleRule({ retrievedAt: old })]), retrievedAt: old } }))
    .find((x) => x.id === "policy-stale");
  assert.ok(f);
  assert.equal(f.level, "unknown");
});

test("policyFindings · 未生效的规则提前告知", () => {
  const f = policyFindings(input({ snapshot: snapWith([titleRule()]) }))
    .find((x) => x.id.startsWith("policy-upcoming"));
  assert.ok(f);
  assert.match(f.title, /2026-07-27 起生效/);
});

/* ---------------- 汇总 ---------------- */

test("diagnose · 按严重度排序，违反在最前", () => {
  const f = diagnose(input({
    listingTitle: "Waterproof Bottle " + "A".repeat(80),
    keywords: ["desk organizer"],
    snapshot: snapWith([titleRule()]),
  }));
  assert.equal(f[0].level, "violation");
  assert.ok(f.some((x) => x.level === "risk"));
});

// 有「无法判断」时绝不能给出完整结论。
test("summarize / summaryText · 存在无法判断项时结论不完整", () => {
  const f = diagnose(input({ listingTitle: "Waterproof Bottle" })); // 无政策快照 → unknown
  const s = summarize(f);
  assert.equal(s.conclusive, false);
  assert.ok(s.unknowns > 0);
  const t = summaryText(s);
  assert.match(t, /结论不完整/);
  assert.match(t, /不代表没有问题/);
  assert.ok(!t.includes("合规"));
});

test("summaryText · 全部可判定时也不说「合规」，并交代检查范围", () => {
  const f = diagnose(input({ listingTitle: "短标题", snapshot: snapWith([titleRule()]), keywords: ["短标题"] }));
  const s = summarize(f);
  assert.equal(s.conclusive, true);
  const t = summaryText(s);
  assert.match(t, /不替代平台审核/);
  assert.ok(!t.includes("合规"));
});
