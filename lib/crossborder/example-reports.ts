/**
 * 示例商品名下的两份示例报告。
 *
 * 数据是**真实报告的快照**(从种子账号「32oz 保温运动水杯（翻盖吸管）」档案导出),
 * 保留了完整的五个研究阶段、章节、判词与 16 条来源 —— 所以示例里能展示真实报告
 * 的全部结构与操作,而不是一份阉割的假报告。
 * 我方分析文字里的真实竞品品牌名已换成描述性标签(避免在自家产品里点名贬损第三方);
 * **来源条目原样保留** —— 那是对公开网页的引用,篡改标题等于伪造引证。
 *
 * 它们只存在于前端，不写 research_run / report_run、不进入积分账本。
 * 列表是否展示只看 EXAMPLE_STABLE_ID 对应的示例商品是否仍存在；用户删除示例商品后，
 * 两份示例报告会自然消失。
 */

import FIXTURE from "./example-fixture.json";
import type { DeepReport, ReportReview, ThemeAgg } from "./deep-report";
import {
  EXAMPLE_PRODUCT_NAME, EXAMPLE_STABLE_ID, isExampleProduct,
} from "./example-product";
import { listProducts } from "./products";
import type {
  EvidenceItem, ResearchReport, ResearchScope,
} from "./research/types";

export const EXAMPLE_REPORT_PARAM = "example-product";
export const EXAMPLE_RESEARCH_HREF =
  `/crossborder/research/report/?sample=${EXAMPLE_REPORT_PARAM}`;
export const EXAMPLE_VOICE_HREF =
  `/crossborder/report/?sample=${EXAMPLE_REPORT_PARAM}`;
export const EXAMPLE_REPORT_DATE = "2026-07-18T10:30:00+08:00";
/**
 * 披露口径:这份示例是**真实报告的快照**,不是编造的演示稿 —— 所以措辞必须如实,
 * 不能再说「内容为演示编写」。要说清的是三件事:是示例、非实时、未消耗你的积分;
 * 另外分析文字里的竞品名已换成描述性标签(来源条目原样保留)。
 */
export const EXAMPLE_REPORT_DISCLOSURE =
  "这是一份示例报告，用于展示报告结构和使用方式。内容取自一份真实报告的快照（生成于 2026-07-18），"
  + "并非实时调研结论，未消耗积分；其中的竞品名已替换为描述性标签，引用来源保持原样。";

export function hasExampleProduct(): boolean {
  if (typeof window === "undefined") return false;
  return listProducts().some(isExampleProduct);
}

export function isExampleReportParam(value: string | null): boolean {
  return value === EXAMPLE_REPORT_PARAM;
}

const evidence = (
  id: string,
  title: string,
  kind: EvidenceItem["kind"],
  nature: EvidenceItem["nature"],
  snippet: string,
  reliability: EvidenceItem["reliability"] = "mid",
): EvidenceItem => ({
  id,
  url: null,
  title: `${title}（演示）`,
  kind,
  nature,
  publishedAt: "2026-06",
  fetchedAt: EXAMPLE_REPORT_DATE,
  snippet,
  reliability,
});

export const EXAMPLE_RESEARCH_SCOPE = FIXTURE.research.scope as unknown as ResearchScope;

/** 真实报告快照:8 章节 · 16 条来源 · 4 条判词。 */
export const EXAMPLE_RESEARCH_REPORT = FIXTURE.research.report as unknown as ResearchReport;

/** 五个研究阶段(真实用量):示例页照样展示阶段轨,只是不从用户账上扣分。 */
export const EXAMPLE_RESEARCH_STAGES = FIXTURE.research.stages as Array<{
  name: string; status: string; estimate: number; charged: number;
}>;
export const EXAMPLE_RESEARCH_RUN_ID = FIXTURE.research.runId;
export const EXAMPLE_RESEARCH_CHARGED = FIXTURE.research.totalCharged;
export const EXAMPLE_RESEARCH_QUOTE = FIXTURE.research.quote;

const review = (id: string, rating: number, text: string): ReportReview =>
  ({ id, rating, text });

export const EXAMPLE_VOICE_SOURCE_REVIEWS: ReportReview[] = [
  review("m1", 2, "Lid leaked all over my backpack on day two."),
  review("m2", 1, "Leaks from the straw whenever it tips over."),
  review("m3", 2, "Smaller than it looks in the photos."),
  review("m4", 1, "The paint started chipping after two weeks."),
  review("m5", 5, "Keeps my water ice cold for the entire workday."),
  review("m6", 4, "Great insulation, but it is a bit heavy when full."),
  review("m7", 3, "The straw is hard to clean."),
  review("m8", 2, "Lid leaks if it is not screwed on perfectly."),
];

export const EXAMPLE_VOICE_SOURCE_COMPETITOR: ReportReview[] = [
  review("c1", 2, "Coating chipped off after two weeks."),
  review("c2", 1, "Paint flakes near the rim."),
  review("c3", 5, "Keeps cold all day."),
  review("c4", 2, "Lid leaked in my bag."),
];

export const EXAMPLE_VOICE_THEMES: ThemeAgg[] = [
  { theme: "杯盖 / 吸管漏水", count: 4, share: 0.25, avgRating: 1.75, negShare: 1, quotes: ["Lid leaked all over my backpack", "Leaks from the straw"] },
  { theme: "长时间保冷", count: 3, share: 0.1875, avgRating: 4.67, negShare: 0, quotes: ["Keeps my water ice cold for the entire workday"] },
  { theme: "吸管清洁困难", count: 2, share: 0.125, avgRating: 2.5, negShare: 1, quotes: ["The straw is hard to clean"] },
  { theme: "涂层掉漆 / 刮花", count: 2, share: 0.125, avgRating: 1, negShare: 1, quotes: ["The paint started chipping"] },
  { theme: "重量偏大", count: 2, share: 0.125, avgRating: 4, negShare: 0.5, quotes: ["a bit heavy when full"] },
  { theme: "尺寸比预期小", count: 1, share: 0.0625, avgRating: 2, negShare: 1, quotes: ["Smaller than it looks in the photos"] },
];

export const EXAMPLE_VOICE_COMPETITOR_THEMES: ThemeAgg[] = [
  { theme: "涂层掉漆 / 刮花", count: 3, share: 0.5, avgRating: 2, negShare: 1, quotes: ["Coating chipped off", "Paint flakes near the rim"] },
  { theme: "杯盖 / 吸管漏水", count: 1, share: 0.1667, avgRating: 2, negShare: 1, quotes: ["Lid leaked in my bag"] },
  { theme: "长时间保冷", count: 1, share: 0.1667, avgRating: 5, negShare: 0, quotes: ["Keeps cold all day"] },
];

export const EXAMPLE_VOICE_REPORT: {
  productRef: string;
  productName: string;
  createdAt: string;
  stats: { total: number; avgRating: number };
  competitorCount: number;
  report: DeepReport;
} = {
  productRef: EXAMPLE_STABLE_ID,
  productName: EXAMPLE_PRODUCT_NAME,
  createdAt: EXAMPLE_REPORT_DATE,
  stats: { total: 16, avgRating: 2.88 },
  competitorCount: 6,
  report: {
    summary: "演示样本显示：保冷是最稳定的正向体验，漏水是影响背包通勤场景的首要风险；吸管清洁与涂层耐久决定长期口碑。优先级应为密封验证 → 清洁改进 → 涂层耐久。",
    topIssues: [
      {
        theme: "杯盖 / 吸管漏水",
        severity: "high",
        share: 0.25,
        evidence: ["Lid leaked all over my backpack on day two.", "Leaks from the straw whenever it tips over."],
        affected: ["密封结构", "背包通勤", "防漏宣称"],
        action: "先做侧放与翻倒漏水测试，未完成前不要使用“完全防漏”表述。",
      },
      {
        theme: "吸管清洁困难",
        severity: "mid",
        share: 0.125,
        evidence: ["The straw is hard to clean."],
        affected: ["吸管组件", "卫生感知"],
        action: "优化可拆洗结构，并在包装内提供清洁刷和拆洗图示。",
      },
      {
        theme: "涂层掉漆 / 刮花",
        severity: "mid",
        share: 0.125,
        evidence: ["The paint started chipping after two weeks."],
        affected: ["表面工艺", "外观耐久"],
        action: "补做洗碗机与日常磕碰测试，明确杯身手洗边界。",
      },
    ],
    positives: [
      {
        theme: "长时间保冷",
        share: 0.1875,
        note: "这是最稳定的正向主题，可在取得实测数据后作为核心卖点。",
      },
      {
        theme: "单手饮水便利",
        share: 0.125,
        note: "翻盖吸管适合健身与办公，但必须与真实防漏边界一起表达。",
      },
    ],
    competitorNotes: [
      "竞品的掉漆讨论更集中，示例商品可用耐磨实测与手洗说明建立可信差异。",
      "双方都有漏水反馈，单靠“翻盖吸管”无法形成差异，密封验证才是机会。",
      "竞品同样以保冷为基础卖点，Listing 需要加入清洁与配件支持，避免同质化。",
    ],
    cautions: [
      "本报告使用演示评论，不是平台全量样本，也不代表真实市场占比。",
      "主题占比只用于展示报告结构；不能据此估算退货率、销量或人群规模。",
      "引用文本为示例输入，未对应真实消费者账号或订单。",
    ],
  },
};
