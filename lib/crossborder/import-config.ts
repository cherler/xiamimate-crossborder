/**
 * 智能读取（import）配置：声明每个工具能从资料里读取哪些参数。
 * 后端据此生成 MiniMax 的结构化提取 schema，前端抽屉据此展示识别结果与缺口。
 * 纯数据、无副作用，服务端与前端共用。
 */

export type ImportFieldKind = "money" | "percent" | "number" | "dimension";

export type ImportFieldSpec = {
  key: string;
  label: string;
  kind: ImportFieldKind;
  description: string; // 指导模型正确归位（同名 key 在不同工具含义不同）
};

export type ImportToolConfig = {
  toolId: string;
  toolName: string;
  productContext: boolean; // 是否额外读取商品名与站点
  fields: ImportFieldSpec[];
};

export type ExtractedParam = { key: string; value: number; sourceQuote: string;
  /** 量纲存疑(如原文写 0.15 而没带 %):需要用户确认是 15% 还是 0.15%。 */
  ambiguous?: boolean;
 };

/**
 * 百分数字段的量纲裁决(代码说了算,不问模型)。
 *
 * 后台导出的表格里,佣金那一列常常写的是 `0.15`(比例)而不是 `15`(百分数)。
 * 模型忠实返回 0.15,而唯一的下游校验是「佣金+退款+广告 >= 100 才报错」——
 * 0.15 完美通过,算出来的利润率虚高十几个点,还会被写进商品模型传染给别的工具。
 * 反向(把 15% 读成 1500)同样只在合计超 100 时才被拦。
 *
 * 返回 null = 这个值不可能是百分数,丢弃;`ambiguous` = 需要用户确认量纲。
 */
export function normalizePercent(value: number, quote: string): {
  value: number; corrected: boolean; ambiguous: boolean;
} | null {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const written = /(\d+(?:\.\d+)?)\s*%/.exec(quote);
  if (written) {
    const n = Number(written[1]);
    // 原文明明白白写着「15%」,模型却返回 0.15 —— 以原文为准
    if (Math.abs(value * 100 - n) < 0.01 && Math.abs(value - n) > 0.01) {
      return { value: n, corrected: true, ambiguous: false };
    }
    return { value, corrected: false, ambiguous: false };
  }
  // 原文没带 %,值又小于 1:0.15 到底是 15% 还是 0.15%,只有用户知道
  return { value, corrected: false, ambiguous: value > 0 && value < 1 };
}

export const IMPORT_CONFIGS: Record<string, ImportToolConfig> = {
  profit: {
    toolId: "profit",
    toolName: "利润计算器",
    productContext: true,
    fields: [
      { key: "price", label: "售价", kind: "money", description: "商品售价" },
      { key: "cost", label: "采购成本", kind: "money", description: "单件采购成本" },
      { key: "domestic", label: "国内运费", kind: "money", description: "国内段运费" },
      { key: "head", label: "头程运费", kind: "money", description: "头程 / 国际段运费" },
      { key: "lastMile", label: "尾程 / FBA", kind: "money", description: "尾程或 FBA 配送费" },
      { key: "commission", label: "平台佣金", kind: "percent", description: "平台佣金百分比" },
      { key: "refund", label: "退款损耗", kind: "percent", description: "退款 / 退货损耗百分比" },
      { key: "ads", label: "广告成本", kind: "percent", description: "广告成本占售价百分比" },
    ],
  },
  pricing: {
    toolId: "pricing",
    toolName: "定价决策模拟器",
    productContext: true,
    fields: [
      { key: "cost", label: "总成本", kind: "money", description: "采购 + 物流 + 履约的单件总成本" },
      { key: "targetValue", label: "目标净利率", kind: "percent", description: "期望达到的净利率百分比" },
      { key: "commission", label: "平台佣金", kind: "percent", description: "平台佣金百分比" },
      { key: "ads", label: "广告占比", kind: "percent", description: "广告成本占售价百分比" },
      { key: "refund", label: "退款损耗", kind: "percent", description: "退款 / 退货损耗百分比" },
    ],
  },
  acos: {
    toolId: "acos",
    toolName: "广告盈亏规划器",
    productContext: true,
    fields: [
      { key: "price", label: "售价", kind: "money", description: "商品售价" },
      { key: "cost", label: "单件成本", kind: "money", description: "采购 + 物流，不含广告" },
      { key: "commission", label: "平台佣金", kind: "percent", description: "平台佣金百分比" },
      { key: "margin", label: "目标净利率", kind: "percent", description: "期望达到的净利率百分比" },
      { key: "spend", label: "广告花费", kind: "money", description: "这段时间的广告总花费" },
      { key: "adSales", label: "归因销售额", kind: "money", description: "广告归因带来的销售额，不是总销售额" },
      { key: "clicks", label: "点击数", kind: "number", description: "广告点击次数" },
      { key: "orders", label: "归因订单数", kind: "number", description: "广告归因带来的订单数" },
    ],
  },
  dimweight: {
    toolId: "dimweight",
    toolName: "计费重与包装优化器",
    productContext: false,
    fields: [
      { key: "length", label: "长", kind: "dimension", description: "包裹长度，单位 cm" },
      { key: "width", label: "宽", kind: "dimension", description: "包裹宽度，单位 cm" },
      { key: "height", label: "高", kind: "dimension", description: "包裹高度，单位 cm" },
      { key: "actual", label: "实重", kind: "number", description: "实际称重，单位 kg" },
      { key: "rate", label: "运费单价", kind: "money", description: "每 kg 运费单价，用于折算包装方案省下的钱" },
    ],
  },
  landed: {
    toolId: "landed",
    toolName: "进口到岸成本估算",
    productContext: true,
    fields: [
      { key: "unitCost", label: "单件采购价", kind: "money", description: "单件采购价，本币，不是整批总额" },
      { key: "units", label: "批次件数", kind: "number", description: "本批货的件数，用于分摊批次费用" },
      { key: "fx", label: "汇率", kind: "number", description: "1 本币兑目标币的汇率" },
      { key: "dutyRate", label: "关税率", kind: "percent", description: "关税率百分比" },
      { key: "vatRate", label: "VAT / GST", kind: "percent", description: "VAT 或 GST 税率百分比" },
      { key: "margin", label: "目标净利率", kind: "percent", description: "期望达到的净利率百分比" },
    ],
  },
};

export function importConfig(toolId: string): ImportToolConfig | undefined {
  return IMPORT_CONFIGS[toolId];
}
