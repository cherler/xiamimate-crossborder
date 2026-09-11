/**
 * 定价决策模拟引擎。纯函数。
 *
 * 核心事实：利润对售价是线性的 —— 利润(P) = P × retention − fixedDrag。
 * 佣金、广告、退款、以及 pct_sales 类积木都按售价比例计，归入 retention；
 * 其余五类积木都能折算成与售价无关的每件金额，归入 fixedDrag。
 * 于是「按目标倒推售价」有解析解，不需要数值搜索。
 *
 * 口径必须与利润页一致：simProfit() 的结果与 computeAdjusted() 在同一售价上
 * 相等（差异仅来自后者的四舍五入），tests/pricing-sim.test.ts 锁死这一点。
 *
 * 只给财务可行区间，不承诺「最优价」：需求、转化与竞品价格不在模型内。
 */

import { blockPerUnit, type CostBlock } from "./cost-model";
import { vatKeepFactor } from "./vat";
import { type ProfitValues } from "./calculators/profit";
import { baseCost } from "./product-model";

/** 工具中立的模拟输入：利润页传成本分项合计，定价页直接传「总成本」。 */
export type SimInput = {
  fixedCost: number;   // 每件固定成本（采购 + 物流/履约）
  commission: number;  // 平台佣金 %
  ads: number;         // 广告占比 %（占售价，TACoS 口径）
  refund: number;      // 退款损耗 %
  /** 销项税率 %(欧盟/英国含税标价)。缺省 0 —— 与利润引擎同口径。 */
  vatRate?: number;
  /** 达人佣金 %(TikTok Shop)。缺省 0。 */
  affiliateRate?: number;
  blocks: CostBlock[];
};

export function simInputFromProfit(values: ProfitValues, blocks: CostBlock[]): SimInput {
  return {
    fixedCost: baseCost(values),
    commission: values.commission,
    ads: values.ads,
    refund: values.refund,
    vatRate: values.vatRate,
    blocks,
  };
}

/** 售价的线性系数。利润(P) = P × retention − fixedDrag。 */
export type PriceCoefficients = {
  retention: number;    // k：每 1 元售价最终留下的比例
  fixedDrag: number;    // C：与售价无关的每件净固定成本
  advanceCost: number;  // D：每件自垫成本（采购+物流+固定成本积木），ROI 的分母
  adRate: number;       // 广告占售价比例，用于反推「不含广告」的口径
};

export function priceCoefficients(input: SimInput): PriceCoefficients {
  // 达人佣金与佣金/广告/退款同口径(按售价百分比)—— 漏了它倒推出的售价会偏低,
  // 而用户是照着这个价去定价的。
  const rate = (input.commission + input.ads + input.refund + (input.affiliateRate ?? 0)) / 100;
  // 含税标价:每 1 元里只有 1/(1+v) 是自己的收入,其余是代收的税。
  // v=0 时退化成 1,老行为不变。
  // 折算与守卫收在 lib/crossborder/vat.ts —— 三个引擎同一份定义。
  // 这里此前是裸除法:vatRate=-100 时除数为 0,倒推出的售价直接是 Infinity。
  const vatKeep = vatKeepFactor(input.vatRate);

  let pctBlocks = 0;      // 有符号：收入为正
  let fixedBlocks = 0;    // 有符号：收入为正
  let advanceBlocks = 0;  // 仅 cost 类、非 pct 的固定积木（真正垫付的钱）

  for (const b of input.blocks) {
    const sign = b.kind === "income" ? 1 : -1;
    if (b.type === "pct_sales") {
      pctBlocks += sign * (Number(b.params.pct) || 0) / 100;
      continue;
    }
    // 其余五类都与售价无关，复用同一个折算函数，避免和利润页各算各的。
    const amount = blockPerUnit(b, { price: 0 });
    fixedBlocks += sign * amount;
    if (b.kind === "cost") advanceBlocks += amount;
  }

  return {
    retention: vatKeep - rate + pctBlocks,
    fixedDrag: input.fixedCost - fixedBlocks,
    advanceCost: input.fixedCost + advanceBlocks,
    adRate: input.ads / 100,
  };
}

/** 给定售价的单件利润。与 computeAdjusted 同口径。 */
export function simProfit(coef: PriceCoefficients, price: number): number {
  return price * coef.retention - coef.fixedDrag;
}

/* ---------------- 按目标倒推售价 ---------------- */

export type SimTarget =
  | { kind: "margin"; value: number }      // 目标净利率 %
  | { kind: "roi"; value: number }         // 目标 ROI %（利润 ÷ 自垫成本）
  | { kind: "unitProfit"; value: number }  // 目标单件利润 $
  | { kind: "breakeven" };                 // 保本

export const TARGET_LABELS: Record<SimTarget["kind"], string> = {
  margin: "按目标净利率",
  roi: "按目标 ROI",
  unitProfit: "按目标单件利润",
  breakeven: "保本售价",
};

/** 无解时给出人能读懂的原因，而不是静默返回 null。 */
export type SolvedPrice = { price: number | null; reason?: string };

export function solvePrice(coef: PriceCoefficients, target: SimTarget): SolvedPrice {
  const { retention: k, fixedDrag: C, advanceCost: D } = coef;
  const pctK = (k * 100).toFixed(1);

  if (k <= 0) {
    return { price: null, reason: `佣金 + 广告 + 退款与按售价比例计的成本模块合计已达 100%，每卖 1 元留不下钱，任何售价都无法盈利。` };
  }

  let price: number;
  switch (target.kind) {
    case "breakeven":
      price = C / k;
      break;
    case "margin": {
      const denom = k - target.value / 100;
      /**
       * C < 0 时(收入型积木超过固定成本)利润率 = k + |C|/P,随售价下降而升高,
       * 高于 k 的目标反而是有解的 —— 原来先判 denom ≤ 0 就直接报「无解」,
       * 而实际存在正数解。例:固定成本 10、每件收入 20、k=0.71,目标 90% 时
       * P = 52.63 恰好命中 90.0%。分支冷门,但给出的是一个错误答案。
       */
      if (denom <= 0) {
        if (C >= 0) {
          return { price: null, reason: `目标净利率 ${target.value}% 已达到或超过每元售价能留下的 ${pctK}%，无法倒推出正数售价。` };
        }
        if (denom === 0) {
          return { price: null, reason: `目标净利率恰好等于每元售价能留下的 ${pctK}%，任何售价都无法精确命中。` };
        }
      }
      price = C / denom;
      if (!Number.isFinite(price) || price <= 0) {
        return { price: null, reason: `目标净利率 ${target.value}% 在当前成本结构下没有正数解。` };
      }
      break;
    }
    case "unitProfit":
      price = (C + target.value) / k;
      break;
    case "roi":
      if (D <= 0) return { price: null, reason: "自垫成本为 0，ROI 无从计算。" };
      price = (C + D * target.value / 100) / k;
      break;
  }

  if (!Number.isFinite(price)) return { price: null, reason: "参数无法计算出售价。" };
  if (price <= 0) {
    return { price: null, reason: "在任何正数售价下都已盈利（固定成本被收入类模块抵消），无需倒推。" };
  }
  return { price };
}

/* ---------------- 价格情景表 ---------------- */

export type Scenario = {
  price: number;
  profit: number;
  margin: number;         // 净利率 %
  roi: number | null;     // 利润 ÷ 自垫成本 %
  maxAdShare: number;     // 保本前最大广告占比 %（占售价，TACoS 口径）
};

export function scenarioAt(coef: PriceCoefficients, price: number): Scenario {
  const profit = simProfit(coef, price);
  // 把广告加回去，得到「不含广告」的留存，再看还能拿出多少投广告。
  const beforeAds = price * (coef.retention + coef.adRate) - coef.fixedDrag;
  return {
    price,
    profit,
    margin: price > 0 ? profit / price * 100 : 0,
    roi: coef.advanceCost > 0 ? profit / coef.advanceCost * 100 : null,
    maxAdShare: price > 0 ? Math.max(0, beforeAds / price * 100) : 0,
  };
}

export function priceScenarios(coef: PriceCoefficients, prices: number[]): Scenario[] {
  return prices.map((p) => scenarioAt(coef, p));
}

/** 围绕中心价生成一组情景售价（默认 ±20%），用于「售价变动会怎样」。 */
export function scenarioBand(center: number, spread = 0.2, steps = 5): number[] {
  if (!(center > 0) || steps < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const f = 1 - spread + (2 * spread * i) / (steps - 1);
    out.push(Math.round(center * f * 100) / 100);
  }
  return out;
}

/* ---------------- 最大可承受折扣 ---------------- */

export type DiscountRoom = {
  breakevenPrice: number | null;
  discountPct: number | null;  // 从挂牌价最多可降多少 % 仍不亏
};

export function maxDiscount(coef: PriceCoefficients, listPrice: number): DiscountRoom {
  const be = solvePrice(coef, { kind: "breakeven" });
  if (be.price === null || !(listPrice > 0)) return { breakevenPrice: be.price, discountPct: null };
  if (be.price >= listPrice) return { breakevenPrice: be.price, discountPct: 0 };
  return { breakevenPrice: be.price, discountPct: (1 - be.price / listPrice) * 100 };
}
