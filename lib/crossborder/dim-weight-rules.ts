/**
 * 计费重规则引擎。纯函数。
 *
 * 真实计费重不只是「体积重与实重取大」——承运商还会对尺寸取整、对重量进位、
 * 并设最低计费重。这三步往往比体积重本身更能解释「为什么账单比我算的高」，
 * 所以引擎把每一步多算了多少 kg 都单独返回，而不是只给一个最终数字。
 *
 * 关于预设值的诚实声明：
 * 下面的规则是行业常见档位，不是从各承运商资费表实时同步来的，且资费会变、
 * 不同代理/合同价的口径也不同。因此每条都带 source 与 updated，且 UI 必须允许
 * 手动覆盖。任何一条与你的实际资费不符时，以承运商为准，不要以本表为准。
 */

export type RoundMode = "none" | "up" | "nearest";

export type CarrierRule = {
  key: string;
  name: string;
  region: string;
  divisor: number;         // 体积重除数，cm³/kg
  dimRound: RoundMode;     // 尺寸取整到 1 cm
  weightStep: number;      // 计费重进位步长 kg（0 = 不进位）
  minChargeable: number;   // 最低计费重 kg
  note: string;
  source: string;
  updated: string;
};

/** 常见档位，非实时资费。UI 必须允许改。 */
export const CARRIER_RULES: CarrierRule[] = [
  {
    key: "express_5000",
    name: "国际快递（常见档）",
    region: "国际",
    divisor: 5000, dimRound: "nearest", weightStep: 0.5, minChargeable: 0.5,
    note: "DHL / FedEx / UPS 等国际快递常用 5000 除数、0.5kg 进位。各家对尺寸取整与超长超围的处理不同。",
    source: "以承运商当期资费表 / 你的代理合同价为准",
    updated: "2026-07",
  },
  {
    key: "air_6000",
    name: "空运（常见档）",
    region: "国际",
    divisor: 6000, dimRound: "nearest", weightStep: 0.5, minChargeable: 1,
    note: "空运常用 6000 除数。整票与拼箱、不同航司的最低计费重差异较大。",
    source: "以货代报价为准",
    updated: "2026-07",
  },
  {
    key: "line_8000",
    name: "专线 / 海运（常见档）",
    region: "国际",
    divisor: 8000, dimRound: "none", weightStep: 0.1, minChargeable: 0,
    note: "部分专线用 8000 或更大除数，规则由服务商自定，差异最大。",
    source: "以专线服务商报价为准",
    updated: "2026-07",
  },
  {
    key: "fba_us",
    name: "Amazon FBA 美国",
    region: "美国",
    divisor: 5000, dimRound: "none", weightStep: 0, minChargeable: 0,
    note: "FBA 按尺寸分档收固定档位费，不是「计费重 × 单价」——这里的计费重只用于判断落在哪一档，不能直接乘费率。美国站官方口径是 139 in³/lb（≈ 5021 cm³/kg，此处按 5000 近似），且仅对大件适用。",
    source: "以 Amazon 当期 FBA 配送费率表为准",
    updated: "2026-07",
  },
  {
    key: "fba_eu",
    name: "Amazon FBA 欧洲",
    region: "欧洲",
    divisor: 5000, dimRound: "none", weightStep: 0, minChargeable: 0,
    note: "同为尺寸分档收费，不按计费重乘费率。欧洲各站点分档与费率不同。",
    source: "以 Amazon 当期 FBA 配送费率表为准",
    updated: "2026-07",
  },
  {
    key: "custom",
    name: "自定义",
    region: "—",
    divisor: 5000, dimRound: "none", weightStep: 0, minChargeable: 0,
    note: "按你的实际资费填写。这是唯一能保证与账单一致的用法。",
    source: "你自己的资费",
    updated: "—",
  },
];

export function ruleByKey(key: string): CarrierRule {
  return CARRIER_RULES.find((r) => r.key === key) ?? CARRIER_RULES[CARRIER_RULES.length - 1];
}

/** FBA 按尺寸分档计费，计费重不能直接乘费率。 */
export function billsBySizeTier(rule: Pick<CarrierRule, "key">): boolean {
  return rule.key.startsWith("fba_");
}

/* ---------------- 计费重 ---------------- */

function roundDim(v: number, mode: RoundMode): number {
  if (!(v > 0)) return 0;
  if (mode === "up") return Math.ceil(v);
  if (mode === "nearest") return Math.round(v);
  return v;
}

/** 按步长向上进位。step<=0 表示不进位。 */
function stepUp(v: number, step: number): number {
  if (!(step > 0)) return v;
  return Math.ceil(v / step - 1e-9) * step;
}

export type ChargeableInput = {
  length: number;
  width: number;
  height: number;
  actual: number;
};

export type ChargeableResult = {
  dims: { length: number; width: number; height: number };  // 取整后
  volumetric: number;       // 体积重（进位前）
  rawChargeable: number;    // max(实重, 体积重)，进位前
  chargeable: number;       // 最终计费重
  useVolumetric: boolean;
  bumpedByStep: number;     // 因进位多算的 kg
  bumpedByMin: number;      // 因最低计费重多算的 kg
};

export function chargeableWeight(input: ChargeableInput, rule: CarrierRule): ChargeableResult {
  const length = roundDim(input.length, rule.dimRound);
  const width = roundDim(input.width, rule.dimRound);
  const height = roundDim(input.height, rule.dimRound);

  const volumetric = rule.divisor > 0 ? (length * width * height) / rule.divisor : 0;
  const actual = Math.max(0, input.actual);
  const rawChargeable = Math.max(actual, volumetric);

  const stepped = stepUp(rawChargeable, rule.weightStep);
  const chargeable = Math.max(stepped, rule.minChargeable);

  return {
    dims: { length, width, height },
    volumetric,
    rawChargeable,
    chargeable,
    useVolumetric: volumetric > actual,
    bumpedByStep: stepped - rawChargeable,
    bumpedByMin: chargeable - stepped,
  };
}

/* ---------------- 包装方案 A/B 对比 ---------------- */

export type PackCompare = {
  a: ChargeableResult;
  b: ChargeableResult;
  savedKg: number;              // a.chargeable − b.chargeable（正 = B 更省）
  savedPerUnit: number | null;  // 需要费率
  savedPerMonth: number | null; // 需要费率与月发货量
};

export function comparePacking(
  a: ChargeableInput,
  b: ChargeableInput,
  rule: CarrierRule,
  ratePerKg?: number,
  monthlyUnits?: number,
): PackCompare {
  const ra = chargeableWeight(a, rule);
  const rb = chargeableWeight(b, rule);
  const savedKg = ra.chargeable - rb.chargeable;

  // FBA 按档位收费，省下的 kg 不能直接乘费率。
  const rateUsable = ratePerKg !== undefined && ratePerKg > 0 && !billsBySizeTier(rule);
  const savedPerUnit = rateUsable ? savedKg * ratePerKg : null;
  const savedPerMonth =
    savedPerUnit !== null && monthlyUnits !== undefined && monthlyUnits > 0
      ? savedPerUnit * monthlyUnits
      : null;

  return { a: ra, b: rb, savedKg, savedPerUnit, savedPerMonth };
}

/* ---------------- 提醒 ---------------- */

export type PackWarning = { id: string; level: "warn" | "info"; text: string };

export function detectPackIssues(rule: CarrierRule, r: ChargeableResult, cmp: PackCompare | null,
                                 pack?: ChargeableInput): PackWarning[] {
  const out: PackWarning[] = [];

  /**
   * 单位似真性:选了美国承运商,却填着一组「像英寸」的数。
   *
   * 亚马逊后台给的尺寸是英寸、重量是磅,而字段标的是 cm/kg。照抄 12×8×6 in
   * 会算出 1.5kg,真值(30.5×20.3×15.2 cm)是 2.0kg —— 低估 25% 且毫无提示。
   * 这里只提醒、不改数:判断依据是「三边都很小且实重也很轻」,
   * 真有这么小的包裹时提示无害,填错时则正好戳中。
   */
  if (pack && rule.region === "美国") {
    const dims = [pack.length, pack.width, pack.height].filter((d) => d > 0);
    if (dims.length === 3 && dims.every((d) => d <= 25) && pack.actual > 0 && pack.actual <= 5) {
      out.push({
        id: "unit-suspect", level: "warn",
        text: "这组尺寸看着像英寸、重量像磅 —— 亚马逊后台给的正是这个口径,而本页默认按厘米/千克计算。"
              + "若是从后台复制的,请把上方「输入单位」切到「英寸 / 磅」,否则计费重会低估约 25%。",
      });
    }
  }

  if (billsBySizeTier(rule)) {
    out.push({
      id: "size-tier", level: "warn",
      text: `${rule.name} 按尺寸分档收固定档位费，不是「计费重 × 单价」。这里的计费重只用于判断落在哪一档，${cmp ? "省下的重量也不会线性变成省下的钱——" : ""}降一档才省钱，降不了档则省重量不省费用。`,
    });
  }
  if (r.bumpedByStep > 0.001) {
    out.push({
      id: "step-bump", level: "info",
      text: `因 ${rule.weightStep}kg 进位，计费重从 ${r.rawChargeable.toFixed(3)}kg 抬到 ${(r.rawChargeable + r.bumpedByStep).toFixed(2)}kg，多算 ${r.bumpedByStep.toFixed(3)}kg。刚过进位点时，减一点点重量就能省一档。`,
    });
  }
  if (r.bumpedByMin > 0.001) {
    out.push({
      id: "min-bump", level: "info",
      text: `未达最低计费重 ${rule.minChargeable}kg，按最低值计。再减重不会更便宜。`,
    });
  }
  if (cmp && cmp.savedKg > 0) {
    out.push({
      id: "compression-risk", level: "warn",
      text: "压缩包装省的是运费，但可能带来破损率与退货上升、以及换包材的一次性投入——这些不在本工具的模型里，需自行权衡。",
    });
  }
  return out;
}
