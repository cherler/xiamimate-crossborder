/**
 * ACoS 盈亏平衡引擎。纯函数。
 * 单件毛利 = 售价 − 单件成本 − 平台佣金 − 退款损耗;
 * 保本 ACoS = 单件毛利 ÷ 售价;目标 ACoS = (单件毛利 − 售价 × 目标净利率) ÷ 售价。
 *
 * 退款损耗此前**整个漏掉了**,而它和佣金一样是按售价百分比计的必然成本。
 * 后果不是小数点问题:保本 ACoS 恰好高出退款率那么多个点 ——
 * 售价 29.9 / 成本 15.2 / 佣金 15% / 退款 2% 时,引擎给 34.16%,真值 32.16%。
 * 实测 ACoS 33% 的卖家会被红线尺告知「线内」,而他每单在亏 $0.30。
 * 利润计算器一直是含退款的,两个工具对同一个商品给出不同的保本线。
 *
 * **销项税(vatRate)是同一个坑的第二次。** 欧盟/英国标的是含税价,
 * 其中一部分是替税务局代收的,不是你的收入。这个字段在利润引擎里处理了,
 * 却始终没进这里 —— 实测英国站 20% VAT 下,保本 ACoS 给 58.1%,真值 41.5%,
 * 高出 16.6 个点。按这条红线投广告,每一单都在亏。
 * 口径与利润引擎严格一致:**只从收入里扣 VAT,佣金/退款仍按标价计**。
 */

import { vatKeepFactor } from "../vat";

export type AcosInput = {
  price: number;
  cost: number;
  commission: number;
  margin: number;
  /** 退款/退货损耗 %(占售价)。缺省 0 —— 老调用方不传时行为与过去一致。 */
  refund?: number;
  /**
   * 销项税率 %(欧盟/英国的含税标价)。缺省 0 —— 美国站行为与过去完全一致。
   * 口径同利润引擎:只从收入里扣,佣金/退款仍按标价计。
   */
  vatRate?: number;
  /** 达人佣金 %(TikTok Shop)。缺省 0 —— 老调用方与亚马逊行为一字不变。
   *  与平台佣金同口径按售价计:少算它,保本 ACoS 会偏高,照着投就是每单在亏。 */
  affiliateRate?: number;
};

export type AcosResult = {
  grossPerUnit: number;
  breakevenAcos: number;
  targetAcos: number;
  targetAdBudget: number;
  targetFeasible: boolean;
};

export function calculateAcos(input: AcosInput): AcosResult {
  const commissionCost = input.price * input.commission / 100;
  const refundLoss = input.price * (input.refund ?? 0) / 100;
  const affiliateCost = input.price * (input.affiliateRate ?? 0) / 100;
  // 含税标价里真正归你的那部分。vatRate=0 时就是售价本身。
  // 折算收在 lib/crossborder/vat.ts:除数是 1+v/100,v=-100 时就是 0,
  // 而这里没有利润引擎那道负数守卫 —— 非法值退化成 0(不打折),并由
  // detectAdIssues 给用户一句提示,不静默算错。
  const netRevenue = input.price * vatKeepFactor(input.vatRate);
  const grossPerUnit = netRevenue - input.cost - commissionCost - refundLoss - affiliateCost;
  const breakevenAcos = input.price > 0 ? grossPerUnit / input.price * 100 : 0;
  const targetAdBudget = grossPerUnit - input.price * input.margin / 100;
  const targetAcos = input.price > 0 ? targetAdBudget / input.price * 100 : 0;
  return {
    grossPerUnit,
    breakevenAcos,
    targetAcos,
    targetAdBudget,
    targetFeasible: targetAcos >= 0,
  };
}
