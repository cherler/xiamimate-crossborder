import { test } from "node:test";
import assert from "node:assert/strict";

import { defaultModel, baseCost, type ProductModel } from "../lib/crossborder/product-model.ts";
import { calculateAcos } from "../lib/crossborder/calculators/acos.ts";
import { type CostBlock } from "../lib/crossborder/cost-model.ts";
import {
  isDefaultModel, shouldOfferModel, prefillFromModel, summarizeModel,
  describeExcludedBlocks, describeAge, supportsBlocks,
} from "../lib/crossborder/model-prefill.ts";

const block = (name: string): CostBlock =>
  ({ id: `monthly_storage-1-1`, name, kind: "cost", type: "monthly_alloc", params: { monthly: 1200, monthlyUnits: 600 } });

const touched = (over: Partial<ProductModel> = {}): ProductModel => ({ ...defaultModel(), price: 40, ...over });

/* ---------------- 该不该提示 ---------------- */

test("shouldOfferModel · 无模型不提示", () => {
  assert.equal(shouldOfferModel(null), false);
});

test("shouldOfferModel · 未改动的默认模型不提示", () => {
  assert.equal(shouldOfferModel(defaultModel()), false);
});

// 回归锁：利润页一挂载就会写入一份带时间戳的默认模型。
// 若改用 updatedAt 判空，每个只是路过利润页的新用户都会被提示「复用」他本来就有的默认值。
test("shouldOfferModel · 带时间戳的默认模型仍不提示", () => {
  assert.equal(shouldOfferModel({ ...defaultModel(), updatedAt: Date.now() }), false);
});

test("shouldOfferModel · 改过任一字段就提示", () => {
  assert.equal(shouldOfferModel(touched()), true);
  assert.equal(shouldOfferModel({ ...defaultModel(), target: 35 }), true);
});

test("shouldOfferModel · 只加了成本积木也提示", () => {
  assert.equal(shouldOfferModel({ ...defaultModel(), blocks: [block("月度仓储")] }), true);
});

test("shouldOfferModel · 未来版本模型不提示（宁可不填也不填错）", () => {
  assert.equal(shouldOfferModel(touched({ version: 2 })), false);
});

test("isDefaultModel · 忽略 version 与 updatedAt", () => {
  assert.equal(isDefaultModel({ ...defaultModel(), version: 9, updatedAt: 123 }), true);
});

/* ---------------- 字段映射 ---------------- */

// 最关键的一条：定价的「总成本」必须是 baseCost(15.2)，不是模型里的采购价 cost(8)。
test("prefillFromModel · 定价取 baseCost 而非原始 cost", () => {
  const v = prefillFromModel(defaultModel(), "pricing");
  assert.deepEqual(v, { cost: 15.2, targetValue: 20, commission: 15, ads: 12, refund: 2, vatRate: 0, affiliateRate: 0 });
  assert.notEqual(v.cost, defaultModel().cost);
});

// 定价页有退款损耗字段，模型里的 refund 必须带过去，否则它算出的利润会比利润页乐观。
test("prefillFromModel · 定价与 ACoS 都要承接 refund", () => {
  // 这条测试原本断言「ACoS 无此字段则不带」—— 把 bug 写进了断言。
  // 退款损耗和佣金一样是按售价百分比计的必然成本,ACoS 漏掉它会让保本线
  // 恰好高出退款率那么多个点,同一个商品在两个工具里保本线不一致。
  const m = { ...defaultModel(), refund: 4 };
  assert.equal(prefillFromModel(m, "pricing").refund, 4);
  assert.equal(prefillFromModel(m, "acos").refund, 4);
});

test("supportsBlocks · 只有定价能原样承接成本积木", () => {
  assert.equal(supportsBlocks("pricing"), true);
  assert.equal(supportsBlocks("acos"), false);
});

/*
 * vatRate 曾经在这条管道上被丢掉 —— 而它只在利润引擎里被处理。
 * 实测英国站 20% VAT:定价页保本价 10.47 / 真值 13.68(照它定价每单实亏 3.21),
 * 保本 ACoS 58.1% / 真值 41.5%(高 16.6 个点)。
 * 错的方向全是**多算利润**,正好违反引擎自己写的「宁可少算,不能多算」。
 */
test("prefillFromModel · 定价与 ACoS 都要承接 vatRate", () => {
  const m = { ...defaultModel(), vatRate: 20 };
  assert.equal(prefillFromModel(m, "pricing").vatRate, 20, "定价页拿不到销项税 → 保本价偏低,照它定价就是亏");
  assert.equal(prefillFromModel(m, "acos").vatRate, 20, "ACoS 拿不到销项税 → 保本红线虚高十几个点");
});

test("prefillFromModel · ACoS 的 margin 来自模型的 target", () => {
  const v = prefillFromModel({ ...defaultModel(), target: 25 }, "acos");
  assert.equal(v.margin, 25);
  assert.equal(v.cost, 15.2);
  assert.equal(v.price, 29.9);
});

// 守住 applyModel 里 setters[k]?.() 的静默失败：key 拼错不会报错，只会什么都不填。
test("prefillFromModel · 输出字段与两个工具的 setter key 完全一致", () => {
  assert.deepEqual(Object.keys(prefillFromModel(defaultModel(), "pricing")).sort(),
    ["ads", "affiliateRate", "commission", "cost", "refund", "targetValue", "vatRate"]);
  assert.deepEqual(Object.keys(prefillFromModel(defaultModel(), "acos")).sort(),
    ["affiliateRate", "commission", "cost", "margin", "price", "refund", "vatRate"]);
});

// 利润页内嵌的「广告红线」与独立 ACoS 工具必须给出同一组数字，
// 否则同一个商品在两个页面上会出现互相矛盾的保本线。
test("口径一致 · 利润页广告红线 = 独立 ACoS 工具", () => {
  const m: ProductModel = { ...defaultModel(), price: 40, target: 18, commission: 12 };
  const v = prefillFromModel(m, "acos");
  const fromTool = calculateAcos({ price: v.price, cost: v.cost, commission: v.commission,
                                   refund: v.refund, margin: v.margin, vatRate: v.vatRate,
                                   affiliateRate: v.affiliateRate });
  // 利润页的算法：直接用 ProfitValues 走同一个 baseCost
  const fromProfit = calculateAcos({ price: m.price, cost: baseCost(m), commission: m.commission,
                                     refund: m.refund, margin: m.target, vatRate: m.vatRate });
  assert.deepEqual(fromProfit, fromTool);
});

test("baseCost · 可直接吃 ProfitValues（利润页不必先造模型）", () => {
  const { target, blocks, version, updatedAt, ...profitValues } = defaultModel();
  void target; void blocks; void version; void updatedAt;
  assert.equal(baseCost(profitValues), 15.2);
});

/* ---------------- 摘要与文案 ---------------- */

test("summarizeModel · 汇总总成本与积木名", () => {
  const s = summarizeModel({ ...defaultModel(), blocks: [block("月度仓储"), block("优惠券")] });
  assert.equal(s.totalCost, 15.2);
  assert.equal(s.target, 20);
  assert.deepEqual(s.blockNames, ["月度仓储", "优惠券"]);
});

test("describeExcludedBlocks · 无积木时无文案，多积木时截断", () => {
  assert.equal(describeExcludedBlocks([]), "");
  assert.match(describeExcludedBlocks(["月度仓储", "优惠券"]), /未含 2 个成本模块（月度仓储、优惠券）/);
  assert.match(describeExcludedBlocks(["a", "b", "c", "d", "e"]), /（a、b、c 等 5 项）/);
});

test("describeAge · 相对时间", () => {
  const now = Date.now();
  assert.equal(describeAge(0, now), "");
  assert.equal(describeAge(now - 30 * 1000, now), "刚刚更新");
  assert.equal(describeAge(now - 5 * 60 * 1000, now), "5 分钟前更新");
  assert.equal(describeAge(now - 3 * 3600 * 1000, now), "3 小时前更新");
  assert.equal(describeAge(now - 3 * 24 * 3600 * 1000, now), "3 天前更新");
});
