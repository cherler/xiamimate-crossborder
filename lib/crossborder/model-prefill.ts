/**
 * 商品模型 → 各工具表单的映射。
 * 利润计算器是模型的唯一写入方；定价 / ACoS 只读，且必须经用户确认才填入。
 *
 * 这里只放纯逻辑（判断值不值得提示、字段怎么映射、摘要怎么算），
 * 交互与存取分别在 app/crossborder/tools/model-prefill.tsx 与 product-model.ts。
 */

import { DEFAULT_PROFIT_VALUES, type ProfitField } from "./calculators/profit";
import { PRODUCT_MODEL_VERSION, baseCost, defaultModel, type ProductModel } from "./product-model";

export type PrefillTool = "pricing" | "acos";

const PROFIT_KEYS = Object.keys(DEFAULT_PROFIT_VALUES) as ProfitField[];

/**
 * 模型是否仍是一套未改动的默认值（只比业务字段，忽略 version / updatedAt）。
 * 注意：不能用 updatedAt 判空——利润页一挂载就会写入一份带时间戳的默认模型，
 * 光是「访问过利润页」并不代表用户填过东西。
 */
export function isDefaultModel(model: ProductModel): boolean {
  const d = defaultModel();
  if (model.blocks.length > 0) return false;
  if (model.target !== d.target) return false;
  return PROFIT_KEYS.every((k) => model[k] === d[k]);
}

/** 是否值得向用户提示「可以复用利润计算器的模型」。 */
export function shouldOfferModel(model: ProductModel | null): boolean {
  if (!model) return false;
  if (model.version !== PRODUCT_MODEL_VERSION) return false; // 未来版本：宁可不提示，也不填错数
  return !isDefaultModel(model);
}

/**
 * 模型 → 目标工具的字段值。字段命名的唯一真相源。
 * 两个工具的「成本」口径都不是模型里的 cost（那只是采购价），必须走 baseCost；
 * 「目标净利率」在模型里叫 target，在这两个工具里叫 margin。
 */
export function prefillFromModel(model: ProductModel, tool: PrefillTool): Record<string, number> {
  const cost = baseCost(model);
  if (tool === "pricing") {
    // 定价页自己有退款损耗与成本积木，能完整承接模型，不必丢字段。
    return { cost, targetValue: model.target, commission: model.commission, ads: model.ads,
             refund: model.refund, vatRate: model.vatRate ?? 0,
             affiliateRate: model.affiliateRate ?? 0 };
  }
  // ACoS 页此前**丢掉了 refund**,而它是按售价百分比计的必然成本 ——
  // 保本 ACoS 因此恰好高出退款率那么多个点,同一个商品在两个工具里保本线不一致。
  //
  // **vatRate 是同一个坑的第二次**:它在模型里、利润引擎也算了,却在这条
  // 输送管道上被丢掉。实测英国站 20% VAT:保本 ACoS 58.1% vs 真值 41.5%,
  // 定价页保本价 10.47 vs 真值 13.68 —— 照定价页定价每单实亏 3.21。
  // 而错的方向全是**多算利润**,正好违反引擎自己写的「宁可少算,不能多算」。
  return { price: model.price, cost, commission: model.commission,
           refund: model.refund, margin: model.target, vatRate: model.vatRate ?? 0,
           // 达人佣金必须跟过来 —— 与上面 refund 是同一个坑:
           // 按售价百分比计的必然成本,漏了保本线就偏高,照着投每单在亏。
           affiliateRate: model.affiliateRate ?? 0 };
}

/** 该工具能不能原样承接成本积木。承接不了的（ACoS）必须如实说明未计入。 */
export function supportsBlocks(tool: PrefillTool): boolean {
  return tool === "pricing";
}

export type ModelSummary = {
  totalCost: number;
  target: number;
  price: number;
  blockNames: string[];
  updatedAt: number;
};

export function summarizeModel(model: ProductModel): ModelSummary {
  return {
    totalCost: baseCost(model),
    target: model.target,
    price: model.price,
    blockNames: model.blocks.map((b) => b.name),
    updatedAt: model.updatedAt,
  };
}

/** 成本积木不参与复用，横幅需要如实说明未计入哪些。名称过多时截断。 */
export function describeExcludedBlocks(names: string[], max = 3): string {
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join("、");
  const rest = names.length > max ? ` 等 ${names.length} 项` : "";
  return `未含 ${names.length} 个成本模块（${shown}${rest}）—— 需自行判断是否计入`;
}

/** 「3 天前更新」——让用户自己判断模型新旧，而不是替他设一个过期时间。 */
export function describeAge(updatedAt: number, now = Date.now()): string {
  if (!updatedAt) return "";
  const mins = Math.floor((now - updatedAt) / 60000);
  if (mins < 1) return "刚刚更新";
  if (mins < 60) return `${mins} 分钟前更新`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}
