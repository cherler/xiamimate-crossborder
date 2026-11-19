import { test } from "node:test";
import assert from "node:assert/strict";

import {
  POLICY_SNAPSHOT_VERSION, classifySource, emptySnapshot, canBeHardRule, hardRules,
  advisoryRules, verdictFor, verdictText, isStale, describeRetrieval, upcomingRules,
  sanitizeSnapshot, type PolicyRule, type PolicySnapshot,
} from "../lib/crossborder/policy-snapshot.ts";

const NOW = Date.parse("2026-07-16T12:00:00Z");
const DAY = 86_400_000;

const rule = (over: Partial<PolicyRule> = {}): PolicyRule => ({
  id: "r1",
  claim: "标题不超过 75 字符（媒体类目除外）",
  scope: "amazon-us",
  effectiveFrom: "2026-07-27",
  url: "https://sellercentral.amazon.com/seller-forums/discussions/t/abc",
  sourceTitle: "Updates to improve your product titles begin on July 27",
  tier: "official",
  quote: "titles in all categories except for media will need to be 75 characters or less",
  retrievedAt: NOW,
  status: "confirmed",
  ...over,
});

const snap = (rules: PolicyRule[], over: Partial<PolicySnapshot> = {}): PolicySnapshot =>
  ({ ...emptySnapshot(), rules, retrievedAt: NOW, ...over });

/* ---------------- 来源分级 ---------------- */

test("classifySource · 平台官方域判为 official", () => {
  for (const u of [
    "https://sellercentral.amazon.com/seller-forums/discussions/t/abc",
    "https://sell.amazon.com/blog/amazon-listing-ai",
    "https://sellercentral.amazon.co.uk/help",
    "https://advertising.amazon.com/resources",
  ]) assert.equal(classifySource(u), "official", u);
});

// 代运营与 SEO 软文永远只能是 secondary，无论标题写得多像官方。
test("classifySource · 第三方一律 secondary", () => {
  for (const u of [
    "https://www.zonguru.com/blog/amazon-75-character-title-limit",
    "https://clearadsagency.com/amazons-75-character-title-limit/",
    "https://channelx.world/2026/06/amazon-product-titles-reduced/",
    "https://www.amazon.com/dp/B0XXXX",
  ]) assert.equal(classifySource(u), "secondary", u);
});

// 冒充域名是这套分级最现实的攻击面。
test("classifySource · 冒充官方域的不给提权", () => {
  assert.equal(classifySource("https://sellercentral.amazon.evil.com/x"), "secondary");
  assert.equal(classifySource("https://notsellercentral.amazon.com.attacker.io/x"), "secondary");
  assert.equal(classifySource("not-a-url"), "secondary");
  assert.equal(classifySource(""), "secondary");
});

/* ---------------- 安全阀 ---------------- */

test("canBeHardRule · 必须官方来源且已核对", () => {
  assert.equal(canBeHardRule(rule()), true);
  assert.equal(canBeHardRule(rule({ status: "unconfirmed" })), false, "未核对不能判定");
  assert.equal(canBeHardRule(rule({ tier: "secondary" })), false, "软文不能判定");
});

test("hardRules / advisoryRules · 互补且覆盖全部", () => {
  const s = snap([
    rule({ id: "a" }),
    rule({ id: "b", status: "unconfirmed" }),
    rule({ id: "c", tier: "secondary", url: "https://zonguru.com/x" }),
  ]);
  assert.deepEqual(hardRules(s).map((r) => r.id), ["a"]);
  assert.deepEqual(advisoryRules(s).map((r) => r.id), ["b", "c"]);
});

/* ---------------- 结论只有「查过」与「无法判断」 ---------------- */

// 最要紧的一条：没有官方依据时，绝不能让用户以为「没问题」。
test("verdictFor · 无官方硬规则时为 unknown，不是「没问题」", () => {
  assert.equal(verdictFor(snap([])), "unknown");
  assert.equal(verdictFor(snap([rule({ tier: "secondary", url: "https://zonguru.com/x" })])), "unknown");
  assert.equal(verdictFor(snap([rule({ status: "unconfirmed" })])), "unknown");
  assert.equal(verdictFor(snap([rule()])), "checked");
});

test("verdictText · 无法判断时明说「不代表没有问题」，且从不说「合规」", () => {
  const empty = verdictText(snap([]), NOW);
  assert.match(empty, /无法判断/);
  assert.match(empty, /不代表没有问题/);

  const onlyBlogs = verdictText(snap([rule({ tier: "secondary", url: "https://zonguru.com/x" })]), NOW);
  assert.match(onlyBlogs, /没有官方来源/);
  assert.match(onlyBlogs, /不代表没有问题/);

  const ok = verdictText(snap([rule()]), NOW);
  assert.match(ok, /1 条官方规则/);
  assert.match(ok, /不替代平台审核/);
  for (const t of [empty, onlyBlogs, ok]) assert.ok(!t.includes("合规"), `不该出现「合规」：${t}`);
});

/* ---------------- 时效 ---------------- */

test("isStale · 超过 30 天视为过期，未检索也算过期", () => {
  assert.equal(isStale(NOW, NOW), false);
  assert.equal(isStale(NOW - 29 * DAY, NOW), false);
  assert.equal(isStale(NOW - 31 * DAY, NOW), true);
  assert.equal(isStale(0, NOW), true);
});

test("describeRetrieval · 永远带日期", () => {
  assert.equal(describeRetrieval(0, NOW), "尚未检索");
  assert.match(describeRetrieval(NOW, NOW), /检索于 2026-07-16（今天）/);
  assert.match(describeRetrieval(NOW - 3 * DAY, NOW), /3 天前/);
});

// 75 字符规则 2026-07-27 生效，比 NOW 晚 11 天 —— 未生效的规则要提前告知。
test("upcomingRules · 挑出尚未生效的规则", () => {
  const s = snap([
    rule({ id: "future", effectiveFrom: "2026-07-27" }),
    rule({ id: "already", effectiveFrom: "2025-01-01" }),
    rule({ id: "undated", effectiveFrom: "" }),
  ]);
  assert.deepEqual(upcomingRules(s, NOW).map((r) => r.id), ["future"]);
});

/* ---------------- 存取守卫 ---------------- */

test("sanitizeSnapshot · 垃圾与未来版本一律拒绝", () => {
  assert.equal(sanitizeSnapshot("nope"), null);
  assert.equal(sanitizeSnapshot({}), null);
  assert.equal(sanitizeSnapshot({ version: POLICY_SNAPSHOT_VERSION + 1, rules: [] }), null);
  assert.ok(sanitizeSnapshot({ version: POLICY_SNAPSHOT_VERSION, rules: [] }));
});

test("sanitizeSnapshot · 丢弃没有主张 / 出处 / 原文的条目", () => {
  const s = sanitizeSnapshot({
    version: 1,
    rules: [
      { claim: "有主张", url: "https://sellercentral.amazon.com/x", quote: "原文" },
      { claim: "缺出处", quote: "原文" },
      { url: "https://sellercentral.amazon.com/y", quote: "缺主张" },
      { claim: "缺原文", url: "https://sellercentral.amazon.com/z" },
      "garbage",
    ],
  })!;
  assert.deepEqual(s.rules.map((r) => r.claim), ["有主张"]);
});

// 存下来的 tier 不可信：改一改 localStorage 就能把软文提权成官方判定依据。
test("sanitizeSnapshot · tier 由 URL 重新判定，不采信存储值", () => {
  const s = sanitizeSnapshot({
    version: 1,
    rules: [{ claim: "假规则", url: "https://zonguru.com/x", quote: "原文", tier: "official", status: "confirmed" }],
  })!;
  assert.equal(s.rules[0].tier, "secondary");
  assert.equal(canBeHardRule(s.rules[0]), false);
});

test("sanitizeSnapshot · 认不出的状态降级为未核对", () => {
  const s = sanitizeSnapshot({
    version: 1,
    rules: [{ claim: "c", url: "https://sellercentral.amazon.com/x", quote: "q", status: "totally-fine" }],
  })!;
  assert.equal(s.rules[0].status, "unconfirmed");
  assert.equal(canBeHardRule(s.rules[0]), false);
});
