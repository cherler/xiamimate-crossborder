/**
 * 用户声音洞察引擎。纯函数、确定性。
 *
 * 分工与 Listing 诊断一致：主题归类必须靠模型（机器聚不了语义），
 * 但频次、占比、对评分的影响全是算术，由这里算 —— 模型只负责贴标签并附原文，
 * 不负责报数字。让模型报「18.6% 的评论抱怨尺寸」，那个百分比是编的。
 *
 * 三条硬约束：
 * 1. 结论只覆盖你上传的样本。样本偏了结论就偏，页面必须如实标注样本量与时间跨度。
 * 2. 每个主题必须附代表性原文，否则用户无从判断该不该信。
 * 3. 样本太小就明说不可靠，而不是照样给出一个漂亮的百分比。
 */

export type Review = {
  id: string;
  rating: number;      // 1–5，缺失为 0
  date: string;        // YYYY-MM-DD，缺失为空
  variant: string;     // 变体 / 款式，缺失为空
  text: string;
};

/* ---------------- CSV 解析 ---------------- */

/** 逐字符解析，正确处理引号内的逗号与换行 —— 评论正文里这两样都很常见。 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { cell += '"'; i += 1; }  // 转义的双引号
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/** 各家后台导出的列名不一样，认常见的几种；认不出就让用户自己对齐。 */
const COLUMN_ALIASES: Record<keyof Omit<Review, "id">, string[]> = {
  rating: ["rating", "star", "stars", "score", "评分", "星级"],
  date: ["date", "review date", "submitted", "时间", "日期"],
  variant: ["variant", "style", "size", "color", "变体", "款式"],
  text: ["body", "text", "content", "review", "comment", "评论", "内容", "正文"],
};

function matchColumn(header: string[], field: keyof typeof COLUMN_ALIASES): number {
  const norm = header.map((h) => h.toLowerCase().trim());
  for (const alias of COLUMN_ALIASES[field]) {
    const i = norm.findIndex((h) => h === alias);
    if (i >= 0) return i;
  }
  // 退一步做包含匹配，但 title 不能当正文
  for (const alias of COLUMN_ALIASES[field]) {
    const i = norm.findIndex((h) => h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

export type CsvParseResult = {
  reviews: Review[];
  /** 认不出正文列时如实说，而不是拿第一列凑数。 */
  missingText: boolean;
  columns: Partial<Record<keyof typeof COLUMN_ALIASES, string>>;
};

export function parseReviewCsv(input: string): CsvParseResult {
  const rows = parseCsv(input);
  if (rows.length < 2) return { reviews: [], missingText: true, columns: {} };

  const header = rows[0];
  const idx = {
    rating: matchColumn(header, "rating"),
    date: matchColumn(header, "date"),
    variant: matchColumn(header, "variant"),
    text: matchColumn(header, "text"),
  };
  if (idx.text < 0) return { reviews: [], missingText: true, columns: {} };

  const reviews: Review[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const text = (r[idx.text] ?? "").trim();
    if (!text) continue;
    const rating = idx.rating >= 0 ? Number(String(r[idx.rating]).replace(/[^\d.]/g, "")) : NaN;
    reviews.push({
      id: `r${i}`,
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : 0,
      date: idx.date >= 0 ? (r[idx.date] ?? "").trim().slice(0, 10) : "",
      variant: idx.variant >= 0 ? (r[idx.variant] ?? "").trim().slice(0, 60) : "",
      text: text.slice(0, 2000),
    });
  }
  const columns: CsvParseResult["columns"] = {};
  for (const k of Object.keys(idx) as Array<keyof typeof idx>) {
    if (idx[k] >= 0) columns[k] = header[idx[k]];
  }
  return { reviews, missingText: false, columns };
}

/* ---------------- 主题聚合（模型贴标签，这里算数） ---------------- */

export type Sentiment = "negative" | "positive";

/** 模型的产出：某条评论命中某个主题，并给出原文证据。 */
export type ThemeAssignment = {
  reviewId: string;
  theme: string;
  sentiment: Sentiment;
  quote: string;
};

export type ThemeStat = {
  theme: string;
  sentiment: Sentiment;
  count: number;
  share: number;          // 占样本比例 %
  avgRating: number;      // 命中该主题的评论平均分
  ratingDelta: number;    // 与整体平均分之差；负得越多影响越大
  variants: string[];     // 主要出现在哪些变体
  evidence: Array<{ reviewId: string; quote: string; rating: number }>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function overallAvgRating(reviews: Review[]): number {
  const rated = reviews.filter((r) => r.rating > 0);
  if (!rated.length) return 0;
  return round1(rated.reduce((s, r) => s + r.rating, 0) / rated.length);
}

/**
 * 把模型的标签聚合成可行动的统计。
 * 所有数字都算自实际样本 —— 模型一个数字都不经手。
 */
export function aggregateThemes(reviews: Review[], assignments: ThemeAssignment[]): ThemeStat[] {
  const byId = new Map(reviews.map((r) => [r.id, r]));
  const overall = overallAvgRating(reviews);
  const groups = new Map<string, { sentiment: Sentiment; items: Array<{ review: Review; quote: string }> }>();

  for (const a of assignments) {
    const review = byId.get(a.reviewId);
    // 认不出的 reviewId 是模型编的，丢弃 —— 否则统计里会混进不存在的评论。
    if (!review || !a.theme.trim()) continue;
    const key = a.theme.trim();
    const g = groups.get(key) ?? { sentiment: a.sentiment, items: [] };
    if (g.items.some((x) => x.review.id === review.id)) continue; // 同一主题同一条只算一次
    g.items.push({ review, quote: a.quote });
    groups.set(key, g);
  }

  const total = reviews.length || 1;
  const out: ThemeStat[] = [];
  for (const [theme, g] of groups) {
    const rated = g.items.filter((x) => x.review.rating > 0);
    const avg = rated.length ? round1(rated.reduce((s, x) => s + x.review.rating, 0) / rated.length) : 0;
    const variantCounts = new Map<string, number>();
    for (const x of g.items) {
      if (!x.review.variant) continue;
      variantCounts.set(x.review.variant, (variantCounts.get(x.review.variant) ?? 0) + 1);
    }
    out.push({
      theme,
      sentiment: g.sentiment,
      count: g.items.length,
      share: round1((g.items.length / total) * 100),
      avgRating: avg,
      ratingDelta: avg && overall ? round1(avg - overall) : 0,
      variants: [...variantCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v),
      evidence: g.items.slice(0, 3).map((x) => ({ reviewId: x.review.id, quote: x.quote || x.review.text.slice(0, 120), rating: x.review.rating })),
    });
  }
  // 负面优先，再按对评分的拖累排序 —— 用户要先看该改哪个。
  return out.sort((a, b) => {
    if (a.sentiment !== b.sentiment) return a.sentiment === "negative" ? -1 : 1;
    if (a.ratingDelta !== b.ratingDelta) return a.ratingDelta - b.ratingDelta;
    return b.count - a.count;
  });
}

/* ---------------- 样本体检 ---------------- */

export type SampleWarning = { id: string; level: "warn" | "info"; text: string };

export type SampleProfile = {
  total: number;
  rated: number;
  avgRating: number;
  variants: string[];
  dateFrom: string;
  dateTo: string;
};

export function profileSample(reviews: Review[]): SampleProfile {
  const dates = reviews.map((r) => r.date).filter(Boolean).sort();
  const variants = [...new Set(reviews.map((r) => r.variant).filter(Boolean))];
  return {
    total: reviews.length,
    rated: reviews.filter((r) => r.rating > 0).length,
    avgRating: overallAvgRating(reviews),
    variants,
    dateFrom: dates[0] ?? "",
    dateTo: dates[dates.length - 1] ?? "",
  };
}

/**
 * 归类质量体检。
 *
 * 模型很容易把同义主题拆开（「保冷效果好」与「保温/保冷效果好」各算一个），
 * 一旦拆散，占比就失去意义 —— 每个主题都是 1 条、每个都 14%，等于没统计。
 * 这一步不去猜哪些该合并（合错更糟），只如实告诉用户占比现在不可信。
 */
export function detectThemeIssues(stats: ThemeStat[], sampleSize: number): SampleWarning[] {
  if (!stats.length || sampleSize === 0) return [];
  const out: SampleWarning[] = [];
  const singletons = stats.filter((s) => s.count === 1).length;

  if (stats.length > sampleSize * 0.6) {
    out.push({
      id: "fragmented", level: "warn",
      text: `${sampleSize} 条评论归出了 ${stats.length} 个主题，几乎一条一个 —— 同义主题很可能被拆开了，此时占比不可信。样本再大一些，或把商品背景写得更具体，归类会稳定很多。`,
    });
  } else if (singletons / stats.length > 0.6) {
    out.push({
      id: "singletons", level: "info",
      text: `${stats.length} 个主题里有 ${singletons} 个只出现 1 次。只出现一次的主题可能是同义拆分，也可能是真的个案，值得逐条看证据再判断。`,
    });
  }
  return out;
}

/**
 * 样本本身的问题必须先讲清楚，再谈结论。
 * 30 条评论里 18% 抱怨尺寸，和 3000 条里 18%，是两回事。
 */
export function detectSampleIssues(p: SampleProfile): SampleWarning[] {
  const out: SampleWarning[] = [];
  if (p.total === 0) return [{ id: "empty", level: "warn", text: "还没有可分析的评论。" }];

  if (p.total < 30) {
    out.push({
      id: "small-sample", level: "warn",
      text: `样本只有 ${p.total} 条，占比与评分影响的波动会很大 —— 这个量级下的百分比不足以支撑改产品的决策。`,
    });
  }
  if (p.rated < p.total) {
    out.push({
      id: "missing-rating", level: "info",
      text: `${p.total - p.rated} 条评论没有评分，未计入平均分与评分影响。`,
    });
  }
  if (p.variants.length === 0) {
    out.push({
      id: "no-variant", level: "info",
      text: "CSV 里没有变体列，无法判断问题是否集中在某个尺寸 / 颜色上。",
    });
  }
  if (!p.dateFrom) {
    out.push({
      id: "no-date", level: "info",
      text: "CSV 里没有日期列，无法判断问题是最近才出现，还是一直如此。",
    });
  }
  out.push({
    id: "sample-only", level: "info",
    text: `以下结论只覆盖你上传的这 ${p.total} 条${p.dateFrom ? `（${p.dateFrom} 至 ${p.dateTo}）` : ""}，不代表全部买家 —— 导出时的筛选条件会直接决定结论。`,
  });
  return out;
}

/* ---------------- 竞品对比 ---------------- */

/**
 * 双方主题必须在同一次归类里产生，名字才对得齐。
 * 分两次跑模型，「尺寸比预期小」与「尺寸偏小」会各算一个，根本没法比。
 * 所以调用方要把两边评论合在一次调用里，用 id 前缀区分（m* / t*），
 * 再各自聚合 —— aggregateThemes 只认传进去的那批评论，天然会拆开。
 */
export const MINE_PREFIX = "m";
export const THEIRS_PREFIX = "t";

export type SideStat = { count: number; share: number; avgRating: number };

export type SideBySide = {
  theme: string;
  sentiment: Sentiment;
  mine: SideStat | null;
  theirs: SideStat | null;
  /** shared = 品类通病，改了也不构成差异；theirs_only = 他们的弱点；mine_only = 我们的弱点。 */
  verdict: "shared" | "mine_only" | "theirs_only";
  /** 占比差（我方 − 对方），仅在两边都有时有意义。 */
  shareDelta: number | null;
};

const pick = (s: ThemeStat | undefined): SideStat | null =>
  s ? { count: s.count, share: s.share, avgRating: s.avgRating } : null;

export function compareThemes(mine: ThemeStat[], theirs: ThemeStat[]): SideBySide[] {
  const names = [...new Set([...mine.map((s) => s.theme), ...theirs.map((s) => s.theme)])];
  const out: SideBySide[] = names.map((theme) => {
    const m = mine.find((s) => s.theme === theme);
    const t = theirs.find((s) => s.theme === theme);
    const sentiment: Sentiment = (m ?? t)!.sentiment;
    return {
      theme,
      sentiment,
      mine: pick(m),
      theirs: pick(t),
      verdict: m && t ? "shared" : m ? "mine_only" : "theirs_only",
      shareDelta: m && t ? round1(m.share - t.share) : null,
    };
  });

  // 先看我们独有的问题（该改），再看共有（品类通病），最后是他们的弱点（可打差异）。
  const rank: Record<SideBySide["verdict"], number> = { mine_only: 0, shared: 1, theirs_only: 2 };
  return out.sort((a, b) => {
    if (a.sentiment !== b.sentiment) return a.sentiment === "negative" ? -1 : 1;
    if (a.verdict !== b.verdict) return rank[a.verdict] - rank[b.verdict];
    return (b.mine?.count ?? b.theirs?.count ?? 0) - (a.mine?.count ?? a.theirs?.count ?? 0);
  });
}

/**
 * 两个样本能不能比。
 * 30 条对 500 条的占比放在一起看，是最容易得出错误结论的地方 ——
 * 小样本里一条评论就是 3.3%，对面一条只有 0.2%。
 */
export function detectComparabilityIssues(mine: SampleProfile, theirs: SampleProfile): SampleWarning[] {
  const out: SampleWarning[] = [];
  if (!mine.total || !theirs.total) return out;

  const ratio = Math.max(mine.total, theirs.total) / Math.min(mine.total, theirs.total);
  if (ratio >= 3) {
    out.push({
      id: "size-mismatch", level: "warn",
      text: `样本量差 ${ratio.toFixed(1)} 倍（你 ${mine.total} 条 vs 竞品 ${theirs.total} 条），两边的占比不能直接比 —— 小样本里一条评论就能占好几个百分点。`,
    });
  }
  // 时间不重叠 = 在比两个不同时期的产品，改版、换供应商都会混进来。
  if (mine.dateFrom && theirs.dateFrom && (mine.dateTo < theirs.dateFrom || theirs.dateTo < mine.dateFrom)) {
    out.push({
      id: "period-mismatch", level: "warn",
      text: `两边评论的时间段不重叠（你 ${mine.dateFrom}–${mine.dateTo}，竞品 ${theirs.dateFrom}–${theirs.dateTo}），比的是两个不同时期的产品。`,
    });
  }
  out.push({
    id: "compare-caveat", level: "info",
    text: "对比只覆盖两边各自上传的样本。竞品评论的筛选方式、评分分布、变体构成都可能与你不同，差异未必来自产品本身。",
  });
  return out;
}

/* ---------------- 洞察映射 ---------------- */

/** 洞察落到哪个面上。product 要改模具，listing 只要改文案 —— 成本差好几个量级。 */
export type ChangeSurface = "product" | "image" | "title" | "bullets" | "service";

export const SURFACE_LABEL: Record<ChangeSurface, string> = {
  product: "产品本身",
  image: "主图 / A+ 图",
  title: "标题",
  bullets: "五点描述",
  service: "客服 / 售后说明",
};

/** 模型给出的一条改动建议。 */
export type ChangeSuggestion = {
  surface: ChangeSurface;
  theme: string;      // 针对哪个洞察，必须取自已有主题
  action: string;     // 具体改什么
  rationale: string;  // 为什么这么改
};

export type MappedSuggestion = ChangeSuggestion & {
  /** 该主题的实际数据，用来排优先级 —— 数字仍来自样本，不是模型说的。 */
  count: number;
  share: number;
  ratingDelta: number;
  /** 这条建议需要事实库里没确认的东西才能落地。 */
  needsFacts: string[];
};

export type MappingIssue = { id: string; level: "warn" | "info"; text: string };

/**
 * 把模型的建议与实际数据对齐。
 *
 * 模型负责「该怎么改」（判断题，机器做不了），但：
 * - 针对的主题必须真实存在，编出来的丢弃；
 * - 频次 / 占比 / 评分影响一律取自聚合结果，不采信模型复述的数字；
 * - 建议若要求写进 Listing 的事实尚未确认，标出来 —— 否则「五点里写明尺寸」
 *   会变成照着没确认的尺寸瞎写。
 */
export function mapSuggestions(
  suggestions: ChangeSuggestion[],
  themes: ThemeStat[],
  unconfirmedLabels: string[],
): { mapped: MappedSuggestion[]; issues: MappingIssue[] } {
  const byTheme = new Map(themes.map((t) => [t.theme, t]));
  const mapped: MappedSuggestion[] = [];
  const issues: MappingIssue[] = [];
  let dropped = 0;

  for (const s of suggestions) {
    const t = byTheme.get(s.theme.trim());
    // 针对一个不存在的主题的建议，是模型自己想出来的问题，不是数据里的。
    if (!t) { dropped += 1; continue; }
    const text = `${s.action} ${s.rationale}`.toLowerCase();
    mapped.push({
      ...s,
      theme: t.theme,
      count: t.count,
      share: t.share,
      ratingDelta: t.ratingDelta,
      needsFacts: unconfirmedLabels.filter((l) => l && text.includes(l.toLowerCase())),
    });
  }

  if (dropped) {
    issues.push({
      id: "invented-theme", level: "info",
      text: `丢弃了 ${dropped} 条针对不存在主题的建议 —— 那是模型自己想的问题，不在你的样本里。`,
    });
  }
  const blocked = mapped.filter((m) => m.needsFacts.length);
  if (blocked.length) {
    issues.push({
      id: "needs-facts", level: "warn",
      text: `${blocked.length} 条建议要写进 Listing 的事实尚未确认（${[...new Set(blocked.flatMap((m) => m.needsFacts))].join("、")}）。先在事实库里确认，否则改完就是照着没确认的信息瞎写。`,
    });
  }

  // 影响大的排前面：占比高、拖累评分多的先改。
  return {
    mapped: mapped.sort((a, b) => (b.share - a.share) || (a.ratingDelta - b.ratingDelta)),
    issues,
  };
}

// ── 退货 CSV(P2:深度研究 user_upload 证据的第二类自有数据)──

export type ReturnRow = {
  id: string;
  date: string;      // 截 10 字,缺失为空串
  variant: string;
  reason: string;    // 必需列,认不出整体判失败
  qty: number;       // 缺失按 1 件
};

const RETURN_COLUMN_ALIASES: Record<"date" | "variant" | "reason" | "qty", string[]> = {
  date: ["date", "return date", "退货时间", "时间", "日期"],
  variant: ["variant", "style", "size", "color", "sku", "变体", "款式"],
  reason: ["reason", "return reason", "comment", "退货原因", "原因", "理由"],
  qty: ["qty", "quantity", "count", "units", "数量", "件数"],
};

function matchReturnColumn(header: string[], field: keyof typeof RETURN_COLUMN_ALIASES): number {
  const norm = header.map((h) => h.toLowerCase().trim());
  for (const alias of RETURN_COLUMN_ALIASES[field]) {
    const i = norm.findIndex((h) => h === alias);
    if (i >= 0) return i;
  }
  for (const alias of RETURN_COLUMN_ALIASES[field]) {
    const i = norm.findIndex((h) => h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

export type ReturnCsvParseResult = {
  returns: ReturnRow[];
  /** 认不出原因列时如实说(退货分析没有原因就没有意义)。 */
  missingReason: boolean;
  columns: Partial<Record<keyof typeof RETURN_COLUMN_ALIASES, string>>;
};

export function parseReturnCsv(input: string): ReturnCsvParseResult {
  const rows = parseCsv(input);
  if (rows.length < 2) return { returns: [], missingReason: true, columns: {} };
  const header = rows[0];
  const idx = {
    date: matchReturnColumn(header, "date"),
    variant: matchReturnColumn(header, "variant"),
    reason: matchReturnColumn(header, "reason"),
    qty: matchReturnColumn(header, "qty"),
  };
  if (idx.reason < 0) return { returns: [], missingReason: true, columns: {} };
  const returns: ReturnRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    const reason = (r[idx.reason] ?? "").trim();
    if (!reason) continue;
    const qtyRaw = idx.qty >= 0 ? Number(String(r[idx.qty]).replace(/[^\d]/g, "")) : NaN;
    returns.push({
      id: `t${i}`,
      date: idx.date >= 0 ? (r[idx.date] ?? "").trim().slice(0, 10) : "",
      variant: idx.variant >= 0 ? (r[idx.variant] ?? "").trim().slice(0, 60) : "",
      reason: reason.slice(0, 200),
      qty: Number.isFinite(qtyRaw) && qtyRaw >= 1 ? Math.min(qtyRaw, 999) : 1,
    });
  }
  const columns: ReturnCsvParseResult["columns"] = {};
  for (const k of Object.keys(idx) as Array<keyof typeof idx>) {
    if (idx[k] >= 0) columns[k] = header[idx[k]];
  }
  return { returns, missingReason: false, columns };
}
