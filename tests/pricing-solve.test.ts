/**
 * 定价倒推的解析解。
 *
 * 「按目标倒推售价」有循环依赖:售价 → 佣金/广告(按售价百分比) → 净利 → 售价。
 * 用错近似会让用户按一个算错的价上架 —— 这是产品里最直接变成真金白银的一段。
 * 这里不重复实现公式,而是**反代验证**:把解出来的售价代回利润函数,看是否真的命中目标。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { priceCoefficients, simProfit, solvePrice } from "../lib/crossborder/pricing-sim";

const base = {
  cost: 8, domestic: 0.6, head: 2.4, lastMile: 4.2,
  commission: 15, refund: 2, ads: 12, blocks: [],
} as unknown as Parameters<typeof priceCoefficients>[0];

const coef = priceCoefficients({ ...base, fixedCost: 15.2 } as never);

test("保本价代回去,利润确实是 0", () => {
  const { price } = solvePrice(coef, { kind: "breakeven" });
  assert.ok(price !== null);
  assert.ok(Math.abs(simProfit(coef, price!)) < 1e-9, `保本价 ${price} 的利润不是 0`);
});

test("目标净利率:代回去的净利率就是目标值", () => {
  for (const m of [5, 10, 20, 35]) {
    const { price } = solvePrice(coef, { kind: "margin", value: m });
    assert.ok(price !== null, `${m}% 应有解`);
    const got = (simProfit(coef, price!) / price!) * 100;
    assert.ok(Math.abs(got - m) < 1e-9, `目标 ${m}% 实得 ${got}%`);
  }
});

test("目标单件利润:代回去分毫不差", () => {
  for (const t of [1, 3.5, 10]) {
    const { price } = solvePrice(coef, { kind: "unitProfit", value: t });
    assert.ok(Math.abs(simProfit(coef, price!) - t) < 1e-9);
  }
});

test("目标 ROI:利润 ÷ 自垫成本 命中目标", () => {
  for (const r of [10, 50, 120]) {
    const { price } = solvePrice(coef, { kind: "roi", value: r });
    const got = (simProfit(coef, price!) / coef.advanceCost) * 100;
    assert.ok(Math.abs(got - r) < 1e-9, `目标 ROI ${r}% 实得 ${got}%`);
  }
});

test("无解时给出人能读懂的原因,而不是返回一个假价格", () => {
  // 每元售价只留下 71%,目标净利率 80% 无解
  const r = solvePrice(coef, { kind: "margin", value: 80 });
  assert.equal(r.price, null);
  assert.match(r.reason || "", /无法倒推出正数售价/);

  // 按售价比例计的成本合计已达 100%
  const dead = priceCoefficients({ ...base, commission: 60, ads: 30, refund: 10, fixedCost: 10 } as never);
  const d = solvePrice(dead, { kind: "breakeven" });
  assert.equal(d.price, null);
  assert.match(d.reason || "", /100%/);
});

test("提高按售价计的费率,同一目标的售价必须上升(不能反向)", () => {
  const low = priceCoefficients({ ...base, commission: 10, fixedCost: 15.2 } as never);
  const high = priceCoefficients({ ...base, commission: 25, fixedCost: 15.2 } as never);
  const a = solvePrice(low, { kind: "margin", value: 20 }).price!;
  const b = solvePrice(high, { kind: "margin", value: 20 }).price!;
  assert.ok(b > a, `佣金从 10% 提到 25%,目标售价却从 ${a} 降到 ${b}`);
});

/* ---------------- 保本价必须认识成本积木 ---------------- */

test("加了成本积木后,保本价必须跟着上升", () => {
  const D = { price: 29.9, cost: 8, domestic: 0.6, head: 2.4, lastMile: 4.2,
              commission: 15, refund: 2, ads: 12 };
  const fixedCost = D.cost + D.domestic + D.head + D.lastMile;
  const bare = solvePrice(priceCoefficients({ ...D, fixedCost, blocks: [] } as never), { kind: "breakeven" }).price!;
  const withBlocks = solvePrice(priceCoefficients({
    ...D, fixedCost,
    blocks: [
      { id: "a", name: "月度仓储", kind: "cost", type: "monthly_alloc", params: { amount: 1200, units: 600 } },
      { id: "b", name: "优惠券", kind: "cost", type: "pct_sales", params: { pct: 5 } },
    ],
  } as never), { kind: "breakeven" }).price!;

  // calculateProfit 的保本价(不认识积木)约 21.41 —— 页面曾经显示的就是它
  assert.ok(withBlocks > bare, "加了成本却保本价没变,用户会照着一个偏低的价定价");
  assert.ok(withBlocks > 22.9 && withBlocks < 23.2, `含积木保本价 ${withBlocks},预期约 23.03`);
});

test("收入型积木会拉低保本价(方向不能反)", () => {
  const D = { price: 29.9, cost: 8, domestic: 0.6, head: 2.4, lastMile: 4.2,
              commission: 15, refund: 2, ads: 12 };
  const fixedCost = D.cost + D.domestic + D.head + D.lastMile;
  const bare = solvePrice(priceCoefficients({ ...D, fixedCost, blocks: [] } as never), { kind: "breakeven" }).price!;
  const withIncome = solvePrice(priceCoefficients({
    ...D, fixedCost,
    blocks: [{ id: "c", name: "赠品返利", kind: "income", type: "per_unit", params: { amount: 1 } }],
  } as never), { kind: "breakeven" }).price!;
  assert.ok(withIncome < bare, "多了一笔每件收入,保本价却没下降");
});

test("收入型积木超过固定成本时,高目标净利率仍有解", () => {
  // 固定成本 10、每件收入 20 → C 为负,利润率 = k + |C|/P 随售价下降而升高。
  // 原来先判 denom ≤ 0 就报「无解」,而实际存在正数解 —— 给的是错误答案。
  const coef = priceCoefficients({
    fixedCost: 10, commission: 15, ads: 12, refund: 2,
    blocks: [{ id: "i", name: "补贴", kind: "income", type: "per_unit", params: { amount: 20 } }],
  } as never);
  assert.ok(coef.fixedDrag < 0, "这个用例本该构造出负的 fixedDrag");
  const { price, reason } = solvePrice(coef, { kind: "margin", value: 90 });
  assert.ok(price !== null, `本有解却报无解:${reason}`);
  const got = (simProfit(coef, price!) / price!) * 100;
  assert.ok(Math.abs(got - 90) < 1e-9, `目标 90% 实得 ${got}%`);
});

test("固定成本为正时,超过 k 的目标仍应如实报无解", () => {
  const coef = priceCoefficients({ fixedCost: 15.2, commission: 15, ads: 12, refund: 2, blocks: [] } as never);
  const r = solvePrice(coef, { kind: "margin", value: 95 });
  assert.equal(r.price, null);
  assert.match(r.reason || "", /无法倒推出正数售价/);
});
