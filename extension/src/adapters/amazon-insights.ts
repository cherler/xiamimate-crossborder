/**
 * 亚马逊「Customers say」全量口碑摘要。
 *
 * 这是整个评论功能里最有价值的一块,而它一度被我忽略了。
 *
 * 亚马逊在详情页上印着**基于全部评论**的主题聚类:
 *   Effectiveness (4.9K) ↗   Suction (1.5K) ~   Leakage (1.3K) ↘
 * 那些数字来自全部 94,050 条评论,而我们逐页采集最多只能拿到十几条 ——
 * 亚马逊已经关掉了评论深度翻页与星级筛选(实测)。
 *
 * 所以口碑分析的重心应该是:
 *   主题与量级 ← 亚马逊的全量聚类(可信、覆盖完整)
 *   代表性原文 ← 我们采的十几条(让用户看到买家具体说了什么)
 * 而不是用十几条评论自己聚类 —— 那个结论的置信度撑不起来。
 *
 * 诚实的边界:这是**亚马逊的**分析,粒度粗(通常八个主题),
 * 计数是「多少条评论提到这个主题」而不是「多少人抱怨」,
 * 而且评论少的商品根本没有这一块。这些都要如实标注,不能拿来当自己的分析卖。
 */
import { parseCount } from "./types";
import { marketOf } from "./amazon";

export const INSIGHTS_VERSION = "amazon-insights@3";

export type InsightTopic = {
  name: string;
  /** 提到该主题的评论条数(4.9K → 4900)。这是全量口径,不是我们的样本。 */
  mentions: number;
  /** 情绪方向。有正负条数时按条数判定,否则退回图标,再不行就 unknown —— 不猜。 */
  sentiment: "positive" | "negative" | "mixed" | "unknown";
  /**
   * 正/负面条数。亚马逊在页面上写着
   * 「96 customers mention effectiveness, 79 positive, 17 negative」——
   * 比箭头方向精确得多:箭头只说方向,条数能算比例,也就能排出「先改哪个」。
   */
  positive?: number;
  negative?: number;
};

export type ProductInsights = {
  platform: string;
  marketplace: string;
  externalId: string;
  adapterVersion: string;
  /** 亚马逊的整段摘要原文 */
  summary: string;
  topics: InsightTopic[];
  /** 该商品评论总数 —— 主题计数的分母 */
  totalReviews: number | null;
  capturedAt: string;
  sourceUrl: string;
};

/**
 * "4.9K" / "1,234" / "1.234"(德/西/意站的千分位是点) / "2.8M" → 数字
 *
 * 分隔符的含义**取决于后面有没有 K/M**,不能一概而论:
 *   有单位 → 是小数点。"4.9K" = 4900,把点删掉会得到 49000。
 *   无单位 → 是千分位。提及量永远是整条数,不存在「1.234 条评论提到」;
 *            所以 amazon.de 的 "1.234" 是 1234,不是 1.234。
 *
 * 原来只删逗号:德/西/意站上 1.234 条提及读成 **1**,差三个数量级。
 * 而它不会被任何校验拦下 —— mentions > totalReviews 那道只防偏大,
 * 偏小的错值一路进到报告里,还会因为排序键变小被埋到主题列表末尾:
 * 用户看到的是「这个主题几乎没人提」,恰好是事实的反面。
 */
function parseMentions(raw: string): number | null {
  const m = raw.match(/([\d.,]+)\s*([KMkm])?/);
  if (!m?.[1]) return null;
  const unit = (m[2] ?? "").toUpperCase();
  const digits = unit
    ? m[1].replace(/,/g, ".")          // 有单位:统一成小数点再算
    : m[1].replace(/[.,]/g, "");       // 无单位:全是千分位,删掉
  const base = Number(digits);
  if (!Number.isFinite(base)) return null;
  return Math.round(base * (unit === "K" ? 1000 : unit === "M" ? 1_000_000 : 1));
}

// ---------------- 主题 ----------------

/** 主题名 + 计数,如 "Leakage (1.3K)" */
const CHIP_RE = /^(.{2,40}?)\s*[（(]\s*([\d.,]+\s*[KMkm]?)\s*[)）]$/;

/**
 * 「96 customers mention effectiveness, 79 positive, 17 negative」
 *
 * 这一句藏在页面文字里,给的是每个主题的正负面**条数**。
 * 比箭头方向值钱得多:箭头只说方向,条数能算比例,也就能排出「先改哪个」。
 */
const MENTION_RE = /(\d[\d,]*)\s+customers?\s+mention[s]?\s+"?([^",.]{2,40}?)"?[,\s]+(\d[\d,]*)\s+positive[,\s]+(\d[\d,]*)\s+negative/gi;

/**
 * 显然不是口碑主题的词 —— 翻页、跳转之类也长成「文字 (数字)」。
 *
 * **CJK 分支不能带 \b** —— \b 要求两侧有一个是 \w,而汉字不是,于是
 * 「下一页」「查看全部」「评论」全部匹配不上,中文分支整段是死代码:
 * 中文界面下任何「中文噪声词 (数字)」都会作为口碑主题进报告、带着计数参与排序。
 * 这个坑在本仓库已经栽过两次(brandOf 的键名、amazon.ts:294 的注释写着),这是第三次。
 * 英文侧保留 \b(要防 "Brands" 之类的误伤),CJK 侧直接前缀匹配。
 */
const NOISE_RE = /^(?:(?:next|prev|previous|page|see|view|more|all|top|review|reviews|star|stars|photo|photos|video|videos)\b|下一页|上一页|查看|全部|评论|图片|更多)/i;

function sentimentFromCounts(pos: number, neg: number): InsightTopic["sentiment"] {
  const total = pos + neg;
  if (!total) return "unknown";
  const negShare = neg / total;
  if (negShare >= 0.4) return "negative";
  if (negShare >= 0.15) return "mixed";
  return "positive";
}

/*
 * 这里原本有一条「按图标类名猜方向」的后备判据。已删。
 *
 * 类名亚马逊换过好几轮,猜错的时候它会给出一个**自信的错颜色** ——
 * 把「漏水」标成绿色的优点,比不给这条信息糟得多。
 * 而这正是本文件开头立的规矩:认不出就是 unknown,不猜。
 *
 * 现在的判据只有一条:页面上白纸黑字写着的正负条数。拿不到就中性灰。
 */

/** 从页面文字里抽出每个主题的正负条数 */
function mentionStats(doc: Document): Map<string, { mentions: number; positive: number; negative: number }> {
  const out = new Map<string, { mentions: number; positive: number; negative: number }>();
  const text = doc.body?.textContent?.replace(/\s+/g, " ") ?? "";
  const n = (v: string) => Number(v.replace(/,/g, "")) || 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const key = (m[2] ?? "").trim().toLowerCase();
    if (!key || out.has(key)) continue;
    out.set(key, { mentions: n(m[1] ?? ""), positive: n(m[3] ?? ""), negative: n(m[4] ?? "") });
  }
  return out;
}

function topicsOf(doc: Document, totalReviews: number | null): InsightTopic[] {
  const out: InsightTopic[] = [];
  const seen = new Set<string>();
  const stats = mentionStats(doc);

  // 主题以「名字 (计数)」的形式出现在可点击元素上。按文字模式找,不认容器 ——
  // 这一块的容器 id 亚马逊换得比谁都勤。
  for (const el of Array.from(doc.querySelectorAll("a, button, span, li"))) {
    const t = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (t.length > 50) continue;
    const m = t.match(CHIP_RE);
    if (!m?.[1] || !m[2]) continue;
    const name = m[1].trim();
    const key = name.toLowerCase();
    const mentions = parseMentions(m[2]);
    if (!mentions || seen.has(key)) continue;

    /*
     * 噪声过滤。原来用的是「提及量 < 50 就丢」—— 那是照一个 94,050 条评论的
     * 商品校的阈值。实测在一个 685 条评论的商品上,八个主题的提及量是
     * 96/57/35/31/26/24/24/23,除了前两个全被这条规则杀掉了。
     *
     * 绝对阈值本来就不对:主题量级随商品评论总数变化两三个数量级。
     * 改成三条与量级无关的判据:
     *   1. 名字不像翻页/跳转这类零碎
     *   2. 名字里得有词,不能是纯数字/符号
     *   3. 提及量不能超过评论总数(超了说明匹配到的根本不是主题)
     */
    if (NOISE_RE.test(name)) continue;
    // 词形:至少两个「字」。原来只认拉丁字母与汉字 —— amazon.co.jp 上
    // 纯假名的主题(如「におい」)被静默丢掉,是漏值不是错值,但同样无提示。
    if (!/[A-Za-z一-龥ぁ-んァ-ヶ가-힣]{2}/.test(name)) continue;
    if (totalReviews && mentions > totalReviews) continue;

    const stat = stats.get(key);
    seen.add(key);
    out.push({
      name,
      mentions: stat?.mentions || mentions,
      // 有正负条数就按条数判,比图标可靠:图标类名亚马逊换过好几轮
      // 只认页面上写着的条数。拿不到就 unknown —— 见上方注释
      sentiment: stat ? sentimentFromCounts(stat.positive, stat.negative) : "unknown",
      ...(stat ? { positive: stat.positive, negative: stat.negative } : {}),
    });
  }
  return out.sort((a, b) => b.mentions - a.mentions).slice(0, 20);
}

// ---------------- 摘要 ----------------

/**
 * 摘要正文。
 *
 * 「取最长的一段」这个办法翻车了:实测抓回来的是整个控件的拼接文本 ——
 * 「AI Generated from the text of customer reviewsSelect to learn
 *   moreEffectiveness(96)Quality(57)…96 customers mention effectiveness,
 *   79 positive, 17 negative…」
 * 那不是摘要,是把标签、计数、按钮文字全糊在一起。
 *
 * 改成先排除、再挑选:含标签模式或按钮文字的一律不是摘要,
 * 剩下的里面挑真正像一段话的那个。宁可返回空,也不要糊一坨给用户。
 */
const SUMMARY_NOISE = /(select to learn more|read more|generated from the text|\(\d+\)|customers mention)/i;

function looksLikeProse(t: string): boolean {
  if (t.length < 60 || t.length > 1500) return false;
  if (SUMMARY_NOISE.test(t)) return false;
  // 一段话该有句末标点,且不能是一串没有空格的拼接物
  const spaces = (t.match(/ /g) ?? []).length;
  return /[.。!！?？]/.test(t) && spaces / t.length > 0.08;
}

function summaryOf(doc: Document): string {
  const candidates: string[] = [];
  for (const el of Array.from(doc.querySelectorAll("p, span, div"))) {
    // 只看叶子块,否则必然取到把整个控件包住的那个容器
    if (el.querySelector("p, span, div")) continue;
    const t = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (looksLikeProse(t)) candidates.push(t);
  }
  if (!candidates.length) return "";
  // 「Customers find/say…」是亚马逊摘要的固定句式,优先
  const lead = candidates.find((t) => /^customers?\s+(find|say|like|appreciate|mention|are)/i.test(t));
  return (lead ?? candidates.sort((a, b) => b.length - a.length)[0]!).slice(0, 1200);
}

// ---------------- 入口 ----------------

export function captureInsights(doc: Document, rawUrl: string): ProductInsights | null {
  const url = new URL(rawUrl);
  const marketplace = marketOf(url);
  if (!marketplace) return null;
  const asin = url.pathname.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i)?.[1]
    ?? doc.querySelector("input#ASIN")?.getAttribute("value") ?? "";
  if (!/^[A-Z0-9]{10}$/i.test(asin)) return null;

  const totalReviews = parseCount(doc.querySelector("#acrCustomerReviewText")?.textContent ?? "") ?? null;
  const summary = summaryOf(doc);
  const topics = topicsOf(doc, totalReviews);
  // 两样都没有 = 这个商品没有这一块(评论太少),不是解析失败
  if (!summary && !topics.length) return null;

  return {
    platform: "amazon",
    marketplace,
    externalId: asin.toUpperCase(),
    adapterVersion: INSIGHTS_VERSION,
    summary,
    topics,
    totalReviews,
    capturedAt: new Date().toISOString(),
    sourceUrl: `${url.origin}${url.pathname}`,
  };
}
