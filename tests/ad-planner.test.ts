import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateAcos, type AcosInput } from "../lib/crossborder/calculators/acos.ts";
import {
  adMetrics, planAds, cpcScenarios, cpcBand, detectAdIssues, type AdActuals,
} from "../lib/crossborder/ad-planner.ts";

const approx = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const product = (over: Partial<AcosInput> = {}): AcosInput =>
  ({ price: 29.9, cost: 14.2, commission: 15, margin: 15, ...over });

// CPC 0.6 / CVR 8% / ACoS 25% / 客单价 $30
const actuals = (over: Partial<AdActuals> = {}): AdActuals =>
  ({ spend: 300, adSales: 1200, clicks: 500, orders: 40, ...over });

/* ---------------- 实测指标 ---------------- */

test("adMetrics · 由后台四个数推出 CPC / CVR / ACoS / 客单价", () => {
  const m = adMetrics(actuals());
  approx(m.cpc!, 0.6);
  approx(m.cvr!, 8);
  approx(m.acos!, 25);
  approx(m.adCostPerOrder!, 7.5);
  approx(m.avgOrderValue!, 30);
});

test("adMetrics · 分母为 0 时返回 null 而不是 Infinity/NaN", () => {
  const m = adMetrics({ spend: 100, adSales: 0, clicks: 0, orders: 0 });
  assert.equal(m.cpc, null);
  assert.equal(m.cvr, null);
  assert.equal(m.acos, null);
  assert.equal(m.avgOrderValue, null);
});

/* ---------------- 与 ACoS 工具口径一致（最重要） ---------------- */

// 红线必须直接来自 calculateAcos。同一商品在 ACoS 页、利润页广告卡片、
// 这里，必须是同一组数字，否则用户会拿到三个互相矛盾的保本线。
test("口径一致 · 红线原样取自 calculateAcos", () => {
  const p = planAds(product(), actuals(), 60);
  assert.deepEqual(p.acos, calculateAcos(product()));
});

/* ---------------- CPC 上限 ---------------- */

test("planAds · 保本 CPC = 单件毛利 × CVR", () => {
  const p = planAds(product(), actuals(), 60);
  // 毛利 = 29.9 − 14.2 − 4.485 = 11.215；× 8% = 0.8972
  approx(p.maxCpc!, 11.215 * 0.08);
  // 目标预算 = 11.215 − 29.9×15% = 6.73；× 8% = 0.5384
  approx(p.targetCpc!, 6.73 * 0.08);
});

// CPC 上限的定义就是「出到这个价刚好保本」，反向代入必须归零。
test("planAds · 出价到保本 CPC 时每单利润恰好为 0", () => {
  const p = planAds(product(), actuals(), 60);
  const [s] = cpcScenarios(product(), 8, [p.maxCpc!]);
  approx(s.profitPerOrder, 0);
});

test("planAds · 出价到目标 CPC 时净利率恰好达标", () => {
  const p = planAds(product(), actuals(), 60);
  const [s] = cpcScenarios(product(), 8, [p.targetCpc!]);
  approx(s.profitPerOrder / product().price * 100, 15);
});

test("planAds · 目标不可行时不给目标 CPC", () => {
  const p = planAds(product({ margin: 90 }), actuals(), 60);
  assert.equal(p.acos.targetFeasible, false);
  assert.equal(p.targetCpc, null);
});

test("planAds · 无点击数据时 CPC 上限为 null 而非 0", () => {
  const p = planAds(product(), actuals({ clicks: 0, orders: 0 }), 60);
  assert.equal(p.maxCpc, null);
  assert.equal(p.targetCpc, null);
});

/* ---------------- TACoS ---------------- */

// TACoS 的分母是总销售额，正是利润计算器「广告成本 %」的口径。
test("planAds · TACoS = 实测 ACoS × 广告销售占比", () => {
  approx(planAds(product(), actuals(), 60).tacos!, 15);   // 25% × 60%
  approx(planAds(product(), actuals(), 100).tacos!, 25);  // 全部销量来自广告 → TACoS = ACoS
});

/* ---------------- 情景表 ---------------- */

test("cpcScenarios · 每单广告费 = CPC ÷ CVR，CPC 越高利润越低", () => {
  const rows = cpcScenarios(product(), 8, [0.4, 0.6, 0.8]);
  approx(rows[1].adCostPerOrder, 7.5); // 0.6 ÷ 8%
  approx(rows[1].acos, 7.5 / 29.9 * 100);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].profitPerOrder < rows[i - 1].profitPerOrder);
});

test("cpcBand · 围绕实测 CPC 对称展开", () => {
  assert.deepEqual(cpcBand(1, 0.4, 5), [0.6, 0.8, 1, 1.2, 1.4]);
  assert.deepEqual(cpcBand(0), []);
});

/* ---------------- 口径体检 ---------------- */

test("detectAdIssues · 归因客单价与售价不符时警告多件订单", () => {
  // 客单价 = 2400/40 = $60 ≈ 售价两倍
  const a = actuals({ adSales: 2400 });
  const w = detectAdIssues(product(), a, planAds(product(), a, 60));
  const hit = w.find((x) => x.id === "aov-mismatch");
  assert.ok(hit);
  assert.match(hit.text, /多件订单/);
});

test("detectAdIssues · 客单价与售价一致时不误报", () => {
  const w = detectAdIssues(product(), actuals(), planAds(product(), actuals(), 60));
  assert.equal(w.find((x) => x.id === "aov-mismatch"), undefined);
});

test("detectAdIssues · 实测 ACoS 超过保本线要警告，但不下「关广告」结论", () => {
  const a = actuals({ spend: 600 }); // ACoS 50% > 保本 37.5%
  const w = detectAdIssues(product(), a, planAds(product(), a, 60));
  const hit = w.find((x) => x.id === "over-breakeven");
  assert.ok(hit);
  assert.match(hit.text, /不等于该关广告/);
});

test("detectAdIssues · 有点击无转化 / 小样本给出提示", () => {
  const a = actuals({ clicks: 50, orders: 0, adSales: 0 });
  const ids = detectAdIssues(product(), a, planAds(product(), a, 60)).map((w) => w.id);
  assert.ok(ids.includes("no-conversion"));
  assert.ok(ids.includes("small-sample"));
});
