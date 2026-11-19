import type { Product } from "../products";
import { captureBundles, collectedReviews } from "../collector";
import { reviewsCsv, safeHttpUrl } from "../../../shared/collector";
import { analyseLocally, DEFAULT_TOPICS } from "../local-workbench";
export const LOCAL_RESEARCH_TYPES = [
  { id: "voice", name: "商品口碑与需求洞察", description: "按样本主题整理需求与问题，逐条回看原文和来源。", sample: "" },
  { id: "rival", name: "商品与竞品对比", description: "并排比较商品资料和评论样本，保留各自的采样口径。", sample: "?type=rival" },
  { id: "full", name: "商品综合研究", description: "汇总商品、口碑、竞品与经营假设，形成待验证的行动清单。", sample: "?type=full" },
] as const;
export type LocalResearchMode = typeof LOCAL_RESEARCH_TYPES[number]["id"];
export type ResearchInput = {
  product: Product; rival?: Product; mode: LocalResearchMode; question: string;
  evidence: string; conclusion: string; actions: string; topics: string;
};
export function parseEvidence(text: string) {
  return text.split(/\r?\n/).filter(s => s.trim()).map((line, i) => {
    const split = line.indexOf("|");
    const url = safeHttpUrl(line.slice(0, split).trim());
    const excerpt = line.slice(split + 1).trim();
    if (split < 1 || !url || !excerpt || excerpt.length > 5000 || i >= 30)
      throw new Error("资料第 " + (i + 1) + " 行请使用「https://来源链接 | 摘录或备注」格式，最多 30 条。");
    return { url, excerpt };
  });
}
export function buildResearchDraft(input: ResearchInput, now = new Date()): string {
  const { product, rival, mode } = input;
  if (mode === "rival" && !rival) throw new Error("请先选择一份竞品档案。可用采集助手建立竞品资料。");
  if (rival?.id === product.id) throw new Error("请选择另一份商品作为竞品。");
  const evidence = parseEvidence(input.evidence);
  const type = LOCAL_RESEARCH_TYPES.find(t => t.id === mode)!;
  const lines = [
    "# " + type.name + " · " + product.name,
    "", "本地研究底稿 · " + now.toISOString(),
    "依据当前档案、采集样本和用户补充资料整理；未进行自动联网检索或 AI 推理。", "",
    "## 研究问题", input.question.trim() || "尚未填写研究问题。", "",
  ];
  const subjects = [product, ...(rival && mode !== "voice" ? [rival] : [])];
  subjects.forEach((p, index) => {
    const bundles = captureBundles(p), reviews = collectedReviews(p), prefix = index === 0 ? "P" : "R";
    lines.push("## " + (index === 0 ? "研究商品" : "对照竞品") + "：" + p.name, p.marketplace + " · " + (p.asin || "未设商品编号"), "");
    if (p.platform) {
      lines.push("页面观察资料（非实时）：",
        ...Object.entries(p.platform).filter(([k]) => !["adapterVersion", "mainImage"].includes(k)).map(([k,v]) => "- " + k + "：" + (k === "capturedAt" ? new Date(Number(v)).toISOString() : v)), "");
    } else lines.push("未采集平台资料；当前名称由用户建档。", "");
    const platform = bundles.find(b => b.insights)?.insights;
    if (platform) lines.push("### 平台摘要（与本地评论统计分开）", platform.summary || "无摘要原文。",
      ...platform.topics.map(t => "- " + t.name + "：" + t.mentions + " 次提及；平台方向 " + t.sentiment),
      "来源：" + platform.sourceUrl + " · " + platform.capturedAt, "");
    lines.push("### 评论样本", "去重后 " + reviews.length + " 条；不是完整评论库，各商品样本不可直接推断市场占比。");
    if (reviews.length) {
      const analysis = analyseLocally(reviewsCsv(reviews), "", input.topics || DEFAULT_TOPICS);
      lines.push("已评分样本均分：" + (analysis.profile.avgRating || "未知"), "主题按关键词命中统计，可重叠；不判断原因或语义。", "",
        ...analysis.themes.map(t => "- " + t.name + "：" + t.count + " 条（" + t.share + "%），低分 " + t.low + "，高分 " + t.high));
      lines.push(...analysis.warnings.map(w => "样本提示：" + w.text), "", "### 评论原文索引");
      for (const [i, r] of reviews.entries()) lines.push("[" + prefix + (i + 1) + "] " + (r.rating || "未评") + " 星 · " + r.date + " · " + r.variant, [r.title, r.text].filter(Boolean).join(" — "));
    } else lines.push("缺少评论样本，不能据此判断需求频率或口碑方向。");
    lines.push("", "### 采集来源与范围");
    const pages = new Set<string>();
    for (const b of bundles) {
      if (b.product) pages.add(b.product.sourceUrl + " · " + b.product.capturedAt);
      for (const pg of b.reviews?.pages ?? []) pages.add(pg.sourceUrl + " · 第 " + pg.pageNumber + " 页 · " + pg.sampleType + " · 筛选 " + (pg.starFilter || "无") + " · 排序 " + (pg.sortBy || "默认") + " · " + pg.capturedAt);
    }
    lines.push(...(pages.size ? [...pages].map(s => "- " + s) : ["尚未导入带来源的采集资料。"]), "");
  });
  if (mode === "full") {
    lines.push("## 经营假设（用户当前测算参数，可能含默认值）",
      "售价：" + product.finance.price + "；采购成本：" + product.finance.cost +
      "；国内运费：" + product.finance.domestic + "；头程：" + product.finance.head +
      "；尾程：" + product.finance.lastMile + "；目标净利率：" + product.finance.target + "%",
      "以上不是平台真实经营数据；请在综合测算中核实成本模块、币种、税费与广告假设。", "");
  }
  lines.push("## 补充资料（用户提供，未自动核验）",
    ...(evidence.length ? evidence.flatMap((e,i) => ["[S" + (i + 1) + "] " + e.url, e.excerpt]) : ["尚未补充外部资料。"]), "",
    "## 我的判断（用户填写）", input.conclusion.trim() || "尚未形成判断。请引用评论索引或资料编号说明依据，不要将假设写成事实。", "",
    "## 下一步验证（用户填写）", input.actions.trim() || "补充缺失资料；复核来源与采样范围；核实经营参数后再作决策。", "",
    "## 边界与缺口", "未核验市场规模、真实销量、供应链报价或法规合规；未自动访问来源网页。页面口碑摘要属于平台展示，样本占比仅适用于本次输入。",
    "不能将本底稿当作已完成的自动 AI 深度研究报告。");
  return lines.join("\n");
}
