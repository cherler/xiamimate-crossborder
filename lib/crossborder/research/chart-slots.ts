/**
 * 图表槽位表与就绪检查(图表规范方案 P0)。
 *
 * 「图表不是排版,是协议」:每张图在这里有名字、有数据前提、有兜底方式。
 * checkChartSlots 是唯一的成图判定 —— ai-service compose 用它算 chartsAvailable
 * 落库,前端对老报告(无清单)也用它客户端补算,两端永远同一套阈值。
 *
 * P0 只有全品类四槽位;P1 增加品类专属槽位(电子 claim_gap / 定位图轴候选),
 * 届时给 ChartSlot.categories 填品类即可,机制不变。
 *
 * 本文件只允许 type-only import —— 前端组件、Node 单测都要能直接加载。
 */

import type {
  ChartAvailability, EvidenceKind, ReportFindings, ReportTheme, ResearchCategory, ResearchIntent,
} from "./types";

export type ChartId =
  | "coverage_bars" | "diverging_themes" | "priority_matrix" | "motivation_bars"
  | "claim_gap" | "position_map" | "diff_matrix";

export type ChartSlot = {
  chart: ChartId;
  /** 挂在哪一章(module id)。 */
  module: string;
  /** 空 = 全品类;P1 起品类专属槽位在此声明。 */
  categories: ResearchCategory[];
  /** 空 = 全研究目标;竞品对比专属图(diff_matrix)在此限定 intent。 */
  intents: ResearchIntent[];
  /** P0 决议:统一「文字兜底 + 说明」。 */
  fallback: "text";
  /** 成图最低条件的人话描述(规范文档与 reason 共用口径)。 */
  minDesc: string;
};

/** 图表中文名(「查看研究过程」里对照图表计划用,别让用户读 chart id)。 */
export const CHART_LABEL: Record<string, string> = {
  coverage_bars: "来源渠道分布",
  motivation_bars: "购买动机",
  diverging_themes: "正负口碑主题",
  priority_matrix: "问题优先级矩阵",
  claim_gap: "宣称与实测落差",
  position_map: "竞品定位图",
  diff_matrix: "商品与竞品差异矩阵",
};

export const CHART_SLOTS: ChartSlot[] = [
  { chart: "coverage_bars", module: "data_coverage", categories: [], intents: [], fallback: "text", minDesc: "至少 2 个来源渠道有计数" },
  { chart: "motivation_bars", module: "demand_scenarios", categories: [], intents: ["market_entry", "product_optimization", "full"], fallback: "text", minDesc: "至少 2 条带证据的购买动机" },
  { chart: "diverging_themes", module: "voice_themes", categories: [], intents: ["market_entry", "product_optimization", "full"], fallback: "text", minDesc: "正负主题合计至少 3 个且各带证据" },
  { chart: "priority_matrix", module: "voice_themes", categories: [], intents: ["market_entry", "product_optimization", "quality_diagnosis", "full"], fallback: "text", minDesc: "至少 2 个负面问题且带频率与影响分档" },
  // P1 品类专属槽位
  { chart: "claim_gap", module: "voice_themes", categories: ["electronics"], intents: ["market_entry", "product_optimization", "full"], fallback: "text", minDesc: "至少 1 组宣称值与观察值都有数值出处的落差" },
  { chart: "position_map", module: "rival_opportunities", categories: ["electronics", "home"], intents: [], fallback: "text", minDesc: "轴取自品类候选且至少 2 个定位点" },
  // 竞品对比专属槽位:差异矩阵
  { chart: "diff_matrix", module: "rival_diff", categories: [], intents: ["rival_compare"], fallback: "text", minDesc: "至少 2 个主体、2 个维度且有带证据的格子" },
];

/**
 * 定位图轴候选表(P1):每品类预置轴组合,analyze 只能从中选、不能自造 ——
 * 轴乱了图就不可比、不可复现。
 */
export const AXIS_CANDIDATES: Record<ResearchCategory, Array<{ x: string; y: string }>> = {
  electronics: [
    { x: "价格", y: "静音与安全" },
    { x: "价格", y: "续航口碑" },
  ],
  home: [
    { x: "价格", y: "安装易度" },
    { x: "价格", y: "稳固性" },
  ],
  generic: [],
};

/**
 * 品类 + 研究目标适用的槽位。plan 阶段据此产出 chartPlan;
 * category 缺省 generic,intent 缺省 market_entry(与既有行为一致)。
 */
export function slotsFor(category: ResearchCategory, intent: ResearchIntent = "market_entry"): ChartSlot[] {
  return CHART_SLOTS.filter((s) =>
    (s.categories.length === 0 || s.categories.includes(category))
    && (s.intents.length === 0 || s.intents.includes(intent)));
}

/** @deprecated 用 slotsFor(category, intent);保留旧签名兼容 plan 阶段旧调用。 */
export function slotsForCategory(category: ResearchCategory): ChartSlot[] {
  return slotsFor(category, "market_entry");
}

/**
 * 补齐 findings 里所有「本该带证据 ids」条目的 ids 字段(不改原对象)。
 *
 * 图表组件普遍直接读 `n.ids.length` —— 它们有权这么写,类型上 ids 是必填。但模型偶发
 * 漏字段时,ai-service 那侧的清洗只丢得掉「ids 为空」的条目,丢不掉「压根没有 ids」的,
 * 于是 undefined.length 把整个报告页打白屏。新报告已在 analyze 阶段补齐,**存量报告
 * 的 JSON 是不会再改写的**(渲染确定性),所以渲染前必须再兜一次。
 *
 * 补成空数组等于如实标记「这条没有出处」:就绪判定会因此不成图,圆点会画成空心,
 * 绝不会被当成有证据。
 */
export function normalizeFindings(f: ReportFindings | undefined): ReportFindings | undefined {
  if (!f) return f;
  const fix = <T,>(rows: T[] | undefined): T[] | undefined =>
    rows?.map((r) => (r && typeof r === "object" && !Array.isArray((r as { ids?: unknown }).ids)
      ? { ...r, ids: [] } : r));
  return {
    ...f,
    demand: f.demand && { ...f.demand, motivations: fix(f.demand.motivations), scenarios: fix(f.demand.scenarios) },
    voice: f.voice && {
      ...f.voice,
      positives: fix(f.voice.positives), negatives: fix(f.voice.negatives), gaps: fix(f.voice.gaps),
    },
    risks: fix(f.risks),
    rivals: f.rivals && { ...f.rivals, directions: fix(f.rivals.directions) },
    externalEvents: fix(f.externalEvents),
    claimGaps: fix(f.claimGaps),
    rivalMap: f.rivalMap && { ...f.rivalMap, points: fix(f.rivalMap.points) ?? [] },
    diffMatrix: f.diffMatrix && {
      ...f.diffMatrix,
      cells: fix(f.diffMatrix.cells) ?? [], whyChosen: fix(f.diffMatrix.whyChosen),
    },
  };
}

export type ChartCheckInput = {
  coverageCounts?: Partial<Record<EvidenceKind, number>>;
  themes?: ReportTheme[];
  findings?: ReportFindings;
  /** 品类:决定品类专属槽位是否进入判定;缺省 generic(只判全品类槽位)。 */
  category?: ResearchCategory;
  /** 研究目标:决定 intent 专属槽位(diff_matrix);缺省 market_entry。 */
  intent?: ResearchIntent;
};

/** 与前端组件同阈值的就绪判定。改阈值只改这里 —— 两端同源。 */
export function checkChartSlots(input: ChartCheckInput): ChartAvailability[] {
  const category: ResearchCategory = input.category ?? "generic";
  const intent: ResearchIntent = input.intent ?? "market_entry";
  const channels = Object.values(input.coverageCounts || {}).filter((n) => Number(n) > 0).length;
  const themes = input.themes || [];
  const pos = themes.filter((t) => t.sentiment === "positive" && t.ids.length > 0).length;
  const neg = themes.filter((t) => t.sentiment === "negative" && t.ids.length > 0).length;
  const motivations = (input.findings?.demand?.motivations || [])
    .filter((m) => m.text && (m.ids?.length ?? 0) > 0).length;
  // 负面问题:必须带证据才算一个点。只判 theme 的话,模型凭空写两个没有出处的问题
  // 就够把矩阵图撑起来 —— 图里画的是「样本内真实观察」,无出处的条目不该进图。
  const negatives = (input.findings?.voice?.negatives || [])
    .filter((n) => n.theme && (n.ids?.length ?? 0) > 0).length;
  // claim_gap:宣称/观察都要真数值才算一组
  const gaps = (input.findings?.claimGaps || [])
    .filter((g) => g.attr && Number.isFinite(g.claimedValue) && Number.isFinite(g.observedValue)).length;
  // position_map:轴必须在品类候选内,点位 ≥ 2
  const rm = input.findings?.rivalMap;
  const axisOk = !!rm && (AXIS_CANDIDATES[category] || [])
    .some((a) => a.x === rm.x && a.y === rm.y);
  const points = rm?.points?.filter((p) => p.label && (p.ids?.length ?? 0) > 0).length ?? 0;
  // diff_matrix:≥2 主体、≥2 维度,且至少有一个带证据的格子(空格靠前端留空)
  const dm = input.findings?.diffMatrix;
  const dmSubjects = dm?.subjects?.filter(Boolean).length ?? 0;
  const dmDims = dm?.dimensions?.filter(Boolean).length ?? 0;
  const dmCells = dm?.cells?.filter((c) => c.subject && c.dimension && (c.ids?.length ?? 0) > 0).length ?? 0;

  const verdicts: Record<ChartId, { ready: boolean; reason?: string }> = {
    coverage_bars: channels >= 2
      ? { ready: true }
      : { ready: false, reason: `来源渠道仅 ${channels} 类,不足以成图` },
    motivation_bars: motivations >= 2
      ? { ready: true }
      : { ready: false, reason: `带证据的购买动机仅 ${motivations} 条,不足以成图` },
    diverging_themes: pos + neg >= 3
      ? { ready: true }
      : { ready: false, reason: `正负主题合计仅 ${pos + neg} 个,不足以成图` },
    priority_matrix: negatives >= 2
      ? { ready: true }
      : { ready: false, reason: `负面问题仅 ${negatives} 条,不足以成矩阵` },
    claim_gap: gaps >= 1
      ? { ready: true }
      : { ready: false, reason: "宣称值与观察值缺少可核对的数值出处,不出落差图" },
    position_map: rm && axisOk && points >= 2
      ? { ready: true }
      : { ready: false, reason: !rm ? "缺少竞品定位数据,不出定位图"
          : !axisOk ? "定位轴不在品类候选内,不出定位图"
          : `定位点仅 ${points} 个,不足以成图` },
    diff_matrix: dmSubjects >= 2 && dmDims >= 2 && dmCells >= 1
      ? { ready: true }
      : { ready: false, reason: dmSubjects < 2 ? `对比主体仅 ${dmSubjects} 个,不足以成矩阵`
          : dmDims < 2 ? `对比维度仅 ${dmDims} 个,不足以成矩阵`
          : "矩阵格子均无证据支撑,以文字呈现" },
  };

  return slotsFor(category, intent).map((s) => ({
    chart: s.chart,
    module: s.module,
    ...verdicts[s.chart],
  }));
}

/** 就绪清单 → 章内兜底说明(拼进对应 section.insufficient 的统一措辞)。 */
export function fallbackNote(items: ChartAvailability[]): string {
  const bad = items.filter((x) => !x.ready && x.reason);
  if (!bad.length) return "";
  return `样本不足以成图(${bad.map((x) => x.reason).join(";")}),该章以文字呈现`;
}
