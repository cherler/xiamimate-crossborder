/**
 * 共享商品经营模型。
 * 利润 / 定价 / ACoS 读写同一份模型 —— 用户在利润计算器里填过的售价、成本、
 * 佣金、广告、目标净利率与成本积木，进入定价或广告工具时不必重填。
 *
 * 存储在 localStorage（不上传），提供 SSR 安全的读写与各工具需要的派生值。
 * 纯数据 + 存取函数，前端与测试共用。
 */

import { DEFAULT_PROFIT_VALUES, type ProfitField, type ProfitValues } from "./calculators/profit";
import { type CostBlock } from "./cost-model";
import * as store from "./products";

export const PRODUCT_MODEL_VERSION = 1;

export type ProductModel = ProfitValues & {
  target: number;       // 目标净利率 %
  blocks: CostBlock[];  // 成本积木
  version: number;
  updatedAt: number;
};

const PROFIT_KEYS = Object.keys(DEFAULT_PROFIT_VALUES) as ProfitField[];

export function defaultModel(): ProductModel {
  return { ...DEFAULT_PROFIT_VALUES, target: 20, blocks: [], version: PRODUCT_MODEL_VERSION, updatedAt: 0 };
}

/** 商品财务参数不接受负值:负售价/负成本/负费率都无意义。夹到 ≥0,
 *  从源头拦截脏值(压测/误输入)存进档案、再跨工具「填入」污染别处(#P6)。 */
function nonNeg(x: number): number { return Number.isFinite(x) && x > 0 ? x : 0; }

/** 从利润页状态构建模型(存档前统一夹正,负值归 0)。 */
export function modelFromProfit(values: ProfitValues, target: number, blocks: CostBlock[]): ProductModel {
  const clean = { ...values };
  for (const k of PROFIT_KEYS) clean[k] = nonNeg(clean[k] ?? 0);
  return { ...clean, target: nonNeg(target), blocks, version: PRODUCT_MODEL_VERSION, updatedAt: Date.now() };
}

/** 取模型里的利润参数子集。 */
export function toProfitValues(model: ProductModel): ProfitValues {
  const out = { ...DEFAULT_PROFIT_VALUES };
  for (const k of PROFIT_KEYS) out[k] = model[k] ?? 0;
  return out;
}

/**
 * 单件基础成本（采购 + 物流/履约）——定价的总成本、ACoS 的单件成本、
 * 利润页的广告红线都用它，口径只此一处。
 * 收窄到用得着的四个字段，好让利润页直接传 ProfitValues 进来。
 */
export function baseCost(v: Pick<ProfitValues, "cost" | "domestic" | "head" | "lastMile">): number {
  return v.cost + v.domestic + v.head + v.lastMile;
}

function num(v: unknown, fallback: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function sanitizeBlocks(raw: unknown): CostBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: CostBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.type !== "string") continue;
    const params: Record<string, number> = {};
    if (r.params && typeof r.params === "object") {
      for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) params[k] = num(v, 0);
    }
    out.push({
      id: r.id,
      name: typeof r.name === "string" ? r.name : "自定义",
      kind: r.kind === "income" ? "income" : "cost",
      type: r.type as CostBlock["type"],
      params,
    });
  }
  return out;
}

export function sanitizeModel(raw: unknown): ProductModel {
  const base = defaultModel();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  for (const k of PROFIT_KEYS) base[k] = nonNeg(num(r[k], base[k] ?? 0));
  base.target = nonNeg(num(r.target, base.target));
  base.blocks = sanitizeBlocks(r.blocks);
  base.version = num(r.version, PRODUCT_MODEL_VERSION);
  base.updatedAt = num(r.updatedAt, 0);
  return base;
}

/* ---------------- 存取:委托到商品实体仓(products.ts) ----------------
 * 财务模型不再是独立的 localStorage 单份,而是「当前商品」的 finance 字段。
 * 调用方(5 个计算器)签名不变;登录后随商品实体防抖同步云端。
 * 与 products.ts 互相引用:双方都只在函数体内取用对方,ESM 循环引用安全。
 */

export function readProductModel(): ProductModel | null {
  if (typeof window === "undefined") return null;
  return store.currentFinance();
}

export function writeProductModel(model: ProductModel): void {
  if (typeof window === "undefined") return;
  store.writeCurrentFinance(model);
  if (store.isCloudEnabled()) store.schedulePush();
}

export function clearProductModel(): void {
  if (typeof window === "undefined") return;
  store.resetCurrentFinance();
  if (store.isCloudEnabled()) store.schedulePush();
}
