import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateDimWeight } from "../lib/crossborder/calculators/dimensional-weight.ts";
import {
  CARRIER_RULES, ruleByKey, billsBySizeTier, chargeableWeight, comparePacking,
  detectPackIssues, type CarrierRule,
} from "../lib/crossborder/dim-weight-rules.ts";

const approx = (a: number, b: number, eps = 0.001) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const rule = (over: Partial<CarrierRule> = {}): CarrierRule => ({
  key: "custom", name: "自定义", region: "—",
  divisor: 5000, dimRound: "none", weightStep: 0, minChargeable: 0,
  note: "", source: "", updated: "—", ...over,
});

const box = { length: 30, width: 20, height: 15, actual: 1.2 };

/* ---------------- 与既有体积重引擎一致 ---------------- */

// 无取整、无进位、无最低计费重时，必须退化成原来的「取大者」。
test("口径一致 · 规则为空时等同 calculateDimWeight", () => {
  const r = chargeableWeight(box, rule());
  const old = calculateDimWeight({ ...box, divisor: 5000 });
  approx(r.volumetric, old.volumetric);
  approx(r.chargeable, old.chargeable);
  assert.equal(r.useVolumetric, old.useVolumetric);
});

/* ---------------- 三步机制 ---------------- */

test("chargeableWeight · 体积重 = 取整后尺寸乘积 ÷ 除数", () => {
  const r = chargeableWeight(box, rule());
  approx(r.volumetric, 30 * 20 * 15 / 5000); // 1.8
  assert.equal(r.useVolumetric, true);       // 1.8 > 1.2
  approx(r.chargeable, 1.8);
});

test("chargeableWeight · 尺寸取整会改变体积重", () => {
  const odd = { length: 30.4, width: 20.6, height: 15.5, actual: 1 };
  approx(chargeableWeight(odd, rule({ dimRound: "none" })).volumetric, 30.4 * 20.6 * 15.5 / 5000);
  // nearest：30 × 21 × 16
  approx(chargeableWeight(odd, rule({ dimRound: "nearest" })).volumetric, 30 * 21 * 16 / 5000);
  // up：31 × 21 × 16
  approx(chargeableWeight(odd, rule({ dimRound: "up" })).volumetric, 31 * 21 * 16 / 5000);
});

test("chargeableWeight · 0.5kg 进位并如实报出多算了多少", () => {
  const r = chargeableWeight(box, rule({ weightStep: 0.5 }));
  approx(r.rawChargeable, 1.8);
  approx(r.chargeable, 2.0);
  approx(r.bumpedByStep, 0.2);
  approx(r.bumpedByMin, 0);
});

test("chargeableWeight · 恰好落在进位点上不多进一档", () => {
  const r = chargeableWeight({ length: 50, width: 20, height: 25, actual: 1 }, rule({ weightStep: 0.5 }));
  approx(r.rawChargeable, 5); // 50×20×25/5000
  approx(r.chargeable, 5);
  approx(r.bumpedByStep, 0);
});

test("chargeableWeight · 最低计费重兜底并单独归因", () => {
  const tiny = { length: 5, width: 5, height: 5, actual: 0.05 };
  const r = chargeableWeight(tiny, rule({ weightStep: 0.5, minChargeable: 0.5 }));
  approx(r.rawChargeable, 0.05);
  approx(r.chargeable, 0.5);
  approx(r.bumpedByStep, 0.45); // 0.05 → 0.5
  approx(r.bumpedByMin, 0);     // 进位后已达最低值
});

test("chargeableWeight · 进位与最低值分别归因，不重复计算", () => {
  const r = chargeableWeight({ length: 5, width: 5, height: 5, actual: 0.05 }, rule({ minChargeable: 2 }));
  approx(r.bumpedByStep, 0); // 无进位
  approx(r.bumpedByMin, 1.95);
  approx(r.chargeable, 2);
});

test("chargeableWeight · 除数为 0 不产生 Infinity", () => {
  const r = chargeableWeight(box, rule({ divisor: 0 }));
  approx(r.volumetric, 0);
  approx(r.chargeable, 1.2); // 退回实重
});

/* ---------------- 包装 A/B 对比 ---------------- */

test("comparePacking · 降高度省下的计费重与运费", () => {
  const a = { length: 30, width: 20, height: 18, actual: 1.2 }; // 体积重 2.16
  const b = { length: 30, width: 20, height: 14, actual: 1.2 }; // 体积重 1.68
  const c = comparePacking(a, b, rule(), 5, 1000);
  approx(c.a.chargeable, 2.16);
  approx(c.b.chargeable, 1.68);
  approx(c.savedKg, 0.48);
  approx(c.savedPerUnit!, 2.4);      // 0.48 × $5
  approx(c.savedPerMonth!, 2400);    // × 1000 箱
});

test("comparePacking · 没给费率时不编造省了多少钱", () => {
  const c = comparePacking(box, { ...box, height: 10 }, rule());
  assert.ok(c.savedKg > 0);
  assert.equal(c.savedPerUnit, null);
  assert.equal(c.savedPerMonth, null);
});

// FBA 按档位收费，省下的 kg 不能线性折算成钱 —— 这正是「精确的错误」的高发地。
test("comparePacking · FBA 口径下拒绝把省下的重量乘费率", () => {
  const c = comparePacking(box, { ...box, height: 10 }, ruleByKey("fba_us"), 5, 1000);
  assert.ok(c.savedKg > 0);
  assert.equal(c.savedPerUnit, null);
  assert.equal(c.savedPerMonth, null);
});

/* ---------------- 规则表与提醒 ---------------- */

test("ruleByKey · 未知 key 回退到自定义而不是崩", () => {
  assert.equal(ruleByKey("nope").key, "custom");
  assert.equal(ruleByKey("air_6000").divisor, 6000);
});

test("规则表 · 每条都带来源与录入时间（不能假装是实时资费）", () => {
  for (const r of CARRIER_RULES) {
    assert.ok(r.source.length > 0, `${r.key} 缺 source`);
    assert.ok(r.updated.length > 0, `${r.key} 缺 updated`);
    assert.ok(r.divisor >= 0);
  }
  assert.ok(CARRIER_RULES.some((r) => r.key === "custom"));
});

test("billsBySizeTier · 只有 FBA 是分档计费", () => {
  assert.equal(billsBySizeTier({ key: "fba_us" }), true);
  assert.equal(billsBySizeTier({ key: "fba_eu" }), true);
  assert.equal(billsBySizeTier({ key: "express_5000" }), false);
});

test("detectPackIssues · FBA 必须警告分档计费", () => {
  const fba = ruleByKey("fba_us");
  const ids = detectPackIssues(fba, chargeableWeight(box, fba), null).map((w) => w.id);
  assert.ok(ids.includes("size-tier"));
});

test("detectPackIssues · 进位/最低值各自解释，压缩包装提示破损风险", () => {
  const r = rule({ weightStep: 0.5, minChargeable: 0.5 });
  const stepIds = detectPackIssues(r, chargeableWeight(box, r), null).map((w) => w.id);
  assert.ok(stepIds.includes("step-bump"));

  const minIds = detectPackIssues(r, chargeableWeight({ length: 5, width: 5, height: 5, actual: 0.05 }, rule({ minChargeable: 2 })), null)
    .map((w) => w.id);
  assert.ok(minIds.includes("min-bump"));

  const cmp = comparePacking(box, { ...box, height: 10 }, rule());
  const cmpIds = detectPackIssues(rule(), chargeableWeight(box, rule()), cmp).map((w) => w.id);
  assert.ok(cmpIds.includes("compression-risk"));
});

/* ---------------- 单位混用防护 ---------------- */

test("像英寸的一组数配美国承运商 → 提醒单位", async () => {
  const { detectPackIssues, chargeableWeight, ruleByKey } = await import("../lib/crossborder/dim-weight-rules");
  const fba = ruleByKey("fba_us");
  // 亚马逊后台常见口径:12 × 8 × 6 in,1.5 lb —— 被当成 cm/kg 填进来
  const pack = { length: 12, width: 8, height: 6, actual: 1.5 };
  const r = chargeableWeight(pack, fba);
  const issues = detectPackIssues(fba, r, null, pack);
  assert.ok(issues.some((i) => i.id === "unit-suspect"), "没有提醒单位,用户会低估约 25%");
});

test("正常公制包裹不误报", async () => {
  const { detectPackIssues, chargeableWeight, ruleByKey } = await import("../lib/crossborder/dim-weight-rules");
  const fba = ruleByKey("fba_us");
  const pack = { length: 30.5, width: 20.3, height: 15.2, actual: 0.68 };
  const r = chargeableWeight(pack, fba);
  assert.ok(!detectPackIssues(fba, r, null, pack).some((i) => i.id === "unit-suspect"));
});

test("非美国承运商不做这个判断", async () => {
  const { detectPackIssues, chargeableWeight, ruleByKey } = await import("../lib/crossborder/dim-weight-rules");
  const exp = ruleByKey("express_5000");
  const pack = { length: 12, width: 8, height: 6, actual: 1.5 };
  const r = chargeableWeight(pack, exp);
  assert.ok(!detectPackIssues(exp, r, null, pack).some((i) => i.id === "unit-suspect"));
});

test("英寸换算成公制后计费重确实差 25%", async () => {
  const { chargeableWeight, ruleByKey } = await import("../lib/crossborder/dim-weight-rules");
  const fba = ruleByKey("fba_us");
  const asCm = chargeableWeight({ length: 12, width: 8, height: 6, actual: 1.5 }, fba).chargeable;
  const real = chargeableWeight({ length: 12 * 2.54, width: 8 * 2.54, height: 6 * 2.54, actual: 1.5 * 0.45359237 }, fba).chargeable;
  assert.ok(real > asCm, "换算后反而更小,方向错了");
  assert.ok((real - asCm) / real > 0.2, `低估比例只有 ${((real - asCm) / real * 100).toFixed(0)}%`);
});
