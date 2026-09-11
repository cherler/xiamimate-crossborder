/**
 * 利润计算引擎（唯一真相源）。
 * 前端工具页、智能读取 API 与未来的 AI 编排都调用这里的 calculateProfit，
 * 不允许在别处复制公式。纯函数、无副作用、无外部依赖。
 */

import { isValidVatRate, vatKeepFactor } from "../vat";

export type ProfitValues = {
  price: number;
  cost: number;
  domestic: number;
  head: number;
  lastMile: number;
  commission: number;
  refund: number;
  ads: number;
  /**
   * 销项税率 %(欧盟/英国的增值税)。默认 0 —— 美国站行为与过去完全一致。
   *
   * 欧盟/英国的平台标价是**含税价**:标 £29.90,其中 £4.98 是替税务局代收的增值税,
   * 要上缴,你真正拿到的销售额是 £24.92。此前引擎把售价整个当成收入,
   * 英国场景利润高估约 5 倍($6.23/20.8% vs 真实 $1.25/4.2%)。
   *
   * 口径:只从**收入**里扣 VAT;佣金/广告/退款仍按标价计。
   * 各站各类目对「佣金按含税还是不含税计」的规则不一样,不写死一个可能错的假设。
   * 这个方向是保守的 —— 万一平台其实按不含税计佣金,我们算出的利润会略低于实际,
   * 宁可少算,不能多算。
   */
  vatRate?: number;
  /**
   * 达人佣金 %(TikTok Shop 等内容电商)。默认 0 —— 亚马逊行为一字不变。
   *
   * 做成**一等字段**而不是可选成本积木,原因是积木不参与跨工具复用:
   * 定价倒推和 ACoS 保本线都读不到它,而那两处恰恰最需要 ——
   * 一个 8% 平台佣金 + 15% 达人佣金的单子实际被抽走 23%,
   * 只按 8% 算出来的保本价和保本 ACoS 都是错的,且看不出来。
   *
   * 口径与平台佣金一致:按**售价**百分比计,与佣金/退款/广告一起进 rateTotal。
   */
  affiliateRate?: number;
};

export type ProfitField = keyof ProfitValues;

export type ProfitResult = {
  /** 扣除销项税后的实收销售额(vatRate=0 时等于售价)。 */
  netRevenue: number;
  /** 代收待缴的销项税额。 */
  vatAmount: number;
  fixedCost: number;
  commissionCost: number;
  adCost: number;
  refundLoss: number;
  /** 达人佣金(TikTok Shop 等)。亚马逊场景恒为 0。 */
  affiliateCost: number;
  totalCost: number;
  profit: number;
  margin: number;
  breakeven: number;
  risk: "亏损" | "偏低" | "可接受" | "较优";
  riskNote: string;
};

export const DEFAULT_PROFIT_VALUES: ProfitValues = {
  price: 29.9,
  cost: 8,
  domestic: 0.6,
  head: 2.4,
  lastMile: 4.2,
  commission: 15,
  refund: 2,
  ads: 12,
  // 默认 0 —— 美国站不涉及销项税;欧盟/英国用户按站点填(检测器会提醒)
  vatRate: 0,
  affiliateRate: 0,   // 亚马逊没有这个概念,默认 0 = 行为不变
};

export const PROFIT_FIELD_LABELS: Record<ProfitField, string> = {
  price: "售价",
  cost: "采购成本",
  domestic: "国内运费",
  head: "头程运费",
  lastMile: "尾程 / FBA",
  commission: "平台佣金",
  refund: "退款损耗",
  ads: "广告成本",
  vatRate: "销项税率",
  affiliateRate: "达人佣金",
};

export function calculateProfit(values: ProfitValues): ProfitResult {
  if (!Number.isFinite(values.price) || values.price <= 0) {
    throw new Error("售价需要大于 0");
  }
  if (!Number.isFinite(values.cost) || values.cost < 0) {
    throw new Error("采购成本不能为负数");
  }
  /**
   * 八个入参此前只校验了 price 和 cost 两个。
   *
   * 三项物流费与三项费率既不查符号也不查有限性,后果不是「算出个怪数」那么轻:
   *   国内运费 -10  → 利润 $16.63、利润率 55.6%、风险评级「较优」(一个负号让利润翻 2.8 倍)
   *   国内运费 NaN  → 处处 NaN,而评级**仍是「较优」** —— 因为所有 `NaN < x` 都是 false,
   *                   一路穿到 else 分支,坏输入拿到了引擎最乐观的判断
   * NaN 可以从一个损坏的 ?s= 分享链接进来(那边是无保护的 Number(v[k]))。
   */
  for (const k of ["domestic", "head", "lastMile"] as const) {
    if (!Number.isFinite(values[k])) throw new Error(`${PROFIT_FIELD_LABELS[k]}需要是一个数字`);
    if (values[k] < 0) throw new Error(`${PROFIT_FIELD_LABELS[k]}不能为负数`);
  }
  for (const k of ["commission", "refund", "ads"] as const) {
    if (!Number.isFinite(values[k])) throw new Error(`${PROFIT_FIELD_LABELS[k]}需要是一个数字`);
    if (values[k] < 0) throw new Error(`${PROFIT_FIELD_LABELS[k]}不能为负数`);
  }
  /*
   * 达人佣金与平台佣金同口径(按售价百分比),一起进合计 —— 少算它,
   * 保本价与利润率会系统性偏乐观,而界面上没有任何异常。
   *
   * 它是**可选字段**(亚马逊没有这个概念),所以不能和上面那批必填的一起校验:
   * 老调用方不传 → undefined → Number.isFinite false → 整条链路抛错。
   * 先归一到 0 再校验,老行为一字不变。
   */
  const affiliateRate = values.affiliateRate ?? 0;
  if (!Number.isFinite(affiliateRate) || affiliateRate < 0) {
    throw new Error("达人佣金不能为负数");
  }
  const rateTotal = values.commission + values.refund + values.ads + affiliateRate;
  if (rateTotal >= 100) {
    throw new Error("佣金、广告和退款损耗合计需要小于 100%");
  }

  const vatRate = values.vatRate ?? 0;
  // 判据与折算都取自 lib/crossborder/vat.ts —— 三个引擎共用一份定义。
  // 这一页有 try/catch 能把错误显示给用户,所以这里仍然抛;acos / pricing-sim
  // 的调用方没有 catch,那两处退化成「按 0 算」并另行提示。
  if (!isValidVatRate(vatRate)) throw new Error("销项税率不能为负数");
  // 含税标价 → 实收销售额。vatRate=0 时 netRevenue === price,老行为一字不变。
  const netRevenue = values.price * vatKeepFactor(vatRate);
  const vatAmount = values.price - netRevenue;

  const fixedCost = values.cost + values.domestic + values.head + values.lastMile;
  const commissionCost = values.price * values.commission / 100;
  const adCost = values.price * values.ads / 100;
  const refundLoss = values.price * values.refund / 100;
  const affiliateCost = values.price * affiliateRate / 100;
  const totalCost = fixedCost + commissionCost + adCost + refundLoss + affiliateCost;
  const profit = netRevenue - totalCost;
  // 利润率以**实收销售额**为基数 —— 拿含税价当分母会把税额算成自己的营业额。
  const margin = profit / netRevenue * 100;
  /**
   * 保本价:令 净收入 = 成本。
   *   P/(1+v) − (fixedCost + P·rate) = 0  →  P = fixedCost / (1/(1+v) − rate)
   * v=0 时退化回原式 fixedCost / (1 − rate)。
   */
  const retention = vatKeepFactor(vatRate) - rateTotal / 100;
  const breakeven = retention > 0 ? fixedCost / retention : Number.POSITIVE_INFINITY;

  let risk: ProfitResult["risk"];
  let riskNote: string;
  if (margin < 0) {
    risk = "亏损";
    riskNote = "当前售价无法覆盖成本，建议提高售价或压缩成本。";
  } else if (margin < 10) {
    risk = "偏低";
    riskNote = "利润率偏低，抗风险能力较弱，建议优化成本或定价。";
  } else if (margin < 25) {
    risk = "可接受";
    riskNote = "利润率处于可接受区间，可继续核对广告和退货波动。";
  } else {
    risk = "较优";
    riskNote = "利润率较优，有一定让利和投放空间。";
  }

  /**
   * 分项与合计必须闭合。
   *
   * 原来每一项各自从未取整的原始值 round2,合计也独立 round2 ——
   * 默认参数下 15.20 + 4.49 + 3.59 + 0.60 = 23.88,而总成本印的是 23.87。
   * 这个 $0.01 会随导出的 CSV 损益单进到用户的表格里,他一列求和就发现对不上,
   * 然后开始怀疑整张表。数字对不上账,比数字不好看严重得多。
   * 做法:分项照常取整,合计取分项之和 —— 让「看得见的那几个数」自己闭合。
   */
  // 达人佣金必须进 parts —— 它是「看得见的分项」之一。
  // 漏了它的后果不是少扣一笔,而是**同一份结果自相矛盾**:
  // margin 用未取整的 profit 算(已扣),而返回的 profit 用 parts 之和算(未扣),
  // 于是界面上会出现「利润 $14.10 / 利润率 32%」这种对不上的组合。
  const parts = [round2(fixedCost), round2(commissionCost), round2(adCost), round2(refundLoss),
                 round2(affiliateCost)];
  const totalCostRounded = round2(parts.reduce((a, b) => a + b, 0));
  const netRevenueRounded = round2(netRevenue);
  return {
    netRevenue: netRevenueRounded,
    vatAmount: round2(vatAmount),
    fixedCost: parts[0],
    commissionCost: parts[1],
    adCost: parts[2],
    refundLoss: parts[3],
    affiliateCost: parts[4],
    totalCost: totalCostRounded,
    // 利润同样按「看得见的数」算,否则用户拿 实收 − 总成本 会对不上
    profit: round2(netRevenueRounded - totalCostRounded),
    margin: round1(margin),
    breakeven: round2(breakeven),
    risk,
    riskNote,
  };
}

/**
 * 悲观压力档:售价 −7% · 广告 +3pt · 退款 +1pt。
 *
 * 这套调整原本在利润页与综合测算页各写了一遍 —— 而仓库的规矩是「公式不许在别处复制」。
 * 两份副本一旦有人只改了其中一份,同一个商品在两个页面会得出不同的悲观结论,
 * 而且没有任何东西会报错。
 */
export function worstCase(v: ProfitValues): ProfitValues {
  return { ...v, price: v.price * 0.93, ads: v.ads + 3, refund: v.refund + 1 };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
