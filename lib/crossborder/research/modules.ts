/**
 * 深度研究 —— 报告模块配置表(机器可读,讨论稿 §七)。
 *
 * 三层结构:固定骨架(fixed,不可删)+ 主模板(按 intent 匹配)+ 品类维度。
 * 二次规划(plan 阶段)按「相关性+目标权重+品类重要性+证据充分度+风险严重度
 * −重复度」对非固定模块决定保留/合并/降级/删除;固定模块永远保留 ——
 * 模板负责完整性,动态编排负责相关性。
 */

import type { EvidenceKind, ResearchCategory, ResearchGoal, ResearchIntent } from "./types";

export type ModuleConfig = {
  module: string;
  title: string;
  /** 固定骨架:关系可信度与可比较性,模型无权删除。 */
  fixed: boolean;
  /** 适用品类;空数组 = 全品类。 */
  categories: ResearchCategory[];
  /** 适用研究目标;空数组 = 全目标。 */
  intents: ResearchIntent[];
  /**
   * 适用的研究目标。空 = 两个目标通用(绝大多数模块如此)。
   * 只有当某一章**只对某个目标成立**时才限定 —— 例如「改进优先级」对新入局者没有意义,
   * 它要先有一个已在卖的商品才谈得上改什么。
   */
  goals?: ResearchGoal[];
  required_evidence: EvidenceKind[];
  /** 有效证据低于此数时,模块必须降级(明写不足)或删除,不许注水。 */
  minimum_evidence_count: number;
  /** 0~1,二次规划的基础权重。 */
  priority: number;
};

/** MVP(新品进入验证)的 8 个核心模块,顺序即默认写作顺序。 */
export const RESEARCH_MODULES: ModuleConfig[] = [
  {
    // 综合研究(full)专属置顶模块:一页决策摘要(最大机会/风险/是否值得做/最大不确定)。
    // fixed:false —— 否则会泄漏到所有 intent;intents:["full"] 限定,min 0 保证 plan 不删。
    module: "decision_summary",
    title: "一页决策摘要",
    fixed: false, categories: [], intents: ["full"],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
  {
    module: "scope_confirm",
    title: "商品与范围确认",
    fixed: true, categories: [], intents: [],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
  {
    module: "data_coverage",
    title: "数据覆盖与可信度",
    fixed: true, categories: [], intents: [],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
  {
    module: "demand_scenarios",
    title: "用户需求与使用场景",
    fixed: false, categories: [], intents: ["market_entry", "product_optimization", "full"],
    required_evidence: ["forum", "media", "video", "qa"], minimum_evidence_count: 3, priority: 0.9,
  },
  {
    module: "voice_themes",
    title: "正面口碑与负面问题",
    // 竞品对比不用单主体口碑章 —— 它用 rival_profiles(各主体口碑侧写)代替,避免重复。
    fixed: false, categories: [], intents: ["market_entry", "product_optimization", "full"],
    required_evidence: ["forum", "media", "video", "qa", "user_upload"], minimum_evidence_count: 3, priority: 0.95,
  },
  {
    module: "issues_risks",
    title: "高频问题与品类风险",
    fixed: false, categories: [], intents: ["market_entry", "product_optimization", "quality_diagnosis", "full"],
    required_evidence: ["forum", "media", "news", "qa"], minimum_evidence_count: 2, priority: 0.85,
  },
  // ---- 竞品对比(rival_compare)专属模块 ----
  {
    module: "rival_diff",
    title: "商品与竞品差异矩阵",
    fixed: false, categories: [], intents: ["rival_compare"],
    required_evidence: ["media", "forum", "video", "qa"], minimum_evidence_count: 3, priority: 0.98,
  },
  {
    module: "rival_profiles",
    title: "各主体口碑侧写",
    fixed: false, categories: [], intents: ["rival_compare"],
    required_evidence: ["media", "forum", "video", "qa"], minimum_evidence_count: 2, priority: 0.9,
  },
  {
    module: "decision_factors",
    title: "用户选择原因与决策因子",
    fixed: false, categories: [], intents: ["rival_compare"],
    required_evidence: ["forum", "qa", "video"], minimum_evidence_count: 2, priority: 0.85,
  },
  {
    module: "rival_opportunities",
    title: "竞品方向与机会",
    fixed: false, categories: [], intents: ["market_entry", "rival_compare", "full"],
    required_evidence: ["media", "forum", "video"], minimum_evidence_count: 2, priority: 0.8,
  },
  {
    module: "external_events",
    title: "外部舆情与事件",
    fixed: false, categories: [], intents: ["market_entry", "brand_risk", "full"],
    // 证据门槛高:普通商品搜不到召回/监管/集体投诉就整章省略,不为目录完整注水。
    required_evidence: ["news"], minimum_evidence_count: 2, priority: 0.5,
  },
  {
    // 「优化现有商品」专属:新入局者没有「现在的商品」可改,这一章对他不成立。
    // 产出是可执行的改动清单(改什么 / 先改哪个 / 哪些不该改),而不是进场判断。
    module: "optimize_priorities",
    title: "改进优先级 · 改什么 / 先改哪个",
    fixed: false, categories: [], intents: [], goals: ["optimize"],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
  {
    module: "advice_actions",
    title: "产品与 Listing 建议 · 行动优先级",
    fixed: true, categories: [], intents: [],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
  {
    module: "sources_appendix",
    title: "证据与来源附录",
    fixed: true, categories: [], intents: [],
    required_evidence: [], minimum_evidence_count: 0, priority: 1,
  },
];

export function moduleById(id: string): ModuleConfig | undefined {
  return RESEARCH_MODULES.find((m) => m.module === id);
}

/**
 * 按档位 + 品类 + 研究目标初筛候选模块(第一次规划;第二次规划再按实际证据取舍)。
 * goal 缺省按「新品进入验证」—— 老报告与老调用方不受影响。
 */
export function candidateModules(
  intent: ResearchIntent, category: ResearchCategory, goal: ResearchGoal = "new_entry",
): string[] {
  return RESEARCH_MODULES
    .filter((m) => {
      // goals 限定优先于 fixed:限定了目标的章,目标不符时即使 fixed 也不出。
      if (m.goals?.length && !m.goals.includes(goal)) return false;
      return m.fixed
        || ((m.intents.length === 0 || m.intents.includes(intent))
          && (m.categories.length === 0 || m.categories.includes(category)));
    })
    .map((m) => m.module);
}

/**
 * 品类专属分析维度:决定 issues_risks / voice_themes 里额外追问什么,
 * 不重新设计整份报告。MVP 只内置电子、家居两类,其余走 generic 不硬套。
 */
export const CATEGORY_DIMENSIONS: Record<ResearchCategory, string[]> = {
  electronics: ["续航", "发热", "噪音", "兼容性", "故障率", "认证与安全", "电池运输限制"],
  home: ["尺寸与空间", "安装难度", "稳定性", "异味", "承重", "运输破损"],
  generic: [],
};

export const CATEGORY_LABEL: Record<ResearchCategory, string> = {
  electronics: "电子电器",
  home: "家居家具",
  generic: "通用",
};
