/**
 * 广告盈亏规划引擎。纯函数。
 *
 * 在 ACoS 红线之上接入广告实测数据，回答「CPC 出到多少还不亏」。
 * 核心恒等式：每单广告费 = CPC ÷ CVR。于是
 *   CPC ≤ 每单可承受广告费 × CVR
 * 保本 / 目标的「每单可承受广告费」直接取自 calculators/acos.ts，
 * 不在这里重算 —— 同一商品在 ACoS 红线、利润页广告卡片、这里必须是同一组数字。
 *
 * 口径提醒（本引擎只算财务，不下广告策略结论）：
 * ACoS 的分母是广告归因销售额；TACoS 的分母是总销售额，等于利润计算器里的
 * 「广告成本 %」。两者差一个「广告销售占比」，别混用。
 */

import { calculateAcos, type AcosInput, type AcosResult } from "./calculators/acos";
import { isValidVatRate } from "./vat";

/** 广告后台导出的实测数据。 */
export type AdActuals = {
  spend: number;    // 广告花费
  adSales: number;  // 广告归因销售额
  clicks: number;   // 点击数
  orders: number;   // 广告归因订单数
};

export type AdMetrics = {
  cpc: number | null;             // 花费 ÷ 点击
  cvr: number | null;             // 订单 ÷ 点击，%
  acos: number | null;            // 花费 ÷ 归因销售额，%
  adCostPerOrder: number | null;  // 花费 ÷ 订单
  avgOrderValue: number | null;   // 归因销售额 ÷ 订单（与售价对不上即有多件订单等情况）
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function adMetrics(a: AdActuals): AdMetrics {
  const cvr = ratio(a.orders, a.clicks);
  return {
    cpc: ratio(a.spend, a.clicks),
    cvr: cvr === null ? null : cvr * 100,
    acos: (() => { const r = ratio(a.spend, a.adSales); return r === null ? null : r * 100; })(),
    adCostPerOrder: ratio(a.spend, a.orders),
    avgOrderValue: ratio(a.adSales, a.orders),
  };
}

/* ---------------- CPC 上限 ---------------- */

export type AdPlan = {
  acos: AcosResult;          // 红线，来自 calculateAcos
  maxCpc: number | null;     // 保本 CPC 上限 = 单件毛利 × CVR
  targetCpc: number | null;  // 达成目标净利的 CPC = 目标每单广告预算 × CVR
  tacos: number | null;      // 实测 ACoS × 广告销售占比，%
};

/**
 * @param adShare 广告归因销售额占总销售额的比例 %，用于把 ACoS 折算成 TACoS。
 */
export function planAds(product: AcosInput, actuals: AdActuals, adShare: number): AdPlan {
  const acos = calculateAcos(product);
  const m = adMetrics(actuals);
  const cvr = m.cvr === null ? null : m.cvr / 100;

  return {
    acos,
    maxCpc: cvr === null ? null : Math.max(0, acos.grossPerUnit) * cvr,
    targetCpc: cvr === null || !acos.targetFeasible ? null : Math.max(0, acos.targetAdBudget) * cvr,
    tacos: m.acos === null ? null : m.acos * adShare / 100,
  };
}

/* ---------------- CPC 情景表 ---------------- */

export type CpcScenario = {
  cpc: number;
  adCostPerOrder: number;  // CPC ÷ CVR
  acos: number;            // 每单广告费 ÷ 售价，%
  profitPerOrder: number;  // 单件毛利 − 每单广告费
};

export function cpcScenarios(product: AcosInput, cvrPct: number, cpcs: number[]): CpcScenario[] {
  const { grossPerUnit } = calculateAcos(product);
  const cvr = cvrPct / 100;
  return cpcs.map((cpc) => {
    const adCostPerOrder = cvr > 0 ? cpc / cvr : 0;
    return {
      cpc,
      adCostPerOrder,
      acos: product.price > 0 ? (adCostPerOrder / product.price) * 100 : 0,
      profitPerOrder: grossPerUnit - adCostPerOrder,
    };
  });
}

/** 围绕实测 CPC 展开一组情景（默认 ±40%，广告出价波动比售价大）。 */
export function cpcBand(center: number, spread = 0.4, steps = 5): number[] {
  if (!(center > 0) || steps < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < steps; i += 1) {
    const f = 1 - spread + (2 * spread * i) / (steps - 1);
    out.push(Math.round(center * f * 100) / 100);
  }
  return out;
}

/* ---------------- 数据口径体检 ---------------- */

export type AdWarning = { id: string; level: "warn" | "info"; text: string };

/**
 * 检查实测数据与商品参数是否对得上。只提醒、不阻断 ——
 * 广告数据的坑多半在口径，不在算术。
 */
export function detectAdIssues(product: AcosInput, actuals: AdActuals, plan: AdPlan): AdWarning[] {
  const out: AdWarning[] = [];
  const m = adMetrics(actuals);

  // 销项税率非法(负数/NaN)时引擎按 0 算 —— 必须说出来。
  // 不说的话:填 -20 得到保本 ACoS 60.5%(真值 35.5%),而利润页对同一个值是明确报错的。
  if (!isValidVatRate(product.vatRate)) {
    out.push({
      id: "vat-invalid", level: "warn",
      text: `销项税率填的是 ${product.vatRate}，不是一个有效的税率(不能为负)。下面的保本线已按「不含销项税」计算 —— 若你卖在欧盟/英国，请把它改成正数（如 20），否则这条红线会偏高。`,
    });
  }
  if (actuals.clicks > 0 && actuals.orders === 0) {
    out.push({
      id: "no-conversion", level: "info",
      text: "这段时间广告有点击但没有归因订单，CVR 无法估计，CPC 上限也就无从算起。样本太小时先别急着据此调价。",
    });
  }
  if (actuals.spend > 0 && actuals.adSales === 0 && actuals.orders > 0) {
    out.push({
      id: "sales-missing", level: "warn",
      text: "有归因订单却没有归因销售额，多半是两个数取自不同报表或不同时间窗，请先对齐口径。",
    });
  }
  // 归因客单价对不上售价：多件订单、期间改过价，或订单里含其他 SKU。
  if (m.avgOrderValue !== null && product.price > 0) {
    const gap = Math.abs(m.avgOrderValue - product.price) / product.price;
    if (gap > 0.05) {
      out.push({
        id: "aov-mismatch", level: "warn",
        text: `广告归因客单价 $${m.avgOrderValue.toFixed(2)} 与售价 $${product.price.toFixed(2)} 相差 ${(gap * 100).toFixed(0)}%，可能是多件订单、期间改过价，或归因订单里含其他 SKU。此时「每单广告费」与单件口径对不上，CPC 上限会有偏差。`,
      });
    }
  }
  if (m.acos !== null && m.acos > plan.acos.breakevenAcos) {
    out.push({
      id: "over-breakeven", level: "warn",
      text: `实测 ACoS ${m.acos.toFixed(1)}% 已超过保本线 ${plan.acos.breakevenAcos.toFixed(1)}%，这批广告单在亏钱。但亏损不等于该关广告：新品期养排名、清库存、带动自然单都可能是有意为之。`,
    });
  }
  if (actuals.clicks > 0 && actuals.clicks < 100) {
    out.push({
      id: "small-sample", level: "info",
      text: `点击量只有 ${actuals.clicks}，CVR 的置信度很低，据此算出的 CPC 上限波动会很大。`,
    });
  }
  return out;
}
