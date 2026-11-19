import { test } from "node:test";
import assert from "node:assert/strict";

import { calculateLanded } from "../lib/crossborder/calculators/landed-cost.ts";
import {
  INCOTERMS, FEE_PRESETS, feeFromPreset, calculateLandedModel, targetPrice,
  compareLanded, detectLandedIssues, type LandedInput, type LandedFee,
} from "../lib/crossborder/landed-model.ts";

const approx = (a: number, b: number, eps = 0.01) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const fee = (over: Partial<LandedFee> & { id: string }): LandedFee =>
  ({ name: "费用", amount: 0, basis: "batch", dutiable: true, ...over });

const input = (over: Partial<LandedInput> = {}): LandedInput => ({
  unitCost: 50, units: 1, fees: [], fx: 0.14,
  dutyRate: 5, vatRate: 20, vatReclaimable: false, incoterm: "FOB", ...over,
});

/* ---------------- 与旧引擎的关系 ---------------- */

// 单件、头程计入完税价、VAT 不可抵扣时，必须与旧引擎给出同一个到岸成本，
// 否则就是在同一个站点上给出两个互相矛盾的到岸成本。
test("口径一致 · 退化到旧 calculateLanded 的场景", () => {
  const r = calculateLandedModel(input({
    fees: [fee({ id: "freight-1-1", amount: 8, dutiable: true })],
  }));
  const old = calculateLanded({ cost: 50, head: 8, fx: 0.14, duty: 5, vat: 20, margin: 30 });
  approx(r.customsValue, old.cif);
  approx(r.dutyAmount, old.dutyAmount);
  approx(r.vatAmount, old.vatAmount);
  approx(r.cashLanded, old.landed);
  approx(r.perUnitLanded, old.landed); // 1 件
  approx(targetPrice(r.perUnitLanded, 30)!, old.suggestedPrice!);
});

/* ---------------- 三口径 ---------------- */

// 这是旧版最大的说算脱节：页面写「VAT 可抵扣则非最终成本」，引擎却全额计入。
test("三口径 · VAT 可抵扣时经济到岸低于现金到岸", () => {
  const base = input({ fees: [fee({ id: "freight-1-1", amount: 8 })] });
  const no = calculateLandedModel(base);
  const yes = calculateLandedModel({ ...base, vatReclaimable: true });

  approx(no.cashLanded, yes.cashLanded);            // 掏出去的钱一样
  approx(no.economicLanded, no.cashLanded);         // 不可抵扣时两者相等
  approx(yes.economicLanded, yes.cashLanded - yes.vatAmount);
  assert.ok(yes.economicLanded < yes.cashLanded);   // 可抵扣时真实成本更低
  approx(yes.vatReclaim, yes.vatAmount);
});

test("三口径 · 单件到岸 = 经济到岸 ÷ 件数", () => {
  const r = calculateLandedModel(input({
    units: 500, fees: [fee({ id: "freight-1-1", amount: 4000 })], vatReclaimable: true,
  }));
  approx(r.perUnitLanded, r.economicLanded / 500);
  assert.ok(r.perUnitLanded > 0);
});

test("三口径 · 件数为 0 时单件到岸为 0 而不是 Infinity", () => {
  assert.equal(calculateLandedModel(input({ units: 0 })).perUnitLanded, 0);
});

/* ---------------- 完税价与费用 ---------------- */

test("费用 · 只有计入完税价的费用才产生关税与 VAT", () => {
  const dutiable = calculateLandedModel(input({ fees: [fee({ id: "freight-1-1", amount: 100, dutiable: true })] }));
  const not = calculateLandedModel(input({ fees: [fee({ id: "customs-1-2", amount: 100, dutiable: false })] }));

  assert.ok(dutiable.customsValue > not.customsValue);
  assert.ok(dutiable.dutyAmount > not.dutyAmount);
  // 两者掏的钱都含这 100，只是税基不同
  assert.ok(dutiable.cashLanded > not.cashLanded);
  approx(not.customsValue, 50 * 0.14);
  approx(not.otherFeesLocal, 100);
});

test("费用 · 每件口径按件数放大，批次口径不放大", () => {
  const perUnit = calculateLandedModel(input({ units: 10, fees: [fee({ id: "a-1-1", amount: 2, basis: "per_unit" })] }));
  const batch = calculateLandedModel(input({ units: 10, fees: [fee({ id: "a-1-2", amount: 2, basis: "batch" })] }));
  approx(perUnit.dutiableFeesLocal, 20);
  approx(batch.dutiableFeesLocal, 2);
});

test("费用 · VAT 税基 = 完税价 + 关税", () => {
  const r = calculateLandedModel(input());
  approx(r.vatBase, r.customsValue + r.dutyAmount);
  approx(r.vatAmount, r.vatBase * 0.2);
});

/* ---------------- Incoterm ---------------- */

test("Incoterm · DDP 不再另计关税与 VAT（税已含在采购价里）", () => {
  const r = calculateLandedModel(input({ incoterm: "DDP" }));
  approx(r.dutyAmount, 0);
  approx(r.vatAmount, 0);
  approx(r.cashLanded, r.customsValue);
  assert.equal(r.sellerPaysImportTax, true);
});

test("Incoterm · DDP 下即使勾了可抵扣也不抵（税单不在你名下）", () => {
  const r = calculateLandedModel(input({ incoterm: "DDP", vatReclaimable: true }));
  approx(r.vatReclaim, 0);
  approx(r.economicLanded, r.cashLanded);
});

test("Incoterm · 非 DDP 都由买方承担进口税", () => {
  for (const k of ["EXW", "FOB", "CIF", "DAP"] as const) {
    assert.equal(INCOTERMS[k].sellerPaysImportTax, false);
    assert.ok(calculateLandedModel(input({ incoterm: k })).dutyAmount > 0);
  }
});

/* ---------------- 目标售价 ---------------- */

test("targetPrice · 达成目标净利，且净利率≥100% 时无解", () => {
  const p = targetPrice(20, 30)!;
  approx((p - 20) / p * 100, 30);
  assert.equal(targetPrice(20, 100), null);
  assert.equal(targetPrice(20, 120), null);
});

/* ---------------- 情景对比 ---------------- */

test("compareLanded · 越南低关税 vs 中国：单件到岸差额", () => {
  const cn = input({ units: 100, fees: [fee({ id: "freight-1-1", amount: 800 })], dutyRate: 25 });
  const vn = { ...cn, unitCost: 55, dutyRate: 5 };
  const d = compareLanded(cn, vn);
  // 采购贵了但关税低很多 → B 更便宜
  assert.ok(d.perUnitDelta < 0, `期望 B 更便宜，实际 ${d.perUnitDelta}`);
  approx(d.perUnitDelta, d.b.perUnitLanded - d.a.perUnitLanded);
});

test("compareLanded · VAT 可抵与不可抵：现金一样、经济不同", () => {
  const a = input({ units: 100, fees: [fee({ id: "freight-1-1", amount: 800 })] });
  const d = compareLanded(a, { ...a, vatReclaimable: true });
  approx(d.cashDelta, 0);            // 掏的钱没变
  assert.ok(d.perUnitDelta < 0);     // 但真实成本更低
});

/* ---------------- 口径体检 ---------------- */

test("detectLandedIssues · CIF 报价又单独加运费 → 重复计费警告", () => {
  const i = input({ incoterm: "CIF", fees: [feeFromPreset(FEE_PRESETS[0])] });
  const ids = detectLandedIssues(i, calculateLandedModel(i)).map((w) => w.id);
  assert.ok(ids.includes("dup-freight"));
});

test("detectLandedIssues · FOB 报价加运费属正常，不误报", () => {
  const i = input({ incoterm: "FOB", fees: [feeFromPreset(FEE_PRESETS[0])] });
  const ids = detectLandedIssues(i, calculateLandedModel(i)).map((w) => w.id);
  assert.ok(!ids.includes("dup-freight"));
});

test("detectLandedIssues · DDP + 勾了可抵扣要警告", () => {
  const i = input({ incoterm: "DDP", vatReclaimable: true });
  const ids = detectLandedIssues(i, calculateLandedModel(i)).map((w) => w.id);
  assert.ok(ids.includes("ddp-vat-reclaim"));
  assert.ok(ids.includes("ddp-tax"));
});

test("detectLandedIssues · 抵扣提示要点明现金仍被占用", () => {
  const i = input({ vatReclaimable: true, fees: [fee({ id: "freight-1-1", amount: 8 })] });
  const w = detectLandedIssues(i, calculateLandedModel(i)).find((x) => x.id === "vat-reclaim");
  assert.ok(w);
  assert.match(w.text, /现金到岸/);
});

test("feeFromPreset · id 唯一且保留预设的完税价归属", () => {
  const a = feeFromPreset(FEE_PRESETS[0]);
  const b = feeFromPreset(FEE_PRESETS[0]);
  assert.notEqual(a.id, b.id);
  assert.equal(a.dutiable, true);              // 国际运费默认计入
  assert.equal(feeFromPreset(FEE_PRESETS[3]).dutiable, false); // 清关费不计入
});
