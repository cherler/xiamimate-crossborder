/** Versioned, offline handoff shared by the extension and website. */
export type Identity = { platform: string; marketplace: string; externalId: string; adapterVersion: string };
export type Fields = {
  title?: string; brand?: string; price?: number; currency?: string; mainImage?: string;
  rating?: number; reviewCount?: number; categoryPath?: string; bulletPoints?: string[];
  sellerName?: string; fulfillmentType?: string; bsr?: string; firstAvailable?: string; soldCount?: number;
};
export type CollectedProduct = Identity & { fields: Fields; sourceUrl: string; missingFields: string[]; capturedAt: string };
export type CollectedReview = { id: string; rating: number; date: string; variant: string; title: string; text: string; verified: boolean; helpful: number };
export type Provenance = {
  sampleType: "featured" | "list"; pageNumber: number; starFilter: string; sortBy: string;
  reviewerType: string; totalReviews: number | null; productTitle: string;
  ratingHistogram: Record<string, number> | null; capturedAt: string; sourceUrl: string;
  pageNumbers?: number[]; pageCount?: number; starsCovered?: string[];
};
export type ReviewBatch = Identity & { label: string; reviews: CollectedReview[]; provenance: Provenance; pages: Provenance[] };
export type CollectedInsights = Identity & {
  summary: string; topics: { name: string; mentions: number; sentiment: "positive" | "negative" | "mixed" | "unknown"; positive?: number; negative?: number }[];
  totalReviews: number | null; capturedAt: string; sourceUrl: string;
};
export type CaptureBundle = {
  format: "xiamimate-capture"; version: 1; exportedAt: string;
  product: CollectedProduct | null; reviews: ReviewBatch | null; insights: CollectedInsights | null;
};
export const MAX_CAPTURE_BYTES = 2_000_000;
const bad = (name: string): never => { throw new Error("采集文件格式不正确：" + name); };
function object(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return bad(name);
  return v as Record<string, unknown>;
}
function str(v: unknown, name: string, max = 2000): string {
  if (typeof v !== "string" || v.length > max) return bad(name);
  return v;
}
function num(v: unknown, name: string, max = 1e12): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) return bad(name);
  return v;
}
function list(v: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max) return bad(name);
  return v;
}
export function safeHttpUrl(v: unknown): string {
  if (typeof v !== "string" || v.length > 4096) return "";
  try {
    const u = new URL(v);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : "";
  } catch { return ""; }
}
function url(v: unknown): string { return safeHttpUrl(v) || bad("来源链接"); }
function date(v: unknown): string {
  const s = str(v, "采集时间", 40);
  if (!s || !Number.isFinite(Date.parse(s))) return bad("采集时间");
  return s;
}
function identity(v: Record<string, unknown>): Identity {
  const platform = str(v.platform, "平台", 30);
  const marketplace = str(v.marketplace, "站点", 50);
  const externalId = str(v.externalId, "商品编号", 30);
  if (!["amazon", "tiktok"].includes(platform) || !new RegExp("^" + platform + "-[a-z]{2,5}$").test(marketplace)) return bad("平台或站点");
  if (!(platform === "amazon" ? /^[A-Z0-9]{10}$/ : /^\d{8,25}$/).test(externalId)) return bad("商品编号");
  return { platform, marketplace, externalId, adapterVersion: str(v.adapterVersion, "解析器版本", 100) };
}
function provenance(input: unknown): Provenance {
  const v = object(input, "评论来源");
  if (v.sampleType !== "featured" && v.sampleType !== "list") return bad("样本类型");
  const histogram = v.ratingHistogram == null ? null : object(v.ratingHistogram, "星级分布");
  const cleanHistogram: Record<string, number> | null = histogram ? {} : null;
  if (histogram) for (const [k, n] of Object.entries(histogram)) {
    if (!/^[1-5]$/.test(k)) return bad("星级分布");
    cleanHistogram![k] = num(n, "星级占比", 100);
  }
  return {
    sampleType: v.sampleType, pageNumber: num(v.pageNumber, "页码", 1e6),
    starFilter: str(v.starFilter, "星级筛选", 500), sortBy: str(v.sortBy, "排序", 500),
    reviewerType: str(v.reviewerType, "评论筛选", 500),
    totalReviews: v.totalReviews == null ? null : num(v.totalReviews, "总评论数"),
    productTitle: str(v.productTitle, "商品标题"), ratingHistogram: cleanHistogram,
    capturedAt: date(v.capturedAt), sourceUrl: url(v.sourceUrl),
    ...(v.pageNumbers == null ? {} : { pageNumbers: list(v.pageNumbers, "页码列表", 500).map(n => num(n, "页码", 1e6)) }),
    ...(v.pageCount == null ? {} : { pageCount: num(v.pageCount, "页数", 500) }),
    ...(v.starsCovered == null ? {} : { starsCovered: list(v.starsCovered, "筛选列表", 20).map(s => str(s, "星级筛选", 100)) }),
  };
}
export function parseCaptureBundle(text: string): CaptureBundle {
  if (new TextEncoder().encode(text).length > MAX_CAPTURE_BYTES) throw new Error("采集文件不能超过 2 MB。");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("无法读取 JSON 采集文件。"); }
  const v = object(raw, "文件");
  if (v.format !== "xiamimate-capture" || v.version !== 1) throw new Error("请使用采集助手导出的 JSON 文件；商品备份请到「我的商品」导入。");
  let product: CollectedProduct | null = null, reviews: ReviewBatch | null = null, insights: CollectedInsights | null = null;
  if (v.product != null) {
    const p = object(v.product, "商品"), f = object(p.fields, "商品字段"), fields: Fields = {};
    for (const key of ["title", "brand", "currency", "categoryPath", "sellerName", "fulfillmentType", "bsr", "firstAvailable"] as const)
      if (f[key] !== undefined) fields[key] = str(f[key], key);
    for (const key of ["price", "rating", "reviewCount", "soldCount"] as const)
      if (f[key] !== undefined) fields[key] = num(f[key], key, key === "rating" ? 5 : 1e12);
    if (f.mainImage !== undefined) fields.mainImage = url(f.mainImage);
    if (f.bulletPoints !== undefined) fields.bulletPoints = list(f.bulletPoints, "商品要点", 100).map(s => str(s, "商品要点", 5000));
    product = { ...identity(p), fields, sourceUrl: url(p.sourceUrl), capturedAt: date(p.capturedAt),
      missingFields: list(p.missingFields, "缺失字段", 50).map(s => str(s, "字段名", 100)) };
  }
  if (v.reviews != null) {
    const r = object(v.reviews, "评论");
    reviews = { ...identity(r), label: str(r.label, "样本标签", 200),
      reviews: list(r.reviews, "评论数量", 500).map(rawReview => {
        const x = object(rawReview, "评论条目");
        if (typeof x.verified !== "boolean") return bad("已购标记");
        return { id: str(x.id, "评论编号", 200), rating: num(x.rating, "评分", 5),
          date: str(x.date, "评论日期", 500), variant: str(x.variant, "款式", 1000),
          title: str(x.title, "评论标题"), text: str(x.text, "评论原文", 30000),
          verified: x.verified, helpful: num(x.helpful, "有用数") };
      }), provenance: provenance(r.provenance),
      pages: list(r.pages, "样本页", 500).map(provenance),
    };
    if (!reviews.reviews.length || !reviews.pages.length) return bad("空评论样本");
  }
  if (v.insights != null) {
    const i = object(v.insights, "平台摘要");
    insights = { ...identity(i), summary: str(i.summary, "平台摘要", 20000),
      topics: list(i.topics, "平台主题", 100).map(rawTopic => {
        const t = object(rawTopic, "主题");
        if (!["positive", "negative", "mixed", "unknown"].includes(String(t.sentiment))) return bad("主题方向");
        return { name: str(t.name, "主题名", 500), mentions: num(t.mentions, "提及数"),
          sentiment: t.sentiment as "positive" | "negative" | "mixed" | "unknown",
          ...(t.positive == null ? {} : { positive: num(t.positive, "正面数") }),
          ...(t.negative == null ? {} : { negative: num(t.negative, "负面数") }) };
      }), totalReviews: i.totalReviews == null ? null : num(i.totalReviews, "总评论数"),
      capturedAt: date(i.capturedAt), sourceUrl: url(i.sourceUrl) };
  }
  const sections = [product, reviews, insights].filter((x): x is CollectedProduct | ReviewBatch | CollectedInsights => !!x);
  if (!sections.length) return bad("没有采集内容");
  if (sections.some(s => identityKey(s) !== identityKey(sections[0]!))) return bad("混入了其他商品或其他站点的资料");
  return { format: "xiamimate-capture", version: 1, exportedAt: date(v.exportedAt), product, reviews, insights };
}
export function identityKey(v: Pick<Identity, "platform" | "marketplace" | "externalId">): string {
  return [v.platform, v.marketplace, v.externalId].join("|");
}
export function bundleIdentity(b: CaptureBundle): Identity { return (b.product ?? b.reviews ?? b.insights)!; }
export function bundleTitle(b: CaptureBundle): string {
  return b.product?.fields.title || b.reviews?.provenance.productTitle || bundleIdentity(b).externalId;
}
export function reviewKey(r: CollectedReview): string { return r.id || [r.rating, r.date, r.text].join("|"); }
/** CSV remains a local analysis input, never interpreted as spreadsheet formulas. */
export function reviewsCsv(reviews: CollectedReview[]): string {
  const cell = (v: string | number) => '"' + String(v).replaceAll('"', '""') + '"';
  return "rating,date,variant,text\n" + reviews.map(r => [r.rating || "", r.date, r.variant, [r.title, r.text].filter(Boolean).join(" — ")].map(cell).join(",")).join("\n");
}
