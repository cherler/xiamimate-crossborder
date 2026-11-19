import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PRODUCT_PROJECT_VERSION, FACT_SLOTS, emptyProject, seededProject, unknownFact, slotByKey,
  mergeExtracted, isMissingFactValue, isWritable, writableFacts, blockedFacts,
  violatingFacts, factCoverage, sanitizeProject, type ProductFact, type ProductProject,
} from "../lib/crossborder/product-facts.ts";

const fact = (over: Partial<ProductFact> & { key: string }): ProductFact => ({
  label: over.key, value: "", status: "unconfirmed", source: "inferred",
  sourceNote: "", confidence: "low", updatedAt: 0, ...over,
});

const project = (facts: ProductFact[]): ProductProject => ({ ...emptyProject("p1", "保温杯"), facts });

/* ---------------- 白名单 ---------------- */

test("isWritable · 只有已确认且有值的事实能写进成品", () => {
  assert.equal(isWritable(fact({ key: "material", value: "304 不锈钢", status: "confirmed" })), true);
  assert.equal(isWritable(fact({ key: "material", value: "304 不锈钢", status: "unconfirmed" })), false);
  assert.equal(isWritable(fact({ key: "waterproof", value: "", status: "unknown" })), false);
  assert.equal(isWritable(fact({ key: "warranty", value: "终身", status: "conflicting" })), false);
  // 已确认但值是空白，等于没有事实
  assert.equal(isWritable(fact({ key: "size", value: "   ", status: "confirmed" })), false);
});

test("writableFacts / blockedFacts · 互补且覆盖全部", () => {
  const p = project([
    fact({ key: "material", value: "304 不锈钢", status: "confirmed", source: "document" }),
    fact({ key: "waterproof", value: "", status: "unknown" }),
    fact({ key: "warranty", value: "终身质保", status: "unconfirmed", source: "inferred" }),
  ]);
  assert.deepEqual(writableFacts(p).map((f) => f.key), ["material"]);
  assert.deepEqual(blockedFacts(p).map((f) => f.key), ["waterproof", "warranty"]);
  assert.equal(writableFacts(p).length + blockedFacts(p).length, p.facts.length);
});

/* ---------------- 幻觉检查 ---------------- */

// 这是事实库存在的理由：AI 顺嘴写了资料里没有的卖点，要能被确定性地抓住。
test("violatingFacts · 成品写了未确认的卖点即判违规", () => {
  const p = project([
    fact({ key: "material", value: "304 不锈钢", status: "confirmed", source: "document" }),
    fact({ key: "warranty", value: "终身质保", status: "unconfirmed", source: "inferred" }),
  ]);
  const copy = "304 不锈钢内胆，终身质保，值得信赖";
  assert.deepEqual(violatingFacts(p, copy).map((f) => f.key), ["warranty"]);
});

test("violatingFacts · 只用已确认事实的文案不报违规", () => {
  const p = project([fact({ key: "material", value: "304 不锈钢", status: "confirmed" })]);
  assert.deepEqual(violatingFacts(p, "304 不锈钢内胆，耐用易清洁"), []);
});

// unknown 的事实没有值，就用它的 label 兜底 —— 文案提到「防水」也该被拦下。
test("violatingFacts · unknown 事实用 label 兜底拦截", () => {
  const p = project([fact({ key: "waterproof", label: "防水", value: "", status: "unknown", sourceNote: "未找到" })]);
  assert.deepEqual(violatingFacts(p, "全面防水，雨天可用").map((f) => f.key), ["waterproof"]);
  assert.deepEqual(violatingFacts(p, "轻便耐用，适合通勤"), []);
});

/* ---------------- 完成度 ---------------- */

test("factCoverage · 分别统计已确认 / 待确认 / 未知", () => {
  const c = factCoverage(project([
    fact({ key: "a", value: "x", status: "confirmed" }),
    fact({ key: "b", value: "y", status: "unconfirmed" }),
    fact({ key: "c", value: "z", status: "conflicting" }),
    fact({ key: "d", status: "unknown" }),
  ]));
  assert.deepEqual(c, { total: 4, confirmed: 1, pending: 2, unknown: 1, ratio: 0.25 });
  assert.equal(factCoverage(project([])).ratio, 0); // 空项目不除以 0
});

/* ---------------- 存取守卫 ---------------- */

test("sanitizeProject · 垃圾输入返回 null", () => {
  assert.equal(sanitizeProject("nope"), null);
  assert.equal(sanitizeProject(null), null);
  assert.equal(sanitizeProject({}), null); // 无 version
});

// 认不出的状态绝不能默认成 confirmed，否则脏数据能直接绕过白名单。
test("sanitizeProject · 非法状态降级为未确认，而不是放行", () => {
  const p = sanitizeProject({
    version: 1, id: "p", name: "杯子",
    facts: [{ key: "material", value: "钢", status: "totally-fine", source: "hacked" }],
  })!;
  assert.equal(p.facts[0].status, "unconfirmed");
  assert.equal(p.facts[0].source, "inferred");
  assert.equal(p.facts[0].sourceNote, "未标注来源");
  assert.equal(isWritable(p.facts[0]), false);
});

test("sanitizeProject · 过滤无 key 的事实与非对象项", () => {
  const p = sanitizeProject({ version: 1, facts: [{ label: "缺 key" }, "garbage", { key: "ok", value: "v" }] })!;
  assert.deepEqual(p.facts.map((f) => f.key), ["ok"]);
});

test("sanitizeProject · 未来版本拒绝读取而不是猜", () => {
  assert.equal(sanitizeProject({ version: PRODUCT_PROJECT_VERSION + 1, facts: [] }), null);
  assert.ok(sanitizeProject({ version: PRODUCT_PROJECT_VERSION, facts: [] }));
});

test("emptyProject · 默认站点为 amazon-us，无事实", () => {
  const p = emptyProject("p1", "保温杯");
  assert.equal(p.marketplace, "amazon-us");
  assert.equal(p.facts.length, 0);
  assert.equal(p.version, PRODUCT_PROJECT_VERSION);
});

/* ---------------- 槽位与并入 ---------------- */

// 槽位预先摊开为 unknown，是为了让「资料里没有」成为一条显式事实，
// 而不是一个 AI 可以顺手填补的空白。
test("seededProject · 全部标准槽位摊开为 unknown 且不可写", () => {
  const p = seededProject("p1", "保温杯");
  assert.equal(p.facts.length, FACT_SLOTS.length);
  assert.ok(p.facts.every((f) => f.status === "unknown"));
  assert.equal(writableFacts(p).length, 0);
  assert.equal(factCoverage(p).unknown, FACT_SLOTS.length);
});

test("FACT_SLOTS · 高风险槽位被标出且 key 唯一", () => {
  const keys = FACT_SLOTS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of ["material", "certification", "waterproof", "warranty"]) {
    assert.equal(slotByKey(k)?.risky, true, `${k} 应标为高风险`);
  }
  assert.equal(slotByKey("color")?.risky, undefined);
  assert.equal(slotByKey("nope"), undefined);
});

test("unknownFact · 未知事实带「未找到」的来源说明", () => {
  const f = unknownFact(FACT_SLOTS[0]);
  assert.equal(f.status, "unknown");
  assert.match(f.sourceNote, /未找到/);
});

test("isMissingFactValue · 中英文缺失说明不是商品事实", () => {
  for (const value of [
    "No warranty information is provided.",
    "No compatibility information is available",
    "Warranty information is not specified",
    "Compatibility: not provided",
    "Unknown",
    "N/A",
    "未提供质保信息",
    "兼容性信息未注明",
    "质保：暂无资料",
    "不详",
  ]) {
    assert.equal(isMissingFactValue(value), true, `应识别为缺失说明：${value}`);
  }
});

test("isMissingFactValue · 明确的否定事实与正常事实不误伤", () => {
  for (const value of [
    "No warranty",
    "2-year limited warranty",
    "Not dishwasher safe",
    "BPA-Free",
    "不提供质保",
    "不兼容 iPhone 12",
  ]) {
    assert.equal(isMissingFactValue(value), false, `不应识别为缺失说明：${value}`);
  }
});

// 抽取 ≠ 确认。模型认出来的东西一律落成 unconfirmed，必须用户逐条点头。
test("mergeExtracted · 抽取结果一律落成未确认", () => {
  const p = seededProject("p1", "杯子");
  const merged = mergeExtracted(p, [
    { ...unknownFact(slotByKey("material")!), value: "304 不锈钢", status: "confirmed", source: "document", sourceNote: "规格书第 2 页" },
  ], 1000);
  const material = merged.facts.find((f) => f.key === "material")!;
  assert.equal(material.value, "304 不锈钢");
  assert.equal(material.status, "unconfirmed"); // 即便传入 confirmed 也要降级
  assert.equal(isWritable(material), false);
  assert.equal(merged.updatedAt, 1000);
});

test("mergeExtracted · 缺失说明退回 unknown，不生成待确认事实", () => {
  const merged = mergeExtracted(seededProject("p1", "杯子"), [
    { ...unknownFact(slotByKey("warranty")!), value: "No warranty information is provided", source: "document" },
    { ...unknownFact(slotByKey("compatibility")!), value: "兼容性信息未提供", source: "document" },
    { key: "custom_missing", label: "其他", value: "N/A", status: "unconfirmed", source: "document", sourceNote: "资料", confidence: "high", updatedAt: 0 },
  ], 1000);
  const warranty = merged.facts.find((f) => f.key === "warranty")!;
  const compatibility = merged.facts.find((f) => f.key === "compatibility")!;
  assert.equal(warranty.status, "unknown");
  assert.equal(warranty.value, "");
  assert.equal(compatibility.status, "unknown");
  assert.equal(compatibility.value, "");
  assert.equal(merged.facts.some((f) => f.key === "custom_missing"), false);
  assert.equal(factCoverage(merged).pending, 0);
});

// 用户点过头的事实，不能被模型的再次猜测冲掉。
test("mergeExtracted · 已确认的事实不被抽取覆盖", () => {
  let p = seededProject("p1", "杯子");
  p = { ...p, facts: p.facts.map((f) => f.key === "material"
    ? { ...f, value: "316 不锈钢", status: "confirmed" as const, source: "user" as const } : f) };
  const merged = mergeExtracted(p, [{ ...unknownFact(slotByKey("material")!), value: "304 不锈钢", source: "document" }]);
  const material = merged.facts.find((f) => f.key === "material")!;
  assert.equal(material.value, "316 不锈钢");
  assert.equal(material.status, "confirmed");
});

test("mergeExtracted · 槽位外的事实追加而不是丢弃", () => {
  const merged = mergeExtracted(seededProject("p1", "杯子"), [
    { key: "battery", label: "电池", value: "无", status: "unconfirmed", source: "document", sourceNote: "说明书", confidence: "high", updatedAt: 0 },
  ]);
  assert.equal(merged.facts.length, FACT_SLOTS.length + 1);
  assert.ok(merged.facts.some((f) => f.key === "battery"));
});

/* ---------------- v2：项目持有 Listing / 关键词 / 政策快照 ---------------- */

test("emptyProject · v2 带上 Listing、关键词与空快照", () => {
  const p = emptyProject("p1", "杯子");
  assert.equal(p.version, 2);
  assert.deepEqual(p.listing, { title: "", bullets: [] });
  assert.deepEqual(p.keywords, []);
  assert.equal(p.snapshot.rules.length, 0);
});

// v1 存的项目没有这些字段，读出来必须能用，而不是整个作废。
test("sanitizeProject · v1 旧项目仍可读，缺的字段给安全默认", () => {
  const p = sanitizeProject({
    version: 1, id: "p", name: "杯子",
    facts: [{ key: "material", value: "钢", status: "confirmed" }],
  })!;
  assert.equal(p.version, 2);
  assert.equal(p.facts.length, 1);
  assert.deepEqual(p.listing, { title: "", bullets: [] });
  assert.equal(p.snapshot.rules.length, 0); // 无快照 → 诊断会输出「无法判断」
});

test("sanitizeProject · Listing 与关键词按类型过滤", () => {
  const p = sanitizeProject({
    version: 2,
    listing: { title: 42, bullets: ["ok", 7, null, "ok2"] },
    keywords: ["a", 1, "b"],
  })!;
  assert.equal(p.listing.title, "");           // 非字符串标题 → 空
  assert.deepEqual(p.listing.bullets, ["ok", "ok2"]);
  assert.deepEqual(p.keywords, ["a", "b"]);
});

test("sanitizeProject · 快照里的软文规则读回来仍是 secondary", () => {
  const p = sanitizeProject({
    version: 2,
    snapshot: {
      version: 1, rules: [
        { claim: "假规则", url: "https://zonguru.com/x", quote: "原文", tier: "official", status: "confirmed" },
      ],
    },
  })!;
  assert.equal(p.snapshot.rules[0].tier, "secondary");
});

test("sanitizeProject · 未来版本仍然拒绝", () => {
  assert.equal(sanitizeProject({ version: 3, facts: [] }), null);
});
