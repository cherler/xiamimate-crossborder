/**
 * 口碑样本:一个商品在某个时点的一批评论。
 *
 * 两种来源共用这一套读写 —— 分开会让「口碑样本」在产品里裂成两个概念:
 *   upload    你从卖家后台导出的 CSV。完整,无采样偏差,但只有自己的商品有。
 *   extension 浏览器扩展在商品页采的。有采样偏差,但对手的只能这么拿。
 *
 * 样本**不进 localStorage**:几百条评论上百 KB,本地存不下,而且它是分析原料
 * 不是档案元数据。这是商品档案里唯一偏离「本地优先」的一块,理由是体量。
 */
import { authFetch } from "../api";
import type { Product } from "./products";

export type SampleSource = "upload" | "extension";

export type SampleProvenance = {
  sampleType?: "featured" | "list" | "upload";
  /** 商品名。插件在评论页顺带抓的 —— 只采评论没采商品时靠它建档 */
  productTitle?: string;
  /** 真实星级分布(百分比)。分层样本还原成整体的权重。 */
  ratingHistogram?: Record<string, number> | null;
  /** 已采过哪些星级筛选 */
  starsCovered?: string[];
  pageNumber?: number;
  pageNumbers?: number[];
  pageCount?: number;
  starFilter?: string;
  sortBy?: string;
  reviewerType?: string;
  totalReviews?: number | null;
  capturedAt?: string | null;
  sourceUrl?: string;
};

/** 与 asin.ts 的 isTikTokMarket 同源;这里内联一份避免为一个判断引入整个模块。 */
const isTikTok = (m?: string): boolean => !!m && m.toLowerCase().startsWith("tiktok");

export type ReviewSampleMeta = {
  batchId: string;
  /** 采自哪个站点(amazon-us / tiktok-us …)。文案按平台说话要用它 ——
   *  「亚马逊精选评论」这种话对 TikTok 卖家是错的。 */
  marketplace?: string;
  source: SampleSource;
  label: string;
  reviewCount: number;
  provenance: SampleProvenance;
  createdAt: string;
};

export type SampleReview = {
  id: string; rating: number; date: string; variant: string;
  title: string; text: string; verified: boolean; helpful: number;
};

function normalize(row: Record<string, unknown>): ReviewSampleMeta {
  return {
    batchId: String(row.batch_id ?? ""),
    source: (row.source === "upload" ? "upload" : "extension"),
    label: String(row.label ?? ""),
    reviewCount: Number(row.review_count ?? 0),
    provenance: (row.provenance ?? {}) as SampleProvenance,
    marketplace: String(row.marketplace ?? "") || undefined,
    createdAt: String(row.created_at ?? ""),
  };
}

/** 某商品的全部样本。ASIN 与档案 stableId 两条归属键并起来查。 */
export async function listSamples(product: Pick<Product, "asin" | "marketplace" | "stableId">): Promise<ReviewSampleMeta[]> {
  return (await listSamplesWithTotal(product)).items;
}

/**
 * 同上,外加**去重后的总条数**。
 *
 * 各批的 reviewCount 直接相加会重复计数,而重复是正常且必然的:
 * 「采集本页商品」顺带采本页评论,用户之后单独采评论又会采到同一页。
 * 实测「2 批 · 共 24 条」去重后其实是 21 条 —— 虚高的样本量会直接抬高
 * 用户对结论的信任度,而这个产品的全部前提就是「偏样本不许伪装成全样本」。
 *
 * 去重必须在服务端算:列表刻意不带正文(几百 KB),前端拿不到 id。
 */
export async function listSamplesWithTotal(
  product: Pick<Product, "asin" | "marketplace" | "stableId">,
): Promise<{ items: ReviewSampleMeta[]; distinctTotal: number }> {
  const q = new URLSearchParams();
  if (product.asin) { q.set("externalId", product.asin); q.set("marketplace", product.marketplace || "amazon-us"); }
  if (product.stableId) q.set("productRef", product.stableId);
  if (![...q.keys()].length) return { items: [], distinctTotal: 0 };
  const res = await authFetch(`/v1/extension/reviews?${q}`);
  if (!res.ok) return { items: [], distinctTotal: 0 };
  const data = await res.json().catch(() => ({}));
  const items = (Array.isArray(data.items) ? data.items : []).map(normalize);
  /*
   * 服务端没给就退回相加 —— 但那是**旧后端**的情况(字段刚加)。
   * 不能因为拿不到就显示 0:那会让用户以为一条都没采到。
   * 相加偏高,至少方向是"有东西",而且这个分支很快就不会走到。
   */
  const distinctTotal = typeof data.distinctTotal === "number"
    ? data.distinctTotal
    : items.reduce((n: number, s: ReviewSampleMeta) => n + s.reviewCount, 0);
  return { items, distinctTotal };
}

/** 取一批的完整正文。列表刻意不带正文(几百 KB),要用时才拉。 */
export async function loadSample(batchId: string): Promise<SampleReview[]> {
  const res = await authFetch(`/v1/extension/reviews/${encodeURIComponent(batchId)}`);
  if (!res.ok) throw new Error("样本加载失败。");
  const data = await res.json();
  return Array.isArray(data.reviews) ? data.reviews : [];
}

export type OrphanSample = ReviewSampleMeta & {
  marketplace: string;
  externalId: string;
  productTitle: string;
};

/**
 * 找出「有评论样本、却没有商品档案」的那些。
 *
 * 用户可以只采评论不采商品(直接在评论页点采集)。那样样本存下来了,
 * 但档案页永远查不到它 —— 孤儿。这件事只能在客户端对账:
 * 商品档案是本地优先的,localStorage 才是主本,服务端不知道你本地有什么。
 */
export async function findOrphans(
  known: Pick<Product, "asin" | "marketplace" | "stableId">[],
  /**
   * 待确认队列里的商品。
   *
   * 它们**不算孤儿** —— 用户点一下「导入商品档案」就有档案了。
   * 采集商品时评论是一起采的:评论直接入库,而商品要走待确认队列,
   * 于是中间那段时间里同一个商品会被两处同时催 ——
   * 上面说「缺档案,去补建」,下面说「等你确认导入」。实测就是这个样子。
   */
  pending: { platform: string; marketplace: string; externalId: string }[] = [],
): Promise<OrphanSample[]> {
  const res = await authFetch("/v1/extension/reviews/all");
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const rows: Record<string, unknown>[] = Array.isArray(data.items) ? data.items : [];

  const haveAsin = new Set(known.filter((p) => p.asin)
    .map((p) => `${p.asin}|${p.marketplace}`.toLowerCase()));
  const haveRef = new Set(known.map((p) => p.stableId));
  const queued = new Set(pending.map((x) => `${x.externalId}|${x.marketplace}`.toLowerCase()));

  const out: OrphanSample[] = [];
  for (const row of rows) {
    const externalId = String(row.external_id ?? "");
    const marketplace = String(row.marketplace ?? "");
    const productRef = String(row.product_ref ?? "");
    if (productRef && haveRef.has(productRef)) continue;
    const asinKey = `${externalId}|${marketplace}`.toLowerCase();
    if (externalId && haveAsin.has(asinKey)) continue;
    if (externalId && queued.has(asinKey)) continue;   // 待确认队列里,马上就有档案
    if (!externalId) continue;                       // 没 ASIN 又没档案:建不出来,跳过
    const meta = normalize(row);
    out.push({
      ...meta, marketplace, externalId,
      productTitle: String(meta.provenance.productTitle ?? ""),
    });
  }
  return out;
}

export async function deleteSample(batchId: string): Promise<boolean> {
  const res = await authFetch(`/v1/extension/reviews/${encodeURIComponent(batchId)}`, { method: "DELETE" });
  return res.ok;
}

/** 上传的 CSV 存成样本,绑到当前商品档案上。 */
export async function saveUpload(
  product: Pick<Product, "asin" | "marketplace" | "stableId">,
  reviews: SampleReview[], label: string,
): Promise<boolean> {
  const res = await authFetch("/v1/extension/reviews/upload", {
    method: "POST",
    body: JSON.stringify({
      marketplace: product.marketplace || "amazon-us",
      externalId: product.asin ?? "",
      productRef: product.stableId,
      label, reviews,
    }),
  });
  return res.ok;
}

/**
 * 一句话说清这批样本是怎么来的。
 *
 * 这是整个功能里最要紧的一句话:同样 320 条评论,「后台导出的完整数据」与
 * 「只看了一星、翻了 3 页」得出的结论完全不是一回事,而两份报告长得一模一样。
 * 所以凡是展示样本的地方,都必须把这句话摆在旁边。
 */
export function describeSample(s: ReviewSampleMeta): string {
  const p = s.provenance;
  if (s.source === "upload") {
    return `你上传的完整数据${s.label ? ` · ${s.label}` : ""}`;
  }
  if (p.sampleType === "featured") {
    /*
     * featured 在两个平台的含义不同,不能共用一句话:
     *   亚马逊 —— 平台**挑过**的 8 条,本身就有倾向性,「精选」是准确的;
     *   TikTok —— **没有精选这回事**。详情页嵌的就是评论列表的第 1 页,
     *     下面带着完整分页条。所以这里的 featured 只表示「没认出在第几页」,
     *     是我们的口径不确定,不是平台挑过。
     *     早先写成「详情页内联的少量评论 —— 其余需滚动加载」,那是把 TikTok
     *     当成亚马逊去理解的产物:成因说错了,而且用户翻了 7 页采回 21 条之后
     *     看到的仍是这句话(实测),会以为采集没生效。
     */
    return isTikTok(s.marketplace)
      ? "没认出是评论列表第几页 —— 采样口径不确定,结论请谨慎"
      : "详情页精选评论 —— 亚马逊挑过的，不能代表整体";
  }
  const parts = ["浏览器采集"];

  /*
   * **TikTok 到此为止,不再往后拼。**
   *
   * 后面那几段(N 页 / 仅 X 星 / 按最新排序 / 仅已购买)是为亚马逊设计的:
   * 那边我们**确实读得到**星级筛选与排序,而「只采了 1 星」会让占比结论严重偏高,
   * 是必须说出来的偏差信号。
   *
   * TikTok 这几样一个都读不到:
   *  - 排序与筛选:页面上的控件我们从没读过。此前写死成 sortBy:"recent",
   *    于是卡片上印着「按最新排序」—— 而 TikTok 默认是**推荐排序**。
   *    断言一件没核实过的事,刚好错在「这批样本有没有偏」这个最需要准确的地方。
   *  - 页数:去重键是 sourceUrl,而 TikTok 翻页不改 URL(分页是 React 状态),
   *    所以 pageCount 结构上恒为 1。实测用户翻了 7 页,记下来的仍是 1 页。
   *
   * 页数那条已经修好(去重键加上 pageNumber),但它**不是偏差信号**:
   * 用户可以先采第 10 页再回头采 1、2、3 页,「7 页」既不代表覆盖也不代表顺序。
   * 真正决定这批样本可不可信的是**采样比例**,而那句话由 samplePenalty 给
   * (「只采了该商品 0.3% 的评论」),对分页与否一样成立。
   *
   * 所以这里只说我们确知的:来源。多说一个字都是在替用户脑补。
   */
  if (isTikTok(s.marketplace)) return parts[0]!;

  const covered = p.starsCovered?.length ?? 0;
  if (covered > 1) parts.push(`按星级分层 ${covered}/5 档`);
  else if (p.pageCount) parts.push(`${p.pageCount} 页`);
  if (covered <= 1 && p.starFilter) parts.push(`仅 ${STAR_LABEL[p.starFilter] ?? p.starFilter}`);
  if (p.sortBy?.includes("recent")) parts.push("按最新排序");
  if (p.reviewerType?.includes("avp")) parts.push("仅已购买");
  if (p.totalReviews) parts.push(`该商品共 ${p.totalReviews.toLocaleString()} 条`);
  return parts.join(" · ");
}

const STAR_LABEL: Record<string, string> = {
  one_star: "一星", two_star: "二星", three_star: "三星",
  four_star: "四星", five_star: "五星", critical: "差评", positive: "好评",
};

/** 这批样本可信吗 —— 用于决定要不要在报告上打警告。 */
export function samplePenalty(s: ReviewSampleMeta): string | null {
  if (s.source === "upload") return null;                      // 完整数据,无采样偏差
  const p = s.provenance;
  if (p.sampleType === "featured") {
    return isTikTok(s.marketplace)
      // TikTok 没有「精选」——featured 在这里表示「没认出在第几页」
      ? "没能确认这批评论来自列表第几页，采样口径不确定，结论只能当线索。"
      : "这是亚马逊精选的少量评论，结论只能当线索，不能当结论。";
  }

  const covered = p.starsCovered?.length ?? 0;
  if (covered > 1) {
    // 分层采样:各档条数不代表真实占比,必须按真实分布还原
    if (!p.ratingHistogram) {
      return `按 ${covered} 个星级分别采集，但没抓到该商品的真实星级分布 —— 占比类结论不可用（各档条数不等于真实占比）。`;
    }
    if (covered < 5) {
      return `按星级采集了 ${covered}/5 档，缺档的那部分不会出现在结论里。占比已按真实分布还原。`;
    }
    return null;                                               // 五档齐全 + 有权重 = 可还原
  }
  if (p.starFilter) return `这批只包含${STAR_LABEL[p.starFilter] ?? p.starFilter}评论，占比类结论会严重偏高。`;
  if (p.totalReviews && s.reviewCount / p.totalReviews < 0.02) {
    /*
     * **不能让它显示成「0.0%」。**
     * 3 条 / 71548 条 = 0.004%,toFixed(1) 之后是 "0.0" —— 读起来就是「零」,
     * 而用户明明采到了东西。一个看着像零的非零值,比说不出准数更糟。
     * 小于 0.1% 一律写成「不到 0.1%」:同样诚实,而且不会被读成零。
     */
    const pct = (s.reviewCount / p.totalReviews) * 100;
    return pct < 0.1
      ? "只采了该商品不到 0.1% 的评论，占比类结论仅供参考。"
      : `只采了该商品 ${pct.toFixed(1)}% 的评论，占比类结论仅供参考。`;
  }
  return null;
}


/**
 * 分层样本的还原权重:每条评论该按多重算。
 *
 * 亚马逊已关掉评论深度翻页,只能按星级分别采 —— 五档各十条。
 * 直接统计的话一星会显示成 20%,而它实际只占 5%,整份报告的严重性判断全错。
 * 所以每档按「真实占比 ÷ 样本占比」加权。
 *
 * 返回 null = 无法还原(没有真实分布,或不是分层样本),此时报告只能报绝对条数、
 * 不能报占比 —— 报不了就别报,这比报一个错的强。
 */
export function stratumWeights(s: ReviewSampleMeta, sampleByStar: Record<string, number>): Record<string, number> | null {
  const hist = s.provenance.ratingHistogram;
  if (!hist || (s.provenance.starsCovered?.length ?? 0) < 2) return null;
  const sampled = Object.values(sampleByStar).reduce((a, b) => a + b, 0);
  if (!sampled) return null;

  const weights: Record<string, number> = {};
  for (const star of ["1", "2", "3", "4", "5"]) {
    const n = sampleByStar[star] ?? 0;
    if (!n) continue;                       // 这档没采到,不能凭空补
    const truthShare = (hist[star] ?? 0) / 100;
    const sampleShare = n / sampled;
    weights[star] = sampleShare > 0 ? truthShare / sampleShare : 0;
  }
  return Object.keys(weights).length ? weights : null;
}


/**
 * 合并多批样本。
 *
 * 必须能合并,否则**分层采样根本不成立** —— 亚马逊只放出第一页,想要完整样本
 * 只能按五个星级分别采,那就是五批。一次只能选一批的话,用户永远只能拿一档
 * 去做分析,而单档样本的占比结论必然是错的。
 *
 * 合并三件事:跨批去重、溯源合账、权重重算。
 * 去重尤其要紧:用户很容易把同一页采两遍(实测就是这么发生的),
 * 不去重的话样本量翻倍、置信度跟着虚高,而没人看得出来。
 */
export function mergeSamples(picked: { meta: ReviewSampleMeta; reviews: SampleReview[] }[]): {
  meta: ReviewSampleMeta; reviews: SampleReview[]; duplicates: number;
} {
  const seen = new Set<string>();
  const reviews: SampleReview[] = [];
  let duplicates = 0;
  for (const { reviews: rs } of picked) {
    for (const r of rs) {
      const key = r.id || `${r.rating}|${r.date}|${(r.text ?? "").slice(0, 60)}`;
      if (seen.has(key)) { duplicates += 1; continue; }
      seen.add(key);
      reviews.push(r);
    }
  }

  const metas = picked.map((p) => p.meta);
  // 单批带 starFilter 的也算覆盖了一档 —— 五批单档合起来就是完整分层,
  // 这正是亚马逊关掉翻页后唯一能凑出完整样本的路径。
  const stars: string[] = [];
  for (const m of metas) {
    stars.push(...(m.provenance.starsCovered ?? []));
    if (m.provenance.starFilter) stars.push(m.provenance.starFilter);
  }
  const starsCovered = [...new Set(stars.filter(Boolean))];

  const hasUpload = metas.some((m) => m.source === "upload");
  const hasFeatured = metas.some((m) => m.provenance.sampleType === "featured");

  return {
    reviews, duplicates,
    meta: {
      batchId: metas.map((m) => m.batchId).join("+"),
      // 混了采样数据就不能算完整数据 —— 就低不就高
      source: hasUpload && metas.every((m) => m.source === "upload") ? "upload" : "extension",
      label: metas.length > 1 ? `${metas.length} 批合并` : (metas[0]?.label ?? ""),
      reviewCount: reviews.length,
      createdAt: metas[0]?.createdAt ?? "",
      provenance: {
        // 掺了详情页精选,整体就不能算全量
        sampleType: hasFeatured ? "featured" : (hasUpload && metas.every((m) => m.source === "upload") ? "upload" : "list"),
        starsCovered,
        ratingHistogram: metas.find((m) => m.provenance.ratingHistogram)?.provenance.ratingHistogram ?? null,
        totalReviews: metas.find((m) => m.provenance.totalReviews)?.provenance.totalReviews ?? null,
        pageCount: metas.reduce((n, m) => n + (m.provenance.pageCount ?? 1), 0),
        productTitle: metas.find((m) => m.provenance.productTitle)?.provenance.productTitle,
      },
    },
  };
}

/** 合并样本里各星级各有多少条 —— 算还原权重要用。 */
export function countByStar(reviews: SampleReview[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of reviews) {
    const k = String(Math.round(r.rating));
    if (k >= "1" && k <= "5") out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}


/* ---------------- 亚马逊「Customers say」全量口碑主题 ----------------
 * 与「口碑样本」是两回事,别混:
 *   口碑样本 = 我们采到的评论原文,十几条,有采样偏差
 *   全量主题 = 亚马逊基于该商品**全部**评论算的聚类,可信但粒度粗、是它的分析
 * 所以展示时必须分开、并标明出处 —— 混在一起会让用户以为我们分析了几万条。
 */

export type InsightTopic = {
  name: string;
  mentions: number;
  sentiment: "positive" | "negative" | "mixed" | "unknown";
  /** 正/负面条数。缺失为 null —— 「无数据」和「零条负面」是两回事。 */
  positive?: number | null;
  negative?: number | null;
};

/** 负面占比。没有正负条数则返回 null,不用情绪标签硬凑一个数。 */
export function negativeShare(t: InsightTopic): number | null {
  const pos = t.positive ?? null;
  const neg = t.negative ?? null;
  if (pos === null || neg === null || pos + neg === 0) return null;
  return neg / (pos + neg);
}

/**
 * 把主题切成「先看的」与「折叠的」。
 *
 * 两部分必须由**同一次切分**得出。原来主区与折叠区各算各的:折叠区取
 * 「不在『值得改』清单里的」,而没有正负条数时(旧版采集的数据)那份清单是空的,
 * 主区退回显示前六个 —— 于是折叠区 = 全部,展开后把已显示的六个又列一遍。
 */
export function splitTopics(topics: InsightTopic[]): { primary: InsightTopic[]; hidden: InsightTopic[] } {
  const fix = worthFixing(topics);
  const primary = fix.length ? fix.slice(0, 4) : topics.slice(0, 6);
  return { primary, hidden: topics.filter((t) => !primary.includes(t)) };
}

/**
 * 按「值不值得改」排序。
 *
 * 不是按负面条数排 —— 那样只会把最热门的主题排在前面(热门主题的负面绝对数
 * 天然就大)。真正值得先改的是**提及量大且负面占比高**的那些:
 * 很多人在意,而且他们不满意。
 */
export function worthFixing(topics: InsightTopic[]): InsightTopic[] {
  return topics
    .map((t) => ({ t, share: negativeShare(t) }))
    .filter((x): x is { t: InsightTopic; share: number } => x.share !== null && x.share >= 0.15)
    .sort((a, b) => (b.t.negative ?? 0) * b.share - (a.t.negative ?? 0) * a.share)
    .map((x) => x.t);
}

export type ProductInsights = {
  summary: string;
  topics: InsightTopic[];
  totalReviews: number | null;
  sourceUrl: string;
  capturedAt: string;
};

export async function loadInsights(
  product: Pick<Product, "asin" | "marketplace">,
): Promise<ProductInsights | null> {
  if (!product.asin) return null;
  const q = new URLSearchParams({
    marketplace: product.marketplace || "amazon-us",
    externalId: product.asin,
  });
  const res = await authFetch(`/v1/extension/insights?${q}`);
  if (!res.ok) return null;
  const r = await res.json().catch(() => null);
  if (!r) return null;
  return {
    summary: String(r.summary ?? ""),
    topics: Array.isArray(r.topics) ? (r.topics as InsightTopic[]) : [],
    totalReviews: r.total_reviews ?? null,
    sourceUrl: String(r.source_url ?? ""),
    capturedAt: String(r.captured_at ?? ""),
  };
}

/** 提及量的短写:4900 → 4.9K。列表里要能一眼比出量级差。 */
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
