/**
 * 进口到岸成本引擎。纯函数。
 * 完税价 ≈ (采购 + 头程) × 汇率；关税 = 完税价 × 关税率；VAT = (完税价 + 关税) × VAT 率；
 * 到岸成本 = 三者之和。税率仅供估算。
 *
 * suggestedPrice = 到岸成本 ÷ (1 − 目标净利率)，只覆盖到岸成本与净利，
 * 未扣平台佣金与广告——它是自有渠道的目标售价，不是平台上架价。
 * 平台售价请用 pricing-sim.ts（它还会扣佣金与广告，结果明显更高），
 * 两者口径不同，别混用。UI 上称「目标售价」。
 *
 * ⚠ 现状：本文件已**不被任何页面引用** —— 到岸成本工具走的是更完整的
 * crossborder/landed-model.ts（含 CIF/FOB 口径、逐费用 dutiable、VAT 可抵扣、
 * 现金/经济到岸三分）。这里只剩测试在用，保留是为了不动既有测试的历史口径。
 * 新代码一律用 landed-model.ts；本文件不要再扩展，也不要从这里复制公式。
 */

export type LandedInput = {
  cost: number;
  head: number;
  fx: number;
  duty: number;
  vat: number;
  margin: number;
};

export type LandedResult = {
  cif: number;
  dutyAmount: number;
  vatAmount: number;
  taxTotal: number;
  landed: number;
  suggestedPrice: number | null;
};

export function calculateLanded(input: LandedInput): LandedResult {
  const cif = (input.cost + input.head) * input.fx;
  const dutyAmount = cif * input.duty / 100;
  const vatAmount = (cif + dutyAmount) * input.vat / 100;
  const landed = cif + dutyAmount + vatAmount;
  const denom = 1 - input.margin / 100;
  const suggestedPrice = denom > 0 ? landed / denom : null;
  return {
    cif,
    dutyAmount,
    vatAmount,
    taxTotal: dutyAmount + vatAmount,
    landed,
    suggestedPrice,
  };
}
