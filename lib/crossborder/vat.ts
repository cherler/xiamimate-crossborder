/**
 * 销项税(vatRate)的唯一定义。
 *
 * 欧盟/英国的平台标价是含税价:标 £29.90,其中一部分是替税务局代收的,要上缴,
 * 不是你的收入。三个引擎都要用同一个折算 —— 利润(profit)、广告盈亏(acos)、
 * 定价倒推(pricing-sim)。
 *
 * 为什么要收进一个文件:除数是 `1 + vatRate/100`,vatRate = -100 时它就是 0。
 * 利润引擎里有一道 `!Number.isFinite(vatRate) || vatRate < 0` 的守卫,
 * 另外两个引擎**没有** —— 同一个字段、同一个公式,守卫只在三分之一的地方。
 * 实测后果:
 *   vatRate = -20   保本 ACoS 60.5%(真值 35.5%),悄悄虚高 25 个点,没有任何提示;
 *   vatRate = -100  保本 ACoS Infinity%,界面直接显示 "Infinity%";
 * 而利润页对同一个值会明确报错「销项税率不能为负数」。两个工具对同一个输入,
 * 一个拦、一个静默算错 —— 这正是这个仓里反复出现的那种「自信的错值」。
 *
 * 非法值一律退化成 0(等于没有 VAT)。这是保守方向:宁可少算收入,不能多算。
 * 调用方若有展示错误的地方,应同时用 isValidVatRate 给用户一句提示,别只是悄悄退化。
 */

/** 销项税率是否可用于计算。负数、NaN、Infinity 都不可用。 */
export function isValidVatRate(vatRate: number | undefined): boolean {
  const v = vatRate ?? 0;
  return Number.isFinite(v) && v >= 0;
}

/**
 * 含税标价里真正归你的那一份系数:1 / (1 + v/100)。
 * vatRate = 0(或非法)时返回 1 —— 美国站行为与过去一字不变。
 */
export function vatKeepFactor(vatRate: number | undefined): number {
  if (!isValidVatRate(vatRate)) return 1;
  return 1 / (1 + (vatRate ?? 0) / 100);
}
