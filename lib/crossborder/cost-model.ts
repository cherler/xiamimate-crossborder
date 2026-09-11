/**
 * 可组合成本模型引擎。
 * 在「标准贡献利润」(calculateProfit) 之上，叠加可添加的成本/收入积木，
 * 得到「调整后估算利润」。标准层仍是唯一真相源，无积木时结果完全不变。
 *
 * 六种积木类型覆盖绝大多数费用的计费方式；每种把输入折算成「每件」影响。
 * 纯函数、无副作用，前端与测试共用。
 */

import { calculateProfit, round1, round2, type ProfitResult, type ProfitValues } from "./calculators/profit";

export type BlockType =
  | "per_unit"       // 每件固定金额
  | "per_order"      // 每单固定金额（÷ 每单件数）
  | "pct_sales"      // 售价百分比
  | "monthly_alloc"  // 月度费用分摊（÷ 预计月销量）
  | "batch_alloc"    // 批次/一次性费用分摊（÷ 预计分摊件数）
  | "probabilistic"; // 概率损失（概率 × 单次损失）

export type CostBlock = {
  id: string;
  name: string;
  kind: "cost" | "income";
  type: BlockType;
  params: Record<string, number>;
};

export type BlockField = { key: string; label: string; prefix?: string; suffix?: string; hint?: string };

export type BlockTypeSpec = {
  label: string;
  allocationNote: string;   // 计费/分摊依据说明（治「精确的错误」）
  needsBasis: boolean;      // 是否存在分摊依据需要显式提醒
  fields: BlockField[];
};

export const BLOCK_TYPES: Record<BlockType, BlockTypeSpec> = {
  per_unit: {
    label: "每件固定金额",
    allocationNote: "直接计入每件成本。",
    needsBasis: false,
    fields: [{ key: "amount", label: "每件金额", prefix: "$" }],
  },
  per_order: {
    label: "每单固定金额",
    allocationNote: "每单费用 ÷ 每单件数 → 每件。",
    needsBasis: true,
    fields: [
      { key: "amount", label: "每单金额", prefix: "$" },
      { key: "unitsPerOrder", label: "每单件数", hint: "把每单费用摊到每件" },
    ],
  },
  pct_sales: {
    label: "售价百分比",
    allocationNote: "按售价百分比计。",
    needsBasis: false,
    fields: [{ key: "pct", label: "占售价比例", suffix: "%" }],
  },
  monthly_alloc: {
    label: "月度费用分摊",
    allocationNote: "月度总费用 ÷ 预计月销量 → 每件。销量估高会低估成本。",
    needsBasis: true,
    fields: [
      { key: "monthly", label: "月度总费用", prefix: "$" },
      { key: "monthlyUnits", label: "预计月销量", hint: "分摊依据" },
    ],
  },
  batch_alloc: {
    label: "批次费用分摊",
    allocationNote: "总投入 ÷ 预计分摊件数 → 每件。件数估高会低估成本。",
    needsBasis: true,
    fields: [
      { key: "total", label: "一次性总投入", prefix: "$" },
      { key: "batchUnits", label: "预计分摊件数", hint: "分摊依据" },
    ],
  },
  probabilistic: {
    label: "概率损失",
    allocationNote: "发生概率 × 单次平均损失 → 每件预期损失。",
    needsBasis: false,
    fields: [
      { key: "probPct", label: "发生概率", suffix: "%" },
      { key: "lossPerEvent", label: "单次平均损失", prefix: "$" },
    ],
  },
};

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** 单块折算到「每件」的正向金额（不含成本/收入符号）。 */
export function blockPerUnit(block: CostBlock, ctx: { price: number }): number {
  const p = block.params;
  switch (block.type) {
    case "per_unit": return num(p.amount);
    case "per_order": return num(p.unitsPerOrder) > 0 ? num(p.amount) / num(p.unitsPerOrder) : 0;
    case "pct_sales": return ctx.price > 0 ? ctx.price * num(p.pct) / 100 : 0;
    case "monthly_alloc": return num(p.monthlyUnits) > 0 ? num(p.monthly) / num(p.monthlyUnits) : 0;
    case "batch_alloc": return num(p.batchUnits) > 0 ? num(p.total) / num(p.batchUnits) : 0;
    case "probabilistic": return num(p.probPct) / 100 * num(p.lossPerEvent);
    default: return 0;
  }
}

export type BlockImpact = { id: string; name: string; type: BlockType; amount: number };

export type AdjustedResult = {
  standard: ProfitResult;   // = calculateProfit(base)，标准贡献利润
  impacts: BlockImpact[];   // 每块对单件利润的有符号影响（成本为负、收入为正）
  netDelta: number;         // 所有积木合计（负 = 净成本）
  adjustedProfit: number;   // 标准利润 + netDelta
  adjustedMargin: number;   // 调整后净利率 %
};

export function computeAdjusted(base: ProfitValues, blocks: CostBlock[]): AdjustedResult {
  const standard = calculateProfit(base);
  const ctx = { price: base.price };
  const impacts: BlockImpact[] = blocks.map((b) => {
    const perUnit = blockPerUnit(b, ctx);
    const amount = round2(b.kind === "income" ? perUnit : -perUnit);
    return { id: b.id, name: b.name, type: b.type, amount };
  });
  const netDelta = round2(impacts.reduce((sum, i) => sum + i.amount, 0));
  const adjustedProfit = round2(standard.profit + netDelta);
  const adjustedMargin = base.price > 0 ? round1(adjustedProfit / base.price * 100) : 0;
  return { standard, impacts, netDelta, adjustedProfit, adjustedMargin };
}

/* ---------------- 预设模块库（MVP：对应「本次尚未计入」） ---------------- */

export type CostPreset = {
  key: string;
  name: string;
  category: string;
  type: BlockType;
  kind: "cost" | "income";
  params: Record<string, number>;
  note?: string;
};

export const COST_PRESETS: CostPreset[] = [
  { key: "monthly_storage", name: "月度仓储费", category: "仓储与库存", type: "monthly_alloc", kind: "cost", params: { monthly: 1200, monthlyUnits: 600 } },
  { key: "long_term_storage", name: "长期仓储附加费", category: "仓储与库存", type: "per_unit", kind: "cost", params: { amount: 0.3 } },
  { key: "coupon_promo", name: "优惠券 / 促销费用", category: "促销与销售", type: "pct_sales", kind: "cost", params: { pct: 5 }, note: "按有效优惠占销售额的比例计（已折算兑换率）。" },
  { key: "abnormal_return", name: "异常退货与弃件损耗", category: "退货与售后", type: "probabilistic", kind: "cost", params: { probPct: 5, lossPerEvent: 8 } },
  { key: "fx_loss", name: "汇率波动损失", category: "税费与汇率", type: "pct_sales", kind: "cost", params: { pct: 1.5 } },
  { key: "custom_cost", name: "自定义成本", category: "自定义", type: "per_unit", kind: "cost", params: { amount: 0 } },
  { key: "custom_income", name: "自定义收入", category: "自定义", type: "per_unit", kind: "income", params: { amount: 0 } },
];

/* ---------------- 重复计费 / 口径重叠提醒 ---------------- */

export type ConflictWarning = { id: string; level: "warn" | "info"; text: string };

/** 检测常见的重复计费与口径重叠（risk #2）。纯规则，不阻断，只提醒。 */
/**
 * 平台标价是否含销项税(增值税)。
 *
 * 欧盟/英国站的展示价是含税价 —— 那部分是替税务局代收的,不是卖家的收入。
 * 美国由平台代收代缴销售税,不进卖家的账,也不算成本;日本/加拿大/澳洲的
 * 平台代缴规则各不相同,这里只对最确定、且差额最大的欧盟与英国给出提醒。
 */
const VAT_INCLUSIVE_MARKETS = new Set([
  "amazon-uk", "amazon-de", "amazon-fr", "amazon-it", "amazon-es", "tiktok-uk",
]);

export function detectVatIssues(marketplace: string | null | undefined,
                                values: { price: number; vatRate?: number }): ConflictWarning[] {
  const mk = (marketplace || "").toLowerCase();
  if (!VAT_INCLUSIVE_MARKETS.has(mk)) return [];
  const rate = values.vatRate ?? 0;
  if (rate > 0) return [];
  /**
   * 只提醒、不替用户填税率:各国税率不同、还有低税率类目与 B2B 反向征收,
   * 猜一个数比不猜更危险。但**必须**说清楚不填的后果,并把高估幅度算给他看 ——
   * 默认 0 意味着不知情的人根本不会去动这个字段,只提供输入框等于没做。
   */
  const assumed = 20;
  const overstate = values.price * (assumed / (100 + assumed));
  return [{
    id: "vat-missing", level: "warn",
    text: `这个站点的平台标价通常**含增值税**,而「销项税率」现在填的是 0 —— `
        + `等于把代收的税款算成了你的销售额。若按 ${assumed}% 计,每单会高估约 `
        + `$${overstate.toFixed(2)} 的收入,利润率虚高。请按你所在站点与类目的实际税率填写`
        + `(不确定就问你的税务代理;若你是不注册 VAT 的小额直邮,可保持 0)。`,
  }];
}

export function detectConflicts(blocks: CostBlock[], base: { refund: number }): ConflictWarning[] {
  const out: ConflictWarning[] = [];
  const keys = new Set(blocks.map((b) => b.id.split("-")[0]));

  if (keys.has("abnormal_return") && base.refund > 0) {
    out.push({
      id: "return-overlap", level: "warn",
      text: `参数里已有「退款损耗 ${base.refund}%」，「异常退货与弃件损耗」可能与其口径重叠，请确认不要重复计入。`,
    });
  }
  if (keys.has("monthly_storage") && keys.has("long_term_storage")) {
    out.push({
      id: "storage-overlap", level: "info",
      text: "「月度仓储费」与「长期仓储附加费」都属仓储费用，注意不要把同一笔仓储成本计两次。",
    });
  }
  const names = blocks.map((b) => b.name.trim()).filter(Boolean);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) {
    out.push({
      id: `dup-${dup}`, level: "warn",
      text: `存在同名模块「${dup}」，可能重复计费，请确认是否重复添加。`,
    });
  }
  return out;
}

let blockSeq = 0;
export function blockFromPreset(preset: CostPreset): CostBlock {
  blockSeq += 1;
  return {
    id: `${preset.key}-${Date.now()}-${blockSeq}`,
    name: preset.name,
    kind: preset.kind,
    type: preset.type,
    params: { ...preset.params },
  };
}
