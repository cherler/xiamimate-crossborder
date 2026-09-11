/**
 * 深度研究 —— 协议层类型。ai-service 路由、后端 research_run 与前端 UI 共用这一份,
 * 三方对同一个形状编程,改协议只改这里。
 *
 * 与 deep-report.ts(评论样本分析)是两条产品线:那边输入是用户上传的评论,
 * 这边输入是公开网络检索。run 的状态机形状刻意与 report_run 同构,
 * 后端可以照抄「分段冻结-结算 / 断点续跑」的实现。
 */

/* ---------------- 范围与目标 ---------------- */

/**
 * 研究目标(intent)= 报告档位(结构/深度),现只有三档在 UI 可选:
 * market_entry(需求洞察)/ rival_compare(竞品对比)/ full(综合)。
 * product_optimization / quality_diagnosis 保留类型值只为兼容存量老报告的解析显示,
 * 新报告不再产出——「新品进入验证 vs 优化现有商品」已改由 ResearchGoal 承担,
 * 三档都能选,不再是档位本身的分叉(2026-07-21 生命周期扫描/目标复盘)。
 * brand_risk 属于舆情工具线,不在本页(深度研究三档)选择范围内。
 */
export type ResearchIntent =
  | "market_entry"          // 需求洞察
  | "product_optimization"  // 已废弃:老报告兼容,新报告改用 goal="optimize"
  | "rival_compare"         // 竞品对比
  | "brand_risk"            // 品牌与舆情风险(舆情工具线,非本页)
  | "quality_diagnosis"     // 已废弃:供应商侧数据我们采不到,内容已被 issues_risks 模块覆盖
  | "full";                 // 综合研究(需求+口碑+竞品+风险全景,顶部一页决策摘要)

export const INTENT_LABEL: Record<ResearchIntent, string> = {
  market_entry: "新品进入验证",
  product_optimization: "优化现有商品",
  rival_compare: "分析竞争对手",
  brand_risk: "品牌与舆情风险",
  quality_diagnosis: "检查质量和风险",
  full: "一次研究完(综合)",
};

/**
 * 研究目标(scenario)——与档位(intent)正交:同一个档位(需求洞察/竞品对比/综合)
 * 下,是判断「要不要进」还是「已在卖、怎么优化」,决定 plan/analyze/compose 的框架句
 * 与报告决策摘要的倾向措辞,不改变模块清单。默认 new_entry。
 */
export type ResearchGoal = "new_entry" | "optimize";
export const GOAL_LABEL: Record<ResearchGoal, string> = {
  new_entry: "新品进入验证",
  optimize: "优化现有商品",
};

/**
 * 档次(tier)展示名 —— 报告页与商品档案的**唯一**档位映射源。
 * 注意与 INTENT_LABEL 区分:那是「档位即目标」年代的旧标签(market_entry 写成
 * 「新品进入验证」),只在启动页历史文案里留用;凡是展示报告档次的地方都用这张表,
 * 否则会出现「研究目标」格里显示档次名的串台(#2026-07-27 修)。
 */
export const TIER_LABEL: Record<string, string> = {
  market_entry: "需求洞察",
  product_optimization: "现有商品优化",   // 老报告历史档位值
  rival_compare: "竞品对比",
  brand_risk: "品牌与舆情风险",
  quality_diagnosis: "质量与风险诊断",     // 老报告历史档位值
  full: "综合研究",
};

/** 老报告的历史档位值:那时「档位即目标」,scope.goal 尚不存在。 */
export const LEGACY_INTENTS = new Set(["product_optimization", "quality_diagnosis"]);

/** 老报告档位 → 隐含的研究目标(用于派生时归一,避免升档后目标丢失)。 */
export const LEGACY_INTENT_GOAL: Record<string, ResearchGoal> = {
  product_optimization: "optimize",
  quality_diagnosis: "optimize",
};

/** 报告的研究目标:显式 goal 优先;老报告从历史档位推断;都没有则新品进入验证。 */
export function scopeGoal(scope: { intent?: string; goal?: string } | null | undefined): ResearchGoal {
  if (scope?.goal === "optimize" || scope?.goal === "new_entry") return scope.goal;
  const legacy = scope?.intent ? LEGACY_INTENT_GOAL[scope.intent] : undefined;
  return legacy ?? "new_entry";
}

/** 研究单个商品,还是一个商品方向(身份未确认时只能出方向探索报告)。 */
export type ResearchMode = "direction" | "single";

/** MVP 内置品类维度(其余品类走通用模块,不硬套)。 */
export type ResearchCategory = "electronics" | "home" | "generic";

export type ResearchScope = {
  /** 用户原始输入(商品名或链接),永远保留以便追溯。 */
  query: string;
  productName: string;
  asin?: string | null;
  /** 商品档案 stableId —— 报告绑它,回指所属商品(改名/换设备不断链)。 */
  productRef?: string | null;
  url?: string | null;
  /** 站点代码,如 amazon-us;与 lib/crossborder/asin.ts 的 MARKET_LABEL 同口径。 */
  marketplace: string;
  mode: ResearchMode;
  intent: ResearchIntent;
  /** 新品进入验证 / 优化现有商品——与 intent(档位)正交,默认 new_entry。 */
  goal?: ResearchGoal;
  category: ResearchCategory;
  /** 检索时间窗(月)。默认 24。 */
  months: number;
  /** 竞品名称或链接,MVP 最多 3 个。 */
  rivals: string[];
  /** 用户粘贴的补充资料(报价单、说明书要点、已有差评等)。 */
  notes?: string;
  /**
   * 哪些字段取的是系统默认而非用户确认 —— 红线:极简模式的假设必须写进报告。
   * 取值为字段名,如 "marketplace" / "months" / "intent" / "mode"。
   */
  assumed: string[];
};

/** 极简模式的系统默认值(讨论稿 §九)。 */
export const SCOPE_DEFAULTS = {
  marketplace: "amazon-us",
  months: 24,
  mode: "direction" as ResearchMode,
  intent: "market_entry" as ResearchIntent,
};

/* ---------------- 证据 ---------------- */

/** 来源渠道。红线:不含平台商品页抓取 —— retail 仅指用户上传或公开转述。 */
export type EvidenceKind =
  | "official"     // 官方与品牌资料
  | "media"        // 媒体与博客评测
  | "forum"        // 社区与论坛
  | "video"        // 视频与字幕
  | "qa"           // 问答
  | "news"         // 新闻与监管
  | "platform"     // 平台评价数据(第三方接口,如 TikTok Shop);已去评价者个人身份
  | "user_upload"; // 用户上传资料

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  official: "官方与品牌资料",
  media: "媒体与博客评测",
  forum: "社区与论坛讨论",
  video: "视频与问答内容",
  qa: "商品问答",
  news: "新闻与监管信息",
  platform: "平台评价(第三方接口)",
  user_upload: "用户上传资料",
};

/** 来源性质:原始 / 转载 / 商业合作 / 用户生成 —— 选择偏差标注的依据。 */
export type SourceNature = "original" | "repost" | "sponsored" | "ugc";

export type EvidenceLevel = "high" | "mid" | "low";

export const EVIDENCE_LEVEL_LABEL: Record<EvidenceLevel, string> = {
  high: "高", mid: "中", low: "低",
};

export type EvidenceItem = {
  id: string;
  url: string | null;        // user_upload 为 null
  title: string;
  kind: EvidenceKind;
  nature: SourceNature;
  publishedAt?: string | null;
  fetchedAt: string;
  /** 支撑结论用的关键片段(模型概括)。 */
  snippet: string;
  /**
   * 来源原文摘录(未经模型改写)。
   *
   * 加它是因为实测下来「深度不够」的根源在**摄入量**,不在模型:
   * 检索商能给到 4,000 字正文,而此前喂给 gather 的只截 500 字、
   * 再让模型压成 ≤120 字的 snippet —— 下游 analyze/compose 从此只看得到那 ~70 字。
   * 实测三份真实报告:证据文本合计 700–2,200 字,而报告正文 5,600–6,200 字,
   * 3–8 倍的差额只能靠模型自己展开,这就是「读起来像正确的废话」的来源。
   *
   * 现在把原文留下来交给 analyze —— 它是真正做推理的那一段。
   * compose 仍只用 snippet(它的活是写,不是推),避免成本翻倍。
   */
  excerpt?: string;
  reliability: EvidenceLevel;
  /** 可信度的判定依据(如「权威机构或主流媒体」「B2B 目录站,以营销文案为主」)。
   *  展示给用户,让「这条为什么可信」看得见 —— 而不是一个没来由的 high/low。 */
  reliabilityWhy?: string;
  /** 竞品对比(rival_compare):这条证据属于哪个主体(我方或某竞品),供跨主体对齐。 */
  subject?: string | null;
};

/* ---------------- 扫描(可研究性预览) ---------------- */

export type ScanAvailability = {
  kind: EvidenceKind;
  /** rich=资料充足 some=有一些 scarce=很少 */
  rough: "rich" | "some" | "scarce";
  note: string;
};

export type ScanResult = {
  identity: {
    name: string;
    /** 中英文与常见别名,用于后续检索词。 */
    aliases: string[];
    category: ResearchCategory;
    /** 可能混淆的同名/近似商品,需要用户排除。 */
    ambiguous: string[];
    /** 身份是否足够确定 —— false 时只能按「商品方向」研究。 */
    confident: boolean;
  };
  /**
   * 竞品对比(rival_compare)时,对每个竞品主体的身份识别结果 ——
   * 把「多主体身份错误」拦在扫描阶段:用户逐个确认后才进正式研究。
   */
  rivalIdentities?: Array<{
    input: string;          // 用户原始输入
    name: string;           // 识别到的规范名
    confident: boolean;
    ambiguous: string[];
  }>;
  suggestedScope: ResearchScope;
  availability: ScanAvailability[];
  /** 主要讨论集中的平台/渠道描述。 */
  hotspots: string[];
  /** 建议的报告模块(module id,按 modules.ts 初筛)。 */
  proposedModules: string[];
  /** 缺少的关键资料与建议上传项。 */
  missing: string[];
  uploadsSuggested: string[];
  /** 正式研究的预计消耗(供报价展示;结算以后端冻结-结算为准)。 */
  estimate: { tokens: number; searches: number; minutes: number };
};

/* ---------------- 研究计划与报告 ---------------- */

export type PlanModuleDecision = {
  module: string;
  action: "keep" | "merge" | "demote" | "drop";
  /** 为什么保留/合并/降级/删除 —— 报告「查看研究过程」要能追溯。 */
  reason: string;
  mergedInto?: string;
};

export type ResearchPlan = {
  /** 第一次规划(搜索前)提出的候选模块。 */
  candidates: string[];
  /** 探索搜索后的第二次规划结果。 */
  decisions: PlanModuleDecision[];
  /** 最终写作顺序(module id)。 */
  finalModules: string[];
  /** 每个模块的研究问题(写作与检索的依据)。 */
  questions: Record<string, string[]>;
  /**
   * 图表槽位计划(P1):按品类裁决哪些图在本次研究范围内 ——
   * 「查看研究过程」可追溯某张图为什么出现/没出现;就绪与否仍由 compose 按实际数据判定。
   */
  chartPlan?: Array<{ chart: string; module: string }>;
};

export type Conclusion = {
  text: string;
  supportIds: string[];   // EvidenceItem.id
  againstIds: string[];
  level: EvidenceLevel;
};

export type ModuleSection = {
  module: string;
  title: string;
  /** Markdown 正文(渲染前经防御处理)。 */
  body: string;
  conclusions: Conclusion[];
  /** 证据不足时如实说明缺什么;有值时 UI 显式展示,不注水。 */
  insufficient?: string | null;
};

export type ReportVerdictCard = {
  tag: string;    // 用户最重视 / 最大问题 / 最值得做(或最该先改) / 最大不确定
  text: string;
  /**
   * 支撑该判词的证据 id(compose 已按证据白名单校验,模型发明的一律丢弃)。
   * 页面按它的条数画证据点 —— 此前判词是全链唯一不走证据 id 的产物,
   * 点数从 evidenceNote 那句自由文本里正则抠数字,模型写多少就画多少。
   * 老报告没有这个字段,前端会退回读 evidenceNote 并封顶到真实来源数。
   */
  supportIds?: string[];
  evidenceNote: string;
};

/** 证据阶段的主题聚类(图表数据源;老报告可能没有)。 */
export type ReportTheme = {
  theme: string;
  sentiment: "positive" | "negative" | "neutral" | string;
  ids: string[];
};

/** 分析阶段的结构化发现(图表数据源;老报告可能没有)。 */
export type ReportFindings = {
  demand?: {
    motivations?: Array<{ text: string; ids: string[] }>;
    scenarios?: Array<{ text: string; ids: string[] }>;
    decisionAttrs?: string[];
    insufficient?: string | null;
  };
  voice?: {
    positives?: Array<{ theme: string; note?: string; listing?: string; ids: string[] }>;
    negatives?: Array<{ theme: string; freq?: string; impact?: string; note?: string; ids: string[] }>;
    gaps?: Array<{ text: string; ids: string[] }>;
    insufficient?: string | null;
  };
  risks?: Array<{ title: string; note?: string; dimension?: string; ids: string[] }>;
  rivals?: {
    directions?: Array<{ title: string; good?: string; bad?: string; chance?: string; ids: string[] }>;
    insufficient?: string | null;
  };
  externalEvents?: Array<{ title: string; note?: string; ids: string[] }>;
  /**
   * 期望落差(P1,电子品类):宣称值与观察值都必须有数值出处(ids),
   * 拿不到数值就不产出 —— 哑铃图只画真数字。
   */
  claimGaps?: Array<{
    attr: string;
    claimedText: string;
    claimedValue: number;
    observedText: string;
    observedValue: number;
    unit?: string;
    note?: string;
    ids: string[];
  }>;
  /**
   * 竞品定位图(P1,电子/家居):轴只能取自品类轴候选表(AXIS_CANDIDATES),
   * 点位为定性三档 —— 模型只能选轴不能造轴。
   */
  rivalMap?: {
    x: string;
    y: string;
    reason?: string;
    points: Array<{
      label: string;
      x: "low" | "mid" | "high";
      y: "low" | "mid" | "high";
      note?: string;
      ids: string[];
    }>;
  } | null;
  /**
   * 差异矩阵(竞品对比 rival_compare 核心):主体 × 维度的定性优劣。
   * 铁律 —— cells 只包含「有证据(ids 非空)」的格子;subjects×dimensions 铺成网格后
   * 缺失的格子由前端显式留空并标注「覆盖不足」,绝不用「无数据」冒充「无差异」。
   * subjects[0] 约定为我方商品;coverage 记录每个主体的有效证据数,低覆盖主体降级不进强判断。
   */
  diffMatrix?: {
    subjects: string[];
    dimensions: string[];
    /** 每个主体的有效证据数(代码统计,用于降级判定)。 */
    coverage?: Record<string, number>;
    cells: Array<{
      subject: string;
      dimension: string;
      verdict: "adv" | "mid" | "weak";   // 优 / 中 / 劣(定性三档,样本内观察)
      note?: string;
      ids: string[];
    }>;
    /** 选择原因与夺单机会(可选,配矩阵一起展示)。 */
    whyChosen?: Array<{ text: string; ids: string[] }>;
    insufficient?: string | null;
  } | null;
};

/** 图表就绪清单:每个槽位出图与否及原因(图表规范方案 P0)。 */
export type ChartAvailability = {
  chart: string;
  module: string;
  ready: boolean;
  /** ready=false 时的人话原因,会写进对应章的 insufficient。 */
  reason?: string;
};

export type ResearchReport = {
  scope: ResearchScope;
  plan: ResearchPlan;
  verdicts: ReportVerdictCard[];
  sections: ModuleSection[];
  /**
   * 报告结构版本:1 = 纯文字(字段缺省即 v1),2 = 图表化(themes/findings/chartsAvailable)。
   * 已落库的旧报告永不改写 —— 渲染确定性的根。
   */
  schemaVersion?: number;
  /** 图表数据源(schemaVersion ≥ 2;缺失时图表隐藏)。 */
  themes?: ReportTheme[];
  findings?: ReportFindings;
  /** 图表就绪清单(schemaVersion ≥ 2):前端只按这份清单渲染,不再自行猜测。 */
  chartsAvailable?: ChartAvailability[];
  coverage: {
    counts: Partial<Record<EvidenceKind, number>>;
    timeSpan: string;
    languages: string[];
    limits: string[];
  };
  sources: EvidenceItem[];
  generatedAt: string;
};

/* ---------------- run 状态机(与 report_run 同构) ---------------- */

export type ResearchStageName = "plan" | "gather" | "evidence" | "analyze" | "compose";

export const RESEARCH_STAGE_LABEL: Record<ResearchStageName, string> = {
  plan: "研究计划",
  gather: "资料采集",
  evidence: "证据整理",
  analyze: "洞察分析",
  compose: "报告撰写",
};

export type ResearchStage = {
  name: ResearchStageName;
  status: "pending" | "done" | "skipped";
  estimate: number;
  charged: number;
};

export type ResearchRunStatus = "running" | "paused_insufficient" | "failed" | "done";

/** 报告谱系关系(生命周期 P0):派生自哪份、与它是什么关系。 */
export type ResearchRelation =
  | "origin" | "rerun_supplement" | "rerun_scope" | "upgrade_tier" | "rerun_goal" | "retry" | "rescan"
  // 单章重跑:后端 VALID_RELATIONS 一直有它,前端漏了 —— 版本链上会渲染成一个没有标签的
  // 空白版本(RELATION_LABEL[undefined]),用户看不出这版只重写了一章、其余全是旧文。
  | "rerun_section";

export const RELATION_LABEL: Record<ResearchRelation, string> = {
  origin: "原创",
  rerun_supplement: "补资料",
  rerun_scope: "换范围",
  upgrade_tier: "升档",
  rerun_goal: "换目标",
  retry: "重试",
  rescan: "定期复扫",
  rerun_section: "重写单章",
};

/** 定期复扫排程(生命周期 P3)。 */
export type ResearchSchedule = {
  enabled: boolean;
  intervalDays: number;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
};

export type ResearchRun = {
  runId: string;
  status: ResearchRunStatus;
  scope: ResearchScope;
  quote: number;
  /**
   * 定期复扫的真实报价(**全新采集**,不含 reuse 折扣)。
   * 与 quote 不同 —— 后者是这一版自己的报价,可能是单章重跑(固定 5 分)或补资料派生的
   * 打折价;拿它展示「每期约 N 积分」会把自动扣费的价格少报最多 4 倍。
   */
  rescanQuote?: number;
  totalCharged: number;
  stages: ResearchStage[];
  error?: string | null;
  report?: ResearchReport | null;
  originRunId?: string | null;
  lineageRootId?: string | null;
  relation?: ResearchRelation;
  pinned?: boolean;
  schedule?: ResearchSchedule | null;
  seen?: boolean;
  productRef?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type ResearchRunListItem = {
  runId: string;
  status: ResearchRunStatus;
  productName: string;
  intent: ResearchIntent;
  goal?: ResearchGoal;
  marketplace?: string;
  quote: number;
  totalCharged: number;
  originRunId?: string | null;
  lineageRootId?: string | null;
  relation?: ResearchRelation;
  pinned?: boolean;
  seen?: boolean;
  productRef?: string | null;
  createdAt?: string | null;
};
