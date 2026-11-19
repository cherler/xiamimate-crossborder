import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFIT_VALUES } from "../lib/crossborder/calculators/profit.ts";
import {
  defaultModel, modelFromProfit, toProfitValues, baseCost, sanitizeModel,
  PRODUCT_MODEL_VERSION,
} from "../lib/crossborder/product-model.ts";

test("defaultModel · 基础成本 = 采购 + 物流", () => {
  const m = defaultModel();
  assert.equal(baseCost(m), 15.2); // 8 + 0.6 + 2.4 + 4.2
  assert.equal(m.target, 20);
  assert.equal(m.blocks.length, 0);
  assert.equal(m.version, PRODUCT_MODEL_VERSION);
});

test("modelFromProfit → toProfitValues 往返一致", () => {
  const values = { ...DEFAULT_PROFIT_VALUES, price: 42, cost: 10 };
  const m = modelFromProfit(values, 25, []);
  assert.deepEqual(toProfitValues(m), values);
  assert.equal(m.target, 25);
});

test("sanitizeModel · 垃圾输入 → 默认值", () => {
  const m = sanitizeModel("nope");
  assert.equal(baseCost(m), 15.2);
  assert.equal(m.blocks.length, 0);
});

test("sanitizeModel · 部分字段合并、非法数值回退", () => {
  const m = sanitizeModel({ price: 50, cost: "x", target: 30, extra: 1 });
  assert.equal(m.price, 50);
  assert.equal(m.cost, DEFAULT_PROFIT_VALUES.cost); // "x" → 回退
  assert.equal(m.target, 30);
});

test("sanitizeModel · 过滤非法积木、强制 params 为数字", () => {
  const m = sanitizeModel({
    blocks: [
      { id: "a", name: "月度仓储", kind: "cost", type: "monthly_alloc", params: { monthly: "1200", monthlyUnits: 600 } },
      { name: "缺 id" },
      "garbage",
    ],
  });
  assert.equal(m.blocks.length, 1);
  assert.equal(m.blocks[0].params.monthly, 1200); // 字符串 → 数字
  assert.equal(m.blocks[0].kind, "cost");
});
