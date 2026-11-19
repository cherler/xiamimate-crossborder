/**
 * 跨境经营模块 —— 统一工具注册表。
 *
 * 模块页、工具中心、侧栏导航和路由都从这一份数据读取，避免多处重复维护。
 *
 * status 语义（不要再把还没做完的东西标成「已上线」）：
 *   available 已上线：有独立工具页、结果可核对、可分享。
 *   building  建设中：产品形态已定，正在建。
 *   planned   规划中：形态待定。
 *
 * Listing 与内容曾有 9 个入口且全部标为 available，实际上它们不是 9 个产品，
 * 而是一条 Listing 优化流程被切成了 9 片：健康度评分的权重与评级没有实证支撑，
 * 标题 / 五点 / A+ / 客服 / Review / 竞品 只是表单加一段 prompt。
 * 产品尚未上线，因此它们已直接下线，不做过渡入口 —— 见 WORKBENCHES。
 * 关键词清洗（纯文本去重）也已移除：功能太薄，其去重逻辑并入诊断工作台内部的关键词核对。
 * 因此本类目不再有独立工具，只剩三个已跑通的工作台。
 */

import type { ComponentType } from "react";
import {
  BarChart3, Box, CircleDollarSign, ClipboardCheck, FileSearch, GitCompare, Globe2,
  MessageSquareText, Microscope, Target, Telescope,
} from "lucide-react";

export type ToolStatus = "available" | "building" | "planned";

export type ToolCategory =
  | "利润与定价"
  | "广告盈亏"
  | "物流与仓储"
  | "税费与回款"
  | "Listing 与内容";

export type WorkbenchId = "listing-doctor" | "voice-insight" | "service-copilot";

export type CrossborderTool = {
  id: string;
  slug: string;
  name: string;
  short: string;
  category: ToolCategory;
  status: ToolStatus;
  popular?: boolean;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

export const CATEGORY_ORDER: ToolCategory[] = [
  "利润与定价", "广告盈亏", "物流与仓储", "税费与回款", "Listing 与内容",
];

export const STATUS_LABEL: Record<ToolStatus, string> = {
  available: "已上线",
  building: "建设中",
  planned: "规划中",
};

export const CROSSBORDER_TOOLS: CrossborderTool[] = [
  { id: "profit", slug: "profit-calculator", name: "利润计算器", short: "算清单件净利与保本价", category: "利润与定价", status: "available", popular: true, icon: CircleDollarSign },
  { id: "pricing", slug: "pricing-calculator", name: "定价决策模拟器", short: "按目标倒推售价 · 情景表与折扣空间", category: "利润与定价", status: "available", popular: true, icon: Target },
  { id: "acos", slug: "acos-break-even", name: "广告盈亏规划器", short: "保本 ACoS 与 CPC 出价上限", category: "广告盈亏", status: "available", popular: true, icon: BarChart3 },
  { id: "dimweight", slug: "dimensional-weight", name: "计费重与包装优化器", short: "承运商规则下的计费重与包装省费", category: "物流与仓储", status: "available", popular: true, icon: Box },
  { id: "landed", slug: "landed-cost", name: "进口到岸成本估算", short: "关税、VAT 与到岸成本 · 基础估算", category: "税费与回款", status: "available", popular: true, icon: Globe2 },
  // Listing 与内容不再有独立基础工具，只有下面的三个工作台。
];

/**
 * 工具中心搜索框的「意图关键词」——把用户可能说的口语/同义词映射到工具。
 * 只用于前端即时筛选(零延迟、不调模型)：光靠工具名子串匹配，
 * 「怎么算广告保本」这类整句问法一个都命中不了；补一层同义词就能对上。
 * 保持轻量：每个工具几个高频说法即可，宁缺毋滥(过泛的词会误召回)。
 */
export const TOOL_INTENT_KEYWORDS: Record<string, string[]> = {
  profit: ["利润", "净利", "毛利", "赚钱", "赚不赚", "能不能赚", "保本", "保本价", "成本", "算账", "划算", "亏损", "利润率"],
  pricing: ["定价", "售价", "卖多少", "定多少", "该卖多少", "倒推", "目标利润", "涨价", "降价", "折扣"],
  acos: ["广告", "acos", "cpc", "点击", "出价", "竞价", "ppc", "roas", "tacos", "广告保本", "投产比", "广告费", "打广告"],
  dimweight: ["计费重", "体积重", "抛重", "泡重", "包装", "尺寸", "长宽高", "重量", "装箱", "dim", "省运费", "运费单价"],
  landed: ["到岸", "关税", "vat", "gst", "进口", "报关", "清关", "税费", "汇率", "完税", "进口成本"],
};

/* ---------------- 工作台 ---------------- */

/**
 * 工作台是「一个商品项目 + 一套完整工作流」，不是一堆生成器的集合。
 *
 * gap 写清楚被下线的入口为什么不够 —— 这决定了工作台该建什么，
 * 也提醒我们别把同一批薄工具重新包装一遍就当升级。
 *
 * data 写清楚数据从哪来，这是工作台成立与否的前提：
 * 我们不提供政策文件、竞品 ASIN、关键词数据的合法途径，也不做大规模抓取。
 * 因此一切事实以「用户自己拿到的资料」为准（上传的截图 / CSV / 文本，或扩展在**用户自己打开的**页面上读到的内容）。服务器端不抓取任何页面，
 * AI 联网检索只作补充，且必须附来源与检索日期、由用户核对，不作为裁定。
 */
export type Workbench = {
  id: WorkbenchId;
  slug: string;
  name: string;
  short: string;
  purpose: string;
  category: ToolCategory;
  status: ToolStatus;
  gap: string[];
  flow: string[];
  data: string[];
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

export const WORKBENCHES: Workbench[] = [
  {
    id: "listing-doctor",
    slug: "listing-doctor",
    name: "Listing 诊断与改写工作台",
    short: "有依据地诊断并改写 Listing",
    purpose: "把你上传的商品资料与关键词放在一起，先指出问题与依据，再逐项改写，改完复检；平台规则由 AI 联网检索作补充，附来源供你核对。",
    category: "Listing 与内容",
    status: "available",
    gap: [
      "健康度评分的权重与 A/B/C 评级没有实证支撑，看着专业，用户却无从判断该信哪一条 —— 已下线。",
      "标题、五点、A+ 只是表单加一段 prompt，普通 AI 对话框就能做到，没有商品事实与关键词作依据 —— 已下线。",
      "合规检查只有本地词库，靠子串匹配，认不出语境、站点与类目差异 —— 已下线。",
      "同一套商品信息要在多个入口重复填写，工具之间不共享上下文。",
      "A+ 内容规划暂不重建：它真正难的是模块类型与图片规格，两者都以 Amazon 当期模块库为准、且会变，我们不维护那份表；去掉这些就只剩把改写换个排版，宁可不做。",
    ],
    flow: [
      "建立商品项目，上传资料（现有 Listing 截图、商品图、规格书、关键词 CSV、复制粘贴文本）",
      "AI 提取事实 → 用户逐条确认，形成商品事实库；未确认的事实禁止写进成品",
      "按已确认的商品事实与你上传的关键词诊断当前 Listing，逐条给出依据",
      "按问题逐项改写，展示修改前后差异",
      "对改写结果再做一次事实校验：出现事实库里没有的卖点即判违规",
      "导出标题与五点，附依据与「未确认因此未提及」清单",
    ],
    data: [
      "商品事实、现有 Listing、关键词：全部来自你上传的截图 / CSV / 粘贴文本，我们不代查、不抓取。",
      "平台规则：由 AI 联网检索作补充，附来源链接与检索日期，需你自行核对 —— 我们不维护政策库，检索结果不构成平台裁定。",
      "未在资料中确认的事实一律标为未知，AI 不得自行补充（如防水、认证、材质、质保）。",
    ],
    icon: ClipboardCheck,
  },
  {
    id: "voice-insight",
    slug: "voice-insight",
    name: "用户声音与竞品洞察",
    short: "批量 Review 与竞品的量化洞察",
    purpose: "从你的批量评论与竞品评论里找出有证据、可量化的问题主题，并映射到产品、图片与文案的具体修改。",
    category: "Listing 与内容",
    status: "available",
    gap: [
      "单个文本框里的几条评论无法做可靠归因，输出只能是「用户主要抱怨质量问题」这类无法行动的结论 —— 已下线。",
      "缺少频次、占比、对评分的影响与代表性证据，用户无法判断该先改哪个。",
      "竞品资料靠手填，成本高且容易生成空洞的差异点 —— 已下线。",
    ],
    flow: [
      "取一批评论：从商品档案选（上传的 / 扩展采的），或现场上传 CSV；竞品侧从已绑定档案的竞品取",
      "聚类正负面主题，给出频次、占比与对评分的影响",
      "标注变体与时间段差异，附代表性评论作证据",
      "对比竞品的普遍缺陷与我方可证明的差异（只用你自己拿到的样本：上传的或扩展采的）",
      "把洞察映射到产品、主图、标题与五点的具体修改建议",
    ],
    data: [
      "Review 与退货原因：从商品档案的口碑样本一键取，或从后台导出 CSV 上传；也可用浏览器扩展在你打开的商品页采集。服务器不抓取任何页面。",
      "竞品评论：把竞品行绑定到一份真实商品档案后，可直接取它的口碑样本；也可自己上传。我们不提供竞品 ASIN 数据，也不代查。",
      "结论只覆盖你上传的样本，不代表整体 —— 样本偏了，结论就偏了，页面会如实标注样本量。",
    ],
    icon: FileSearch,
  },
  {
    id: "service-copilot",
    slug: "service-copilot",
    name: "客服回复 Copilot",
    short: "带订单上下文与平台合规校验",
    purpose: "在你提供的订单与商品上下文里生成回复，提示可能触碰平台消息规则之处，由你确认后自行发送。",
    category: "Listing 与内容",
    status: "available",
    gap: [
      "只是场景加语气的 prompt 表单，任何 AI 对话框都能替代 —— 已下线。",
      "平台对买卖双方消息有硬性限制（不得营销、主动消息需满足订单条件、链接与联系方式受限），模型自由发挥会直接违规。",
      "没有订单与商品上下文，也没有隐私脱敏与人工升级判断。",
    ],
    flow: [
      "上传订单与商品上下文（截图 / 粘贴文本），识别退款 / 物流 / 质量 / 使用指导等意图",
      "按站点生成对应语言、统一品牌语气的回复",
      "对姓名、地址、订单号等做脱敏",
      "提示可能触碰平台消息禁令之处，标出需要人工升级的情况",
      "由用户确认后自行发送 —— 不接管发送",
    ],
    data: [
      "订单与商品上下文：由你上传或粘贴，我们不接入卖家后台。",
      "平台消息规则：由 AI 联网检索作补充，附来源与检索日期 —— 我们不维护规则库，最终以平台政策为准。",
      "消息含个人信息，脱敏后再交给模型；不接管发送，避免把违规风险变成我们替你按下的按钮。",
    ],
    icon: MessageSquareText,
  },
];

/* ---------------- 深度研究 ---------------- */

/** 静态站的研究入口：报告样例与本地资料底稿；在线检索和 AI 生成尚未接入。 */
export type ResearchProduct = {
  id: string;
  slug: string;
  name: string;
  short: string;
  /** 首页/落地页的一句副标题 —— 说清数据从哪来、产出是什么。 */
  subtitle: string;
  /** 当前页面提供的研究方式。 */
  pricingNote: string;
  status: ToolStatus;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
};

export const RESEARCH_PRODUCTS: ResearchProduct[] = [
  {
    id: "product-insight",
    slug: "product-insight",
    name: "商品口碑与需求洞察",
    short: "发现用户需求、产品问题和竞争机会",
    subtitle: "基于评论、社区讨论、问答、媒体和公开网页,分析用户需求、产品问题与竞争机会。",
    pricingNote: "本地资料研究 · 报告样例",
    status: "available",
    icon: Telescope,
  },
  {
    id: "product-vs-rivals",
    slug: "product-vs-rivals",
    name: "商品与竞品对比",
    short: "并排比较商品档案和评论样本",
    subtitle: "对比各主体口碑与用户选择原因,找出未满足需求与可争夺人群 —— 定性对比,非参数横评。",
    pricingNote: "本地资料研究 · 报告样例",
    status: "available",
    icon: GitCompare,
  },
  {
    id: "product-full",
    slug: "product-full",
    name: "商品综合研究",
    short: "需求、口碑、竞品与风险一次研究完",
    subtitle: "一份从需求到风险的全景报告,顶部一页决策摘要给去/留/改倾向 —— 不替你下终判。",
    pricingNote: "本地资料研究 · 报告样例",
    status: "available",
    icon: Microscope,
  },
];

export function researchBySlug(slug: string): ResearchProduct | undefined {
  return RESEARCH_PRODUCTS.find((r) => r.slug === slug);
}

/**
 * 每档研究产品的启动页 / 样例页路径 —— 单一来源。
 * 首页研究栏(center)与落地页(research)都从这里读,不再各写一遍 if 判断。
 * available 才有启动路径;竞品对比共用 product-insight 启动页并带 intent。
 */
export function researchStartPath(r: ResearchProduct): string | null {
  if (r.status !== "available") return null;
  if (r.id === "product-vs-rivals") return "/crossborder/research/workspace/?type=rival";
  if (r.id === "product-full") return "/crossborder/research/workspace/?type=full";
  return "/crossborder/research/workspace/";
}
export function researchSamplePath(r: ResearchProduct): string | null {
  if (r.id === "product-vs-rivals") return "/crossborder/research/sample/?type=rival";
  if (r.id === "product-full") return "/crossborder/research/sample/?type=full";
  if (r.id === "product-insight") return "/crossborder/research/sample/";
  return null;
}

export function toolsByCategory(category: ToolCategory): CrossborderTool[] {
  return CROSSBORDER_TOOLS.filter((t) => t.category === category);
}

export function workbenchesByCategory(category: ToolCategory): Workbench[] {
  return WORKBENCHES.filter((w) => w.category === category);
}

export function workbenchBySlug(slug: string): Workbench | undefined {
  return WORKBENCHES.find((w) => w.slug === slug);
}

export function popularTools(): CrossborderTool[] {
  return CROSSBORDER_TOOLS.filter((t) => t.popular);
}

export function toolBySlug(slug: string): CrossborderTool | undefined {
  return CROSSBORDER_TOOLS.find((t) => t.slug === slug);
}

/**
 * 工具与工作台合计的状态分布。
 * 深度研究使用独立入口，计算工具与研究资料分别统计。
 * 把 planned 的研究产品算进来会让这行话消失,误伤免费工具的承诺。
 */
export function statusCounts(): Record<ToolStatus, number> {
  const zero: Record<ToolStatus, number> = { available: 0, building: 0, planned: 0 };
  const all: ToolStatus[] = [...CROSSBORDER_TOOLS.map((t) => t.status), ...WORKBENCHES.map((w) => w.status)];
  return all.reduce((acc, s) => ({ ...acc, [s]: acc[s] + 1 }), zero);
}
