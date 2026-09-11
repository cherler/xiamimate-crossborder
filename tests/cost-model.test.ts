import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFIT_VALUES } from "../lib/crossborder/calculators/profit.ts";
import {
  blockPerUnit, computeAdjusted, blockFromPreset, detectConflicts, COST_PRESETS,
  type CostBlock,
} from "../lib/crossborder/cost-model.ts";

const approx = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

const block = (type: CostBlock["type"], params: Record<string, number>, kind: CostBlock["kind"] = "cost"): CostBlock =>
  ({ id: "t", name: "t", kind, type, params });

/* ---------------- 各积木类型折算 ---------------- */

test("per_unit → 直接每件金额", () => {
  approx(blockPerUnit(block("per_unit", { amount: 0.5 }), { price: 29.9 }), 0.5);
});

test("per_order → 每单金额 ÷ 每单件数；件数为 0 归零", () => {
  approx(blockPerUnit(block("per_order", { amount: 1, unitsPerOrder: 2 }), { price: 29.9 }), 0.5);
  approx(blockPerUnit(block("per_order", { amount: 1, unitsPerOrder: 0 }), { price: 29.9 }), 0);
});

test("pct_sales → 售价百分比；售价为 0 归零", () => {
  approx(blockPerUnit(block("pct_sales", { pct: 15 }), { price: 29.9 }), 4.485);
  approx(blockPerUnit(block("pct_sales", { pct: 15 }), { price: 0 }), 0);
});

test("monthly_alloc → 月度总费用 ÷ 预计月销量；销量为 0 归零", () => {
  approx(blockPerUnit(block("monthly_alloc", { monthly: 1200, monthlyUnits: 600 }), { price: 29.9 }), 2);
  approx(blockPerUnit(block("monthly_alloc", { monthly: 1200, monthlyUnits: 0 }), { price: 29.9 }), 0);
});

test("batch_alloc → 总投入 ÷ 分摊件数", () => {
  approx(blockPerUnit(block("batch_alloc", { total: 3000, batchUnits: 1000 }), { price: 29.9 }), 3);
});

test("probabilistic → 概率 × 单次损失", () => {
  approx(blockPerUnit(block("probabilistic", { probPct: 5, lossPerEvent: 8 }), { price: 29.9 }), 0.4);
});

test("非法输入(NaN) 归零，不抛错", () => {
  approx(blockPerUnit(block("per_unit", { amount: NaN }), { price: 29.9 }), 0);
});

/* ---------------- 叠加计算 ---------------- */

test("computeAdjusted · 标准层与 calculateProfit 一致", () => {
  const r = computeAdjusted(DEFAULT_PROFIT_VALUES, []);
  assert.equal(r.standard.profit, 6.02);
  assert.equal(r.adjustedProfit, 6.02);       // 无积木 → 不变
  assert.equal(r.netDelta, 0);
  assert.equal(r.impacts.length, 0);
});

test("computeAdjusted · 成本为负、收入为正、正确叠加", () => {
  const blocks: CostBlock[] = [
    block("probabilistic", { probPct: 5, lossPerEvent: 8 }),           // -0.40
    block("per_unit", { amount: 1 }, "income"),                        // +1.00
  ];
  const r = computeAdjusted(DEFAULT_PROFIT_VALUES, blocks);
  assert.equal(r.impacts[0].amount, -0.4);
  assert.equal(r.impacts[1].amount, 1);
  approx(r.netDelta, 0.6);
  approx(r.adjustedProfit, 6.63);
  approx(r.adjustedMargin, 22.2, 0.1);
});

test("computeAdjusted · 无效基础参数仍抛错（标准层守卫）", () => {
  assert.throws(() => computeAdjusted({ ...DEFAULT_PROFIT_VALUES, price: 0 }, []), /售价需要大于 0/);
});

/* ---------------- 预设 ---------------- */

test("预设生成积木：字段与类型正确、id 唯一", () => {
  const storage = COST_PRESETS.find((p) => p.key === "monthly_storage")!;
  const b1 = blockFromPreset(storage);
  const b2 = blockFromPreset(storage);
  assert.equal(b1.type, "monthly_alloc");
  assert.equal(b1.name, "月度仓储费");
  assert.notEqual(b1.id, b2.id);
  approx(blockPerUnit(b1, { price: 29.9 }), 2);
});

/* ---------------- 重复计费提醒 ---------------- */

const fromKey = (key: string): CostBlock => {
  const preset = COST_PRESETS.find((p) => p.key === key)!;
  return blockFromPreset(preset);
};

test("detectConflicts · 异常退货 + 退款损耗>0 → 提醒", () => {
  const w = detectConflicts([fromKey("abnormal_return")], { refund: 2 });
  assert.equal(w.length, 1);
  assert.equal(w[0].level, "warn");
});

test("detectConflicts · 退款损耗=0 → 不提醒", () => {
  assert.equal(detectConflicts([fromKey("abnormal_return")], { refund: 0 }).length, 0);
});

test("detectConflicts · 月度 + 长期仓储 → info", () => {
  const w = detectConflicts([fromKey("monthly_storage"), fromKey("long_term_storage")], { refund: 0 });
  assert.ok(w.some((x) => x.id === "storage-overlap" && x.level === "info"));
});

test("detectConflicts · 同名模块 → 提醒", () => {
  const a = fromKey("custom_cost");
  const b = { ...fromKey("custom_cost"), name: a.name };
  const w = detectConflicts([a, b], { refund: 0 });
  assert.ok(w.some((x) => x.id.startsWith("dup-")));
});

test("detectConflicts · 无冲突 → 空", () => {
  assert.equal(detectConflicts([fromKey("fx_loss")], { refund: 0 }).length, 0);
});

test("预设库含「本次尚未计入」的 5 项 + 自定义", () => {
  const keys = COST_PRESETS.map((p) => p.key);
  for (const k of ["monthly_storage", "coupon_promo", "fx_loss", "long_term_storage", "abnormal_return", "custom_cost", "custom_income"]) {
    assert.ok(keys.includes(k), `缺少预设 ${k}`);
  }
});
