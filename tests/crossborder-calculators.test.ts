import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calculateProfit, DEFAULT_PROFIT_VALUES, type ProfitValues,
} from "../lib/crossborder/calculators/profit.ts";
import { calculateAcos } from "../lib/crossborder/calculators/acos.ts";
import { calculateDimWeight } from "../lib/crossborder/calculators/dimensional-weight.ts";
import { calculateLanded } from "../lib/crossborder/calculators/landed-cost.ts";
import { processKeywords } from "../lib/crossborder/calculators/keyword.ts";

const approx = (actual: number, expected: number, eps = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${actual} ≈ ${expected}`);

/* ---------------- profit ---------------- */

test("profit · 正常值 (默认参数)", () => {
  const r = calculateProfit(DEFAULT_PROFIT_VALUES);
  // 6.02 而非 6.03:利润取自「看得见的总成本」(分项取整后求和),
  // 换来的是分项、合计、利润三者在页面与导出 CSV 里完全闭合 —— 见下一条。
  assert.equal(r.profit, 6.02);
  assert.equal(r.margin, 20.2);
  assert.equal(r.breakeven, 21.41);
  assert.equal(r.risk, "可接受");
});

test("profit · 分项、合计、利润必须闭合", () => {
  // 原来每项各自从未取整值 round2、合计也独立 round2:
  // 15.20 + 4.49 + 3.59 + 0.60 = 23.88,而总成本印 23.87。
  // 这 $0.01 会随导出的损益单 CSV 进用户表格,他一列求和就发现对不上,
  // 然后开始怀疑整张表。数字对不上账,比数字不好看严重得多。
  for (const v of [
    DEFAULT_PROFIT_VALUES,
    { ...DEFAULT_PROFIT_VALUES, price: 19.99, commission: 8.5, ads: 7.3, refund: 1.7 },
    { ...DEFAULT_PROFIT_VALUES, price: 7.77, cost: 1.11, domestic: 0.33, head: 0.77, lastMile: 1.23 },
  ]) {
    const r = calculateProfit(v);
    const sum = r.fixedCost + r.commissionCost + r.adCost + r.refundLoss;
    assert.ok(Math.abs(sum - r.totalCost) < 1e-9, `分项和 ${sum} ≠ 总成本 ${r.totalCost}`);
    assert.ok(Math.abs((v.price - r.totalCost) - r.profit) < 1e-9,
      `售价 ${v.price} − 总成本 ${r.totalCost} ≠ 利润 ${r.profit}`);
  }
});

test("profit · 零售价抛错", () => {
  assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, price: 0 }), /售价需要大于 0/);
});

test("profit · 负数采购成本抛错", () => {
  assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, cost: -1 }), /采购成本不能为负数/);
});

test("profit · 费率合计超过 100% 抛错", () => {
  assert.throws(
    () => calculateProfit({ ...DEFAULT_PROFIT_VALUES, commission: 60, refund: 30, ads: 20 }),
    /合计需要小于 100%/,
  );
});

test("profit · 缺少必填参数 (NaN 售价) 抛错", () => {
  assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, price: NaN }), /售价需要大于 0/);
});

test("profit · 极端广告比例导致亏损", () => {
  const r = calculateProfit({ ...DEFAULT_PROFIT_VALUES, ads: 80 });
  assert.ok(r.profit < 0, "利润应为负");
  assert.equal(r.risk, "亏损");
});

test("profit · 唯一实现且确定性 (前端与服务端结果一致)", () => {
  // 所有入口只 import 这一个 calculateProfit（crossborder-tools 仅再导出，
  // 由 tsc 与运行时保证），同一输入必然得到同一结果。
  const input: ProfitValues = { ...DEFAULT_PROFIT_VALUES, price: 42, ads: 18 };
  assert.deepEqual(calculateProfit(input), calculateProfit(input));
});

/* ---------------- acos ---------------- */

test("acos · 正常值", () => {
  const r = calculateAcos({ price: 29.9, cost: 14.2, commission: 15, margin: 15 });
  approx(r.breakevenAcos, 37.5, 0.1);
  approx(r.targetAcos, 22.5, 0.1);
  assert.equal(r.targetFeasible, true);
});

test("acos · 零售价 → 归零", () => {
  const r = calculateAcos({ price: 0, cost: 5, commission: 15, margin: 15 });
  assert.equal(r.breakevenAcos, 0);
  assert.equal(r.targetAcos, 0);
});

test("acos · 目标净利过高 → 不可行", () => {
  const r = calculateAcos({ price: 29.9, cost: 14.2, commission: 15, margin: 90 });
  assert.equal(r.targetFeasible, false);
});

/* ---------------- dimensional weight ---------------- */

test("dimweight · 抛货 (体积重 > 实重)", () => {
  const r = calculateDimWeight({ length: 30, width: 20, height: 15, actual: 1.2, divisor: 5000 });
  approx(r.volumetric, 1.8);
  approx(r.chargeable, 1.8);
  assert.equal(r.useVolumetric, true);
});

test("dimweight · 重货 (实重 > 体积重)", () => {
  const r = calculateDimWeight({ length: 30, width: 20, height: 15, actual: 5, divisor: 5000 });
  assert.equal(r.chargeable, 5);
  assert.equal(r.useVolumetric, false);
});

test("dimweight · 除数为 0 → 体积重 0", () => {
  const r = calculateDimWeight({ length: 30, width: 20, height: 15, actual: 1.2, divisor: 0 });
  assert.equal(r.volumetric, 0);
  assert.equal(r.chargeable, 1.2);
});

/* ---------------- landed cost ---------------- */

test("landed · 正常值", () => {
  const r = calculateLanded({ cost: 50, head: 8, fx: 0.14, duty: 5, vat: 20, margin: 30 });
  approx(r.cif, 8.12);
  approx(r.dutyAmount, 0.406);
  approx(r.vatAmount, 1.7052);
  approx(r.landed, 10.2312);
  approx(r.suggestedPrice!, 14.616);
});

test("landed · 目标净利 ≥ 100% → 无建议售价", () => {
  const r = calculateLanded({ cost: 50, head: 8, fx: 0.14, duty: 5, vat: 20, margin: 100 });
  assert.equal(r.suggestedPrice, null);
});

/* ---------------- keyword ---------------- */

test("keyword · 忽略大小写与多余空格去重，保留首次写法", () => {
  const r = processKeywords("stainless steel water bottle\nWater Bottle\nsports water bottle\nwater bottle\nStainless Steel Water Bottle, insulated water bottle");
  assert.equal(r.rawCount, 6);
  assert.equal(r.unique.length, 4);
  assert.equal(r.removed, 2);
  assert.equal(r.unique[1], "Water Bottle"); // 首次写法，不是后面的 water bottle
});

test("keyword · 空输入 → 无结果", () => {
  const r = processKeywords("   \n  ");
  assert.equal(r.rawCount, 0);
  assert.equal(r.unique.length, 0);
});

// 扩词已移除：拼接写死的修饰语没有搜索量依据，且只用首词做词根、静默丢弃其余关键词。
test("keyword · 不再产出无数据支撑的扩词", () => {
  const r = processKeywords("water bottle") as Record<string, unknown>;
  assert.equal("expanded" in r, false);
});

/* ---------------- 输入校验:坏数不能拿到最乐观的评级 ---------------- */

test("负数与 NaN 输入必须被拦下", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  // 一个负号曾让利润从 6.03 变成 16.63(翻 2.8 倍)且评级「较优」
  for (const [k, v] of [["domestic", -10], ["head", -1], ["lastMile", -0.5], ["commission", -5]] as const) {
    assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, [k]: v }), /不能为负数/, `${k}=${v} 未被拦下`);
  }
  // NaN 曾一路穿到 else 分支拿到「较优」—— 所有 NaN < x 比较都是 false
  for (const k of ["domestic", "head", "lastMile", "commission", "refund", "ads"] as const) {
    assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, [k]: NaN }), /需要是一个数字/, `${k}=NaN 未被拦下`);
    assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, [k]: Infinity }), /需要是一个数字/);
  }
  // 正常输入不受影响
  assert.equal(calculateProfit(DEFAULT_PROFIT_VALUES).profit, 6.02);
});

/* ---------------- ACoS 必须含退款损耗 ---------------- */

test("保本 ACoS 含退款损耗,与利润计算器同口径", async () => {
  const { calculateAcos } = await import("../lib/crossborder/calculators/acos");
  const base = { price: 29.9, cost: 15.2, commission: 15, margin: 20 };
  const noRefund = calculateAcos(base);
  const withRefund = calculateAcos({ ...base, refund: 2 });
  // 差额必须恰好等于退款率 —— 这正是此前那 2 个点的缺口
  assert.ok(Math.abs((noRefund.breakevenAcos - withRefund.breakevenAcos) - 2) < 1e-9,
    `差额 ${noRefund.breakevenAcos - withRefund.breakevenAcos},应为 2 个点`);
  assert.ok(Math.abs(withRefund.breakevenAcos - 32.1571) < 0.01, `保本 ACoS ${withRefund.breakevenAcos}`);
  // 不传 refund 时行为与过去一致(老调用方不受影响)
  assert.equal(calculateAcos(base).breakevenAcos, calculateAcos({ ...base, refund: 0 }).breakevenAcos);
});

test("退款率越高,可承受的广告费越少(方向不能反)", async () => {
  const { calculateAcos } = await import("../lib/crossborder/calculators/acos");
  const base = { price: 29.9, cost: 15.2, commission: 15, margin: 20 };
  const budgets = [0, 2, 5, 10].map((refund) => calculateAcos({ ...base, refund }).targetAdBudget);
  for (let i = 1; i < budgets.length; i += 1) {
    assert.ok(budgets[i] < budgets[i - 1], "退款率提高,可承受广告费却没下降");
  }
});

test("悲观档只有一份定义,两个页面共用", async () => {
  const { worstCase, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  const w = worstCase(DEFAULT_PROFIT_VALUES);
  // 售价 −7% · 广告 +3pt · 退款 +1pt
  assert.ok(Math.abs(w.price - DEFAULT_PROFIT_VALUES.price * 0.93) < 1e-9);
  assert.equal(w.ads, DEFAULT_PROFIT_VALUES.ads + 3);
  assert.equal(w.refund, DEFAULT_PROFIT_VALUES.refund + 1);
  // 不改动入参(纯函数)
  assert.equal(DEFAULT_PROFIT_VALUES.ads, 12);
});

/* ---------------- 销项 VAT(欧盟/英国含税标价) ---------------- */

test("vatRate 默认 0 时行为与过去完全一致", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  const a = calculateProfit(DEFAULT_PROFIT_VALUES);
  const b = calculateProfit({ ...DEFAULT_PROFIT_VALUES, vatRate: 0 });
  assert.deepEqual(a, b);
  assert.equal(a.netRevenue, DEFAULT_PROFIT_VALUES.price, "无税时实收应等于售价");
  assert.equal(a.vatAmount, 0);
});

test("含税标价:代收的税不算自己的销售额", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  const uk = { ...DEFAULT_PROFIT_VALUES, price: 29.9, cost: 10, domestic: 0, head: 0, lastMile: 5, vatRate: 20 };
  const r = calculateProfit(uk);
  assert.ok(Math.abs(r.netRevenue - 29.9 / 1.2) < 0.01, `实收 ${r.netRevenue}`);
  assert.ok(Math.abs(r.vatAmount - 4.98) < 0.01);
  // 不计 VAT 时利润 6.22 —— 高估 5 倍
  const naive = calculateProfit({ ...uk, vatRate: 0 });
  assert.ok(naive.profit / r.profit > 4.5, `高估倍数只有 ${(naive.profit / r.profit).toFixed(1)}`);
});

test("两个引擎在含税口径下给出同一个保本价", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  const { priceCoefficients, simInputFromProfit, solvePrice, simProfit } =
    await import("../lib/crossborder/pricing-sim");
  for (const vatRate of [0, 20, 19, 7]) {
    const v = { ...DEFAULT_PROFIT_VALUES, vatRate };
    const fromProfit = calculateProfit(v).breakeven;
    const coef = priceCoefficients(simInputFromProfit(v, []));
    const fromSim = solvePrice(coef, { kind: "breakeven" }).price!;
    assert.ok(Math.abs(fromProfit - fromSim) < 0.01,
      `vat=${vatRate}: 利润引擎 ${fromProfit} vs 定价引擎 ${fromSim}`);
    assert.ok(Math.abs(simProfit(coef, fromSim)) < 1e-9, "保本价代回去利润不为 0");
  }
});

test("税率越高,保本价越高(方向不能反)", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  const bes = [0, 7, 19, 20, 25].map((vatRate) =>
    calculateProfit({ ...DEFAULT_PROFIT_VALUES, vatRate }).breakeven);
  for (let i = 1; i < bes.length; i += 1) assert.ok(bes[i] > bes[i - 1]);
});

test("站点含税却填 0 税率 → 必须告警并说明高估幅度", async () => {
  const { detectVatIssues } = await import("../lib/crossborder/cost-model");
  const v = { price: 29.9, vatRate: 0 };
  for (const mk of ["amazon-uk", "amazon-de", "amazon-fr", "tiktok-uk"]) {
    const w = detectVatIssues(mk, v);
    assert.equal(w.length, 1, `${mk} 没有告警`);
    assert.match(w[0].text, /4\.98/, "没有把高估幅度算给用户看");
  }
  // 美国不涉及销项税,不该打扰
  assert.deepEqual(detectVatIssues("amazon-us", v), []);
  assert.deepEqual(detectVatIssues("tiktok-us", v), []);
  // 已经填了税率就不再提醒
  assert.deepEqual(detectVatIssues("amazon-uk", { price: 29.9, vatRate: 20 }), []);
  // 没有商品/站点时不臆测
  assert.deepEqual(detectVatIssues(null, v), []);
});

test("负数税率被拦下", async () => {
  const { calculateProfit, DEFAULT_PROFIT_VALUES } = await import("../lib/crossborder/calculators/profit");
  assert.throws(() => calculateProfit({ ...DEFAULT_PROFIT_VALUES, vatRate: -5 }), /不能为负数/);
});
