/**
 * 「AquaPeak 32oz 保温运动水杯」示例商品档案 —— 注册用户「我的商品」为空时注入的默认样例。
 *
 * 唯一真源:测算记录的标签一律由真实计算引擎算出(不再手写、不再对不上号);工作台记录带
 * 可还原的输入 + 输出(?snap= 点回工作台原样复现)。同一份数据也用于把测试账号的旧档案修好。
 *
 * 注入规则:登录用户、「我的商品」一个都没有、且本机没种过 —— 才注入一份(可改名/删除)。
 * 删掉不再回灌(种过即置标记)。示例身份靠固定 stableId 认,不改 Product 类型。
 */

import { calculateProfit, type ProfitValues } from "./calculators/profit";
import { calculateAcos } from "./calculators/acos";
import { priceCoefficients, solvePrice, TARGET_LABELS } from "./pricing-sim";
import { calculateLandedModel, type LandedFee } from "./landed-model";
import { chargeableWeight, ruleByKey } from "./dim-weight-rules";
import {
  aggregateThemes, profileSample, detectSampleIssues, detectThemeIssues,
  compareThemes, detectComparabilityIssues, type Review, type ThemeAssignment,
} from "./review-insight";
import { defaultModel, type ProductModel } from "./product-model";
import FIXTURE from "./example-fixture.json";
import type { ProductProject, ProductFact } from "./product-facts";
import {
  listProducts, importProduct, schedulePush, isCloudEnabled, type Product, type ProductRecord,
} from "./products";

export const EXAMPLE_STABLE_ID = "pid_example_aquapeak_v1";
const SEEDED_KEY = "xm:example-seeded:v1";
// 用「品类名」不用虚构品牌 —— 用户从档案发起真实研究时仍能搜到证据。
// 档案里的两份示例报告由前端按 stableId 虚拟派生，不冒充实时检索结果，也不写后端 run。
export const EXAMPLE_PRODUCT_NAME = "32oz 保温运动水杯（翻盖吸管）";
export const EXAMPLE_MARKETPLACE = "amazon-us";
const NAME = EXAMPLE_PRODUCT_NAME;
const MKT = EXAMPLE_MARKETPLACE;
const money = (n: number) => n.toFixed(2);

/** 是否是内置示例档案(靠固定 stableId 认,给「我的商品」打「示例」徽标用)。 */
export function isExampleProduct(p: Pick<Product, "stableId">): boolean {
  return p.stableId === EXAMPLE_STABLE_ID;
}

/* ------------------------------------------------------------------ *
 * 一、财务模型 + 五个计算器记录 —— 标签全部由真实引擎算出
 * ------------------------------------------------------------------ */

// 售 $27.99;单件固定成本 = 采购6.4 + 国内0.7 + 头程2.3 + 尾程/FBA 5.1 = 14.5。
const PROFIT: ProfitValues = {
  price: 27.99, cost: 6.40, domestic: 0.70, head: 2.30, lastMile: 5.10,
  commission: 15, refund: 2.5, ads: 13,
};
const TARGET_MARGIN = 22;
const ALL_IN_UNIT = PROFIT.cost + PROFIT.domestic + PROFIT.head + PROFIT.lastMile;   // 14.5

const profitR = calculateProfit(PROFIT);
const pricingCoef = priceCoefficients({ fixedCost: ALL_IN_UNIT, commission: PROFIT.commission, ads: PROFIT.ads, refund: PROFIT.refund, blocks: [] });
const pricingSolved = solvePrice(pricingCoef, { kind: "margin", value: TARGET_MARGIN });
const landedFees: LandedFee[] = [
  { id: "fee_freight", name: "海运头程（整柜）", amount: 1800, basis: "batch", dutiable: true },
  { id: "fee_ins", name: "货运保险", amount: 120, basis: "batch", dutiable: true },
];
const landedR = calculateLandedModel({
  unitCost: PROFIT.cost, units: 2000, fees: landedFees, fx: 1,
  dutyRate: 6.5, vatRate: 0, vatReclaimable: false, incoterm: "FOB",
});
const acosR = calculateAcos({ price: PROFIT.price, cost: ALL_IN_UNIT, commission: PROFIT.commission,
  refund: PROFIT.refund, margin: TARGET_MARGIN });
const dwRule = ruleByKey("express_5000");
const dwR = chargeableWeight({ length: 30, width: 11, height: 11, actual: 0.55 }, dwRule);

/**
 * 示例商品档案 = **真实档案的快照**(种子账号「32oz 保温运动水杯（翻盖吸管）」导出):
 * 10 条记录(五计算器 + 三工作台 + 研究 + 用户声音)、2 个竞品、13 条事实,以及两份
 * 挂在它名下的真实报告快照(见 example-reports.ts)。新用户拿到的示例因此是一份
 * 「什么都齐了」的档案,而不是空壳。
 * ASIN 留空 —— 不设虚构 ASIN,否则单商品模式深度研究会因假 ASIN 失败。
 */
export function buildExampleProduct(): Product {
  const p = JSON.parse(JSON.stringify(FIXTURE.product)) as Product;
  return {
    ...p,
    stableId: EXAMPLE_STABLE_ID,
    name: NAME, marketplace: MKT, asin: null,
    named: true,
    cloudId: null,
    updatedAt: Date.now(),
  };
}

/**
 * 注入默认示例:仅登录用户、当前一个商品都没有、且本机没种过时,注入一份。
 * 种过即置标记 —— 用户删掉后不再回灌。返回是否注入。
 */
export function ensureExampleSeed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(SEEDED_KEY)) return false;
    window.localStorage.setItem(SEEDED_KEY, "1");   // 无论种不种,只判一次
    const real = listProducts().filter((p) => p.name.trim() || (p.records?.length ?? 0) > 0 || p.project);
    if (real.length > 0) return false;              // 已有真实商品,不打扰
    importProduct(buildExampleProduct());
    if (isCloudEnabled()) schedulePush();
    return true;
  } catch { return false; }
}
