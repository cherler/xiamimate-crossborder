import {
  parseReviewCsv,
  profileSample,
  detectSampleIssues,
  type Review,
} from "./review-insight";
import { redact, detectEscalations } from "./service-reply";

export const DEFAULT_TOPICS =
  "尺寸与适配: size, fit, small, large, 尺寸, 太小, 太大\n耐用与损坏: broken, broke, durable, crack, 漏水, 损坏, 耐用\n物流与包装: delivery, shipping, package, 包装, 物流\n使用体验: easy, difficult, noise, 方便, 难用, 噪音";
export const SAMPLE_CSV =
  'rating,date,variant,text\n2,2026-09-01,Blue,"The size is too small. The package was fine."\n5,2026-09-02,Blue,"Easy to use and a good fit."\n1,2026-09-03,Red,"It broke after a week."\n4,2026-09-04,Red,"Fast delivery and easy to use."';
export type TopicRule = { name: string; words: string[] };
export function parseTopics(text: string): TopicRule[] {
  const rules = text
    .split(/\r?\n/)
    .filter((s) => s.trim())
    .map((line) => {
      const match = line.match(/^([^:：]+)[:：](.+)$/);
      if (!match)
        throw new Error("主题每行使用「主题名: 关键词, 关键词」格式。");
      const name = match[1].trim(),
        words = [
          ...new Set(
            match[2]
              .split(/[,，]/)
              .map((w) => w.trim().toLowerCase())
              .filter(Boolean),
          ),
        ];
      if (!name || !words.length || words.some((w) => w.length > 100))
        throw new Error("主题或关键词为空，或关键词超过 100 个字符。");
      return { name, words };
    });
  if (
    !rules.length ||
    rules.length > 50 ||
    new Set(rules.map((r) => r.name)).size !== rules.length
  )
    throw new Error("请填写 1—50 个不重复的主题。");
  return rules;
}
function matches(text: string, word: string): boolean {
  const t = text.toLowerCase();
  if (/^[a-z0-9\s-]+$/i.test(word)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      "(?:^|[^a-z0-9])" + escaped + "(?=$|[^a-z0-9])",
      "i",
    ).test(t);
  }
  return t.includes(word);
}
export function summarizeTopics(reviews: Review[], rules: TopicRule[]) {
  return rules.map((rule) => {
    const hits = reviews.filter((r) =>
      rule.words.some((w) => matches(r.text, w)),
    );
    return {
      name: rule.name,
      count: hits.length,
      share: reviews.length
        ? Math.round((hits.length / reviews.length) * 1000) / 10
        : 0,
      low: hits.filter((r) => r.rating > 0 && r.rating <= 2).length,
      high: hits.filter((r) => r.rating >= 4).length,
      evidence: hits.slice(0, 3).map((r) => r.text),
    };
  });
}
export function analyseLocally(csv: string, rivalCsv: string, topics: string) {
  const mine = parseReviewCsv(csv),
    rival = rivalCsv.trim() ? parseReviewCsv(rivalCsv) : null;
  if (mine.missingText || !mine.reviews.length)
    throw new Error(
      "没有识别到评论。CSV 表头需要 text、body 或 评论，评分可用 rating 或 评分。",
    );
  if (rival && (rival.missingText || !rival.reviews.length))
    throw new Error("竞品 CSV 没有识别到评论，请检查表头。");
  const rules = parseTopics(topics),
    profile = profileSample(mine.reviews);
  return {
    profile,
    themes: summarizeTopics(mine.reviews, rules),
    warnings: detectSampleIssues(profile),
    competitor: rival
      ? {
          profile: profileSample(rival.reviews),
          themes: summarizeTopics(rival.reviews, rules),
        }
      : null,
  };
}
export type ServiceScenario = "delivery" | "damage" | "refund" | "usage";
export function serviceTemplate(
  message: string,
  scenario: ServiceScenario,
  language: "en" | "zh",
) {
  const safe = redact(message).text,
    escalations = detectEscalations(message);
  if (escalations.length) return { safe, escalations, reply: "" };
  const content = {
    en: {
      delivery:
        "Thank you for letting us know about the delivery issue. Please check the latest tracking information in your order details and confirm whether the parcel has arrived. We will review the available order information and help you with the next step through the platform.",
      damage:
        "We are sorry to hear that the item arrived damaged or did not work as expected. Please describe the issue and, if possible, attach a photo through the platform. We will review the information and confirm the available options under the order policy.",
      refund:
        "We understand that you would like to return the item or request a refund. Please open your order details and check the return options provided by the platform. We can help clarify the next step after reviewing your order; eligibility and timing depend on the applicable policy.",
      usage:
        "Thank you for your question. Please describe the step you are having trouble with and the version of your product. We will check the product instructions and provide the relevant guidance. Please stop using the item if it appears damaged or unsafe.",
    },
    zh: {
      delivery:
        "感谢您告知配送情况。请先在订单详情查看最新物流信息，并确认是否已收到包裹。我们会核对可查询的订单信息，并通过平台协助您确认下一步处理方式。",
      damage:
        "很抱歉商品出现损坏或未达到预期使用状态。请描述具体问题，并在方便时通过平台附上照片。我们会核对情况，再根据订单适用政策确认可提供的处理方案。",
      refund:
        "我们理解您希望退货或申请退款。请先在订单详情查看平台提供的退货入口。核对订单后，我们可以协助确认下一步；是否符合条件及处理时间以适用政策为准。",
      usage:
        "感谢您的咨询。请说明遇到问题的具体步骤及商品版本，我们会核对商品说明后提供相应操作指引。如商品已有损坏或存在安全疑虑，请先停止使用。",
    },
  };
  return { safe, escalations, reply: content[language][scenario] };
}
