/**
 * 进口到岸成本引擎。纯函数。
 *
 * 相对旧版 calculators/landed-cost.ts 修掉了三件事：
 * 1. 旧版把 VAT 全额计入到岸成本，却在页面上写「VAT 可抵扣则非最终成本」——
 *    说明与计算脱节。这里分出三个口径，让「掏出去的钱」与「真实成本」各归各位。
 * 2. 旧版只有采购与头程两项费用，保险 / 清关 / 港口等只能写在免责声明里。
 *    这里是一张可增删的费用表，每项显式声明是否计入完税价。
 * 3. 旧版按单件算，但关税与批次费用天然是批次口径，分摊依据必须显式。
 *
 * 三口径：
 *   现金到岸  = 完税价 + 关税 + VAT + 不计入完税价的费用   → 这批货要掏多少钱
 *   经济到岸  = 现金到岸 − 可抵扣的 VAT                    → 真正沉淀为成本的部分
 *   单件到岸  = 经济到岸 ÷ 件数                            → 可填进利润计算器的那个数
 *
 * 税率一律由用户填写：HS 归类与原产地规则是判断题，不是查表题，
 * 猜一个 HS 再据此给出税率，等于给出一个看起来精确、实际可能错得离谱的数字。
 */

export type Incoterm = "EXW" | "FOB" | "CIF" | "DAP" | "DDP";

export type IncotermSpec = {
  label: string;
  /** 供应商报价通常已含哪些，用于提示重复计费。 */
  includesFreight: boolean;
  includesInsurance: boolean;
  /** 关税与进口 VAT 是否由供应商承担（DDP）。 */
  sellerPaysImportTax: boolean;
  note: string;
};

export const INCOTERMS: Record<Incoterm, IncotermSpec> = {
  EXW: {
    label: "EXW 工厂交货",
    includesFreight: false, includesInsurance: false, sellerPaysImportTax: false,
    note: "报价仅到工厂，国内段、出口报关、国际运费、保险、进口税费都由你承担，费用项要填全。",
  },
  FOB: {
    label: "FOB 装运港交货",
    includesFreight: false, includesInsurance: false, sellerPaysImportTax: false,
    note: "报价含国内段与出口报关，国际运费、保险与进口税费由你承担。",
  },
  CIF: {
    label: "CIF 成本加运保费",
    includesFreight: true, includesInsurance: true, sellerPaysImportTax: false,
    note: "报价已含国际运费与保险，别再单独添加一遍；进口关税与 VAT 仍由你承担。",
  },
  DAP: {
    label: "DAP 目的地交货",
    includesFreight: true, includesInsurance: true, sellerPaysImportTax: false,
    note: "报价含运至目的地，但进口关税与 VAT 仍由你承担。",
  },
  DDP: {
    label: "DDP 完税后交货",
    includesFreight: true, includesInsurance: true, sellerPaysImportTax: true,
    note: "报价已含进口关税与 VAT，本工具因此不再另计税费。注意：税单不在你名下时，VAT 通常无法由你抵扣。",
  },
};

/* ---------------- 官方税率查询入口 ---------------- */

export type TariffSource = { region: string; name: string; url: string };

/**
 * 只给查询入口，不代查、不缓存税率。
 * 真正难的不是找税率表，而是 HS 归类本身是判断题：同一件商品按材质 / 用途 / 成分
 * 可能归到不同编码，税率差好几倍。归类请以报关行与目的国海关的裁定为准。
 */
export const TARIFF_SOURCES: TariffSource[] = [
  { region: "美国", name: "USITC HTS 税则查询", url: "https://hts.usitc.gov" },
  { region: "欧盟", name: "European Commission TARIC", url: "https://ec.europa.eu/taxation_customs/dds2/taric/" },
  { region: "中国", name: "中国海关总署", url: "http://www.customs.gov.cn" },
];

/* ---------------- 费用表 ---------------- */

export type FeeBasis = "batch" | "per_unit";

export type LandedFee = {
  id: string;
  name: string;
  amount: number;     // 本币
  basis: FeeBasis;    // 批次总额 or 每件
  dutiable: boolean;  // 是否计入完税价（决定要不要为它交关税/VAT）
};

export type FeePreset = Omit<LandedFee, "id"> & { key: string; hint: string };

/**
 * dutiable 的默认值按「大多数国家以 CIF 计税」设：国际运费与保险计入完税价，
 * 清关代理费、港口杂费、银行手续费不计入。
 * 但美国通常按 FOB 计税（国际运保费不计入完税价）——此时把运费/保险的
 * 「计入完税价」关掉即可。以目的国海关口径为准。
 */
export const FEE_PRESETS: FeePreset[] = [
  { key: "freight", name: "国际运费", amount: 8, basis: "batch", dutiable: true, hint: "海运/空运/快递的国际段" },
  { key: "insurance", name: "运输保险", amount: 1, basis: "batch", dutiable: true, hint: "通常计入完税价" },
  { key: "domestic", name: "国内段运费", amount: 2, basis: "batch", dutiable: true, hint: "工厂到装运港" },
  { key: "customs", name: "清关 / 报关代理费", amount: 3, basis: "batch", dutiable: false, hint: "进口后发生，通常不计入完税价" },
  { key: "port", name: "港口 / 码头杂费", amount: 2, basis: "batch", dutiable: false, hint: "THC、文件费等" },
  { key: "bank", name: "银行手续费 / 汇损", amount: 1, basis: "batch", dutiable: false, hint: "电汇费、购汇点差" },
  { key: "custom_fee", name: "自定义费用", amount: 0, basis: "batch", dutiable: false, hint: "" },
];

let feeSeq = 0;
export function feeFromPreset(preset: FeePreset): LandedFee {
  feeSeq += 1;
  return {
    id: `${preset.key}-${Date.now()}-${feeSeq}`,
    name: preset.name,
    amount: preset.amount,
    basis: preset.basis,
    dutiable: preset.dutiable,
  };
}

/* ---------------- 计算 ---------------- */

export type LandedInput = {
  unitCost: number;   // 单件采购价（本币）
  units: number;      // 本批件数
  fees: LandedFee[];
  fx: number;         // 1 本币 = ? 目标币
  dutyRate: number;   // %
  vatRate: number;    // %
  vatReclaimable: boolean;
  incoterm: Incoterm;
};

export type LandedBreakdown = {
  goodsLocal: number;        // 货值（本币，批次）
  dutiableFeesLocal: number; // 计入完税价的费用（本币，批次）
  otherFeesLocal: number;    // 不计入完税价的费用（本币，批次）
  customsValue: number;      // 完税价（目标币）
  dutyAmount: number;
  vatBase: number;
  vatAmount: number;
  vatReclaim: number;        // 可抵扣的 VAT（目标币）
  cashLanded: number;        // 现金到岸（目标币，批次）
  economicLanded: number;    // 经济到岸（目标币，批次）
  perUnitLanded: number;     // 单件到岸（目标币）
  sellerPaysImportTax: boolean;
};

const feeBatch = (f: LandedFee, units: number): number =>
  f.basis === "batch" ? f.amount : f.amount * Math.max(0, units);

export function calculateLandedModel(input: LandedInput): LandedBreakdown {
  const units = Math.max(0, input.units);
  const fx = Math.max(0, input.fx);
  const spec = INCOTERMS[input.incoterm];

  const goodsLocal = Math.max(0, input.unitCost) * units;
  let dutiableFeesLocal = 0;
  let otherFeesLocal = 0;
  for (const f of input.fees) {
    const amt = feeBatch(f, units);
    if (f.dutiable) dutiableFeesLocal += amt;
    else otherFeesLocal += amt;
  }

  const customsValue = (goodsLocal + dutiableFeesLocal) * fx;

  // DDP：税费已含在采购价里，不再另计，否则就是重复计费。
  const dutyAmount = spec.sellerPaysImportTax ? 0 : customsValue * input.dutyRate / 100;
  const vatBase = customsValue + dutyAmount;
  const vatAmount = spec.sellerPaysImportTax ? 0 : vatBase * input.vatRate / 100;
  // DDP 下税单不在你名下，通常无法抵扣。
  const vatReclaim = input.vatReclaimable && !spec.sellerPaysImportTax ? vatAmount : 0;

  const cashLanded = customsValue + otherFeesLocal * fx + dutyAmount + vatAmount;
  const economicLanded = cashLanded - vatReclaim;
  const perUnitLanded = units > 0 ? economicLanded / units : 0;

  return {
    goodsLocal, dutiableFeesLocal, otherFeesLocal,
    customsValue, dutyAmount, vatBase, vatAmount, vatReclaim,
    cashLanded, economicLanded, perUnitLanded,
    sellerPaysImportTax: spec.sellerPaysImportTax,
  };
}

/**
 * 目标售价 = 单件到岸 ÷ (1 − 目标净利率)。
 * 只覆盖到岸成本与净利，未扣平台佣金与广告 —— 自有渠道适用，
 * 平台售价请用 pricing-sim.ts，两者口径不同。
 */
export function targetPrice(perUnitLanded: number, marginPct: number): number | null {
  const denom = 1 - marginPct / 100;
  if (!(denom > 0)) return null;
  const p = perUnitLanded / denom;
  return Number.isFinite(p) && p > 0 ? p : null;
}

/* ---------------- 情景对比 ---------------- */

export type LandedScenarioDiff = {
  a: LandedBreakdown;
  b: LandedBreakdown;
  perUnitDelta: number;   // b − a（负 = B 更便宜）
  cashDelta: number;
};

export function compareLanded(a: LandedInput, b: LandedInput): LandedScenarioDiff {
  const ra = calculateLandedModel(a);
  const rb = calculateLandedModel(b);
  return {
    a: ra, b: rb,
    perUnitDelta: rb.perUnitLanded - ra.perUnitLanded,
    cashDelta: rb.cashLanded - ra.cashLanded,
  };
}

/* ---------------- 口径体检 ---------------- */

export type LandedWarning = { id: string; level: "warn" | "info"; text: string };

/** 只提醒、不阻断。到岸成本的坑多半在口径与重复计费，不在算术。 */
export function detectLandedIssues(input: LandedInput, r: LandedBreakdown): LandedWarning[] {
  const out: LandedWarning[] = [];
  const spec = INCOTERMS[input.incoterm];
  const keyOf = (f: LandedFee) => f.id.split("-")[0];
  const keys = new Set(input.fees.map(keyOf));

  // Incoterm 已含运保费却又单独添加 → 重复计费。
  if (spec.includesFreight && keys.has("freight")) {
    out.push({
      id: "dup-freight", level: "warn",
      text: `Incoterm 为 ${input.incoterm}，采购价通常已含国际运费，你又单独添加了「国际运费」，可能重复计费。`,
    });
  }
  if (spec.includesInsurance && keys.has("insurance")) {
    out.push({
      id: "dup-insurance", level: "warn",
      text: `Incoterm 为 ${input.incoterm}，采购价通常已含运输保险，你又单独添加了「运输保险」，可能重复计费。`,
    });
  }
  if (spec.sellerPaysImportTax && (input.dutyRate > 0 || input.vatRate > 0)) {
    out.push({
      id: "ddp-tax", level: "info",
      text: "DDP 下关税与 VAT 已含在采购价里，本工具不再另计；填写的税率仅供参考，不参与计算。",
    });
  }
  if (spec.sellerPaysImportTax && input.vatReclaimable) {
    out.push({
      id: "ddp-vat-reclaim", level: "warn",
      text: "DDP 下进口税单通常不在你名下，VAT 一般无法由你抵扣。若供应商未转开合规发票，请勿按可抵扣估算。",
    });
  }
  if (input.vatReclaimable && r.vatReclaim > 0) {
    out.push({
      id: "vat-reclaim", level: "info",
      text: `已按可抵扣处理：${r.vatAmount.toFixed(2)} 的进口 VAT 不计入经济到岸成本。抵扣需要合规进项发票与当地税号，且占用现金到退税为止——现金到岸仍是 ${r.cashLanded.toFixed(2)}。`,
    });
  }
  if (input.units <= 0) {
    out.push({ id: "no-units", level: "warn", text: "批次件数为 0，无法分摊出单件到岸成本。" });
  }
  if (r.dutiableFeesLocal === 0 && input.fees.length > 0) {
    out.push({
      id: "no-dutiable-fee", level: "info",
      text: "当前没有任何费用计入完税价。美国通常按 FOB 计税（国际运保费不计入）属正常；欧盟等按 CIF 计税的地区，运费与保险通常应计入。以目的国海关口径为准。",
    });
  }
  return out;
}
