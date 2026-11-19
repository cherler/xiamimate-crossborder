import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFIT_VALUES } from "../lib/crossborder/calculators/profit.ts";
import { computeAdjusted, type CostBlock } from "../lib/crossborder/cost-model.ts";
import {
  priceCoefficients, simInputFromProfit, simProfit, solvePrice, scenarioAt,
  scenarioBand, priceScenarios, maxDiscount, type SimInput,
} from "../lib/crossborder/pricing-sim.ts";

const approx = (a: number, b: number, eps = 0.02) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const input = (over: Partial<SimInput> = {}): SimInput =>
  ({ fixedCost: 15.2, commission: 15, ads: 12, refund: 2, blocks: [], ...over });

const block = (over: Partial<CostBlock> = {}): CostBlock =>
  ({ id: "custom_cost-1-1", name: "自定义", kind: "cost", type: "per_unit", params: { amount: 1 }, ...over });

/* ---------------- 与利润页口径一致（最重要） ---------------- */

// 模拟器和利润页必须在同一售价上算出同一个利润，否则「按目标倒推的价」拿回利润页
// 就对不上。这条锁死线性系数推导与 computeAdjusted 的等价性。
test("口径一致 · simProfit = computeAdjusted 的调整后利润（无积木）", () => {
  const coef = priceCoefficients(simInputFromProfit(DEFAULT_PROFIT_VALUES, []));
  for (const price of [12, 29.9, 45, 80]) {
    const mine = simProfit(coef, price);
    const theirs = computeAdjusted({ ...DEFAULT_PROFIT_VALUES, price }, []).adjustedProfit;
    approx(mine, theirs);
  }
});

test("口径一致 · 六类积木混合时仍与 computeAdjusted 相等", () => {
  const blocks: CostBlock[] = [
    block({ id: "a-1-1", type: "per_unit", params: { amount: 0.3 } }),
    block({ id: "b-1-2", type: "per_order", params: { amount: 4, unitsPerOrder: 2 } }),
    block({ id: "c-1-3", type: "pct_sales", params: { pct: 5 } }),
    block({ id: "d-1-4", type: "monthly_alloc", params: { monthly: 1200, monthlyUnits: 600 } }),
    block({ id: "e-1-5", type: "batch_alloc", params: { total: 900, batchUnits: 300 } }),
    block({ id: "f-1-6", type: "probabilistic", params: { probPct: 5, lossPerEvent: 8 } }),
    block({ id: "g-1-7", type: "per_unit", kind: "income", params: { amount: 1.5 } }),
    block({ id: "h-1-8", type: "pct_sales", kind: "income", params: { pct: 2 } }),
  ];
  const coef = priceCoefficients(simInputFromProfit(DEFAULT_PROFIT_VALUES, blocks));
  for (const price of [20, 29.9, 60]) {
    const theirs = computeAdjusted({ ...DEFAULT_PROFIT_VALUES, price }, blocks).adjustedProfit;
    approx(simProfit(coef, price), theirs);
  }
});

/* ---------------- 系数推导 ---------------- */

test("priceCoefficients · pct 类进留存、其余进固定成本", () => {
  const c = priceCoefficients(input());
  approx(c.retention, 1 - 0.29); // 15 + 12 + 2 = 29%
  approx(c.fixedDrag, 15.2);
  approx(c.advanceCost, 15.2);

  const withPct = priceCoefficients(input({ blocks: [block({ type: "pct_sales", params: { pct: 5 } })] }));
  approx(withPct.retention, 1 - 0.34); // 再扣 5%
  approx(withPct.fixedDrag, 15.2);     // 不进固定成本

  const withUnit = priceCoefficients(input({ blocks: [block({ params: { amount: 2 } })] }));
  approx(withUnit.retention, 1 - 0.29);
  approx(withUnit.fixedDrag, 17.2);
  approx(withUnit.advanceCost, 17.2);
});

test("priceCoefficients · 收入类积木抵消固定成本，但不算自垫", () => {
  const c = priceCoefficients(input({ blocks: [block({ kind: "income", params: { amount: 3 } })] }));
  approx(c.fixedDrag, 12.2);    // 15.2 − 3
  approx(c.advanceCost, 15.2);  // 收入不是垫付的钱
});

/* ---------------- 倒推售价 ---------------- */

test("solvePrice · 保本价的利润为 0", () => {
  const coef = priceCoefficients(input());
  const { price } = solvePrice(coef, { kind: "breakeven" });
  approx(simProfit(coef, price!), 0);
});

test("solvePrice · 目标净利率解出的价确实达成该净利率", () => {
  const coef = priceCoefficients(input());
  const { price } = solvePrice(coef, { kind: "margin", value: 20 });
  approx(scenarioAt(coef, price!).margin, 20);
});

test("solvePrice · 目标单件利润与目标 ROI 各自达成", () => {
  const coef = priceCoefficients(input());
  const p1 = solvePrice(coef, { kind: "unitProfit", value: 6 }).price!;
  approx(simProfit(coef, p1), 6);
  const p2 = solvePrice(coef, { kind: "roi", value: 40 }).price!;
  approx(scenarioAt(coef, p2).roi!, 40);
});

test("solvePrice · 目标净利率 ≥ 留存比例时无解并说明原因", () => {
  const coef = priceCoefficients(input()); // 留存 71%
  const r = solvePrice(coef, { kind: "margin", value: 71 });
  assert.equal(r.price, null);
  assert.match(r.reason!, /71\.0%/);
});

test("solvePrice · 比例成本合计满 100% 时任何售价都无解", () => {
  const coef = priceCoefficients(input({ commission: 50, ads: 30, refund: 20 }));
  const r = solvePrice(coef, { kind: "breakeven" });
  assert.equal(r.price, null);
  assert.match(r.reason!, /留不下钱/);
});

test("solvePrice · 收入类模块盖过固定成本时不谎报售价", () => {
  const coef = priceCoefficients(input({ blocks: [block({ kind: "income", params: { amount: 20 } })] }));
  const r = solvePrice(coef, { kind: "breakeven" });
  assert.equal(r.price, null);
  assert.match(r.reason!, /都已盈利/);
});

/* ---------------- 情景与折扣 ---------------- */

test("scenarioAt · 最大广告占比恰好把利润打到 0", () => {
  const coef = priceCoefficients(input());
  const s = scenarioAt(coef, 40);
  // 把广告占比提到 maxAdShare，利润应归零
  const atMax = priceCoefficients(input({ ads: s.maxAdShare }));
  approx(simProfit(atMax, 40), 0);
});

test("scenarioBand · 围绕中心价对称展开", () => {
  const band = scenarioBand(100, 0.2, 5);
  assert.deepEqual(band, [80, 90, 100, 110, 120]);
  assert.deepEqual(scenarioBand(0), []);
});

test("priceScenarios · 售价越高利润越高（留存为正时）", () => {
  const coef = priceCoefficients(input());
  const rows = priceScenarios(coef, scenarioBand(30));
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].profit > rows[i - 1].profit);
});

test("maxDiscount · 折扣空间 = 挂牌价到保本价的距离", () => {
  const coef = priceCoefficients(input());
  const be = solvePrice(coef, { kind: "breakeven" }).price!;
  const d = maxDiscount(coef, 40);
  approx(d.breakevenPrice!, be);
  approx(d.discountPct!, (1 - be / 40) * 100);
  // 挂牌价已低于保本价 → 没有折扣空间，而不是负数
  assert.equal(maxDiscount(coef, 5).discountPct, 0);
});
