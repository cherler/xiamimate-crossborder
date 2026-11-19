/**
 * 亚马逊评论适配器。
 *
 * 两个来源,性质完全不同,必须分清楚:
 *   详情页底部    —— 约 8 条,**亚马逊挑过的**"精选评论"。不是随机样本。
 *   /product-reviews —— 每页 10 条,按用户当前的筛选与排序。
 *
 * 分不清的后果很严重:拿 8 条精选评论跑出来的口碑报告,长得和跑 500 条的
 * 报告一模一样 —— 同样的百分比、同样的信心。所以 sampleType 是必带字段,
 * 不是可选的元数据。
 *
 * 隐私:**评论人姓名、头像、主页链接一律不提取**。隐私政策里写死了
 * 「不接收买家姓名、账号等身份字段」,所以这些字段在插件本地就不进内存,
 * 不是"传了再删"。
 */
import { parseCount, parseNumber } from "./types";
import { marketOf } from "./amazon";

export const AMAZON_REVIEWS_VERSION = "amazon-reviews@2";

export type CapturedReview = {
  /** 亚马逊的评论 id(R开头)。跨页去重靠它 —— 用户来回翻页不该采出重复样本。 */
  id: string;
  rating: number;          // 1–5,认不出为 0
  date: string;            // 原文,如 "Reviewed in the United States on March 3, 2024"
  variant: string;         // 颜色/款式,缺失为空
  title: string;
  text: string;
  verified: boolean;       // 是否 Verified Purchase
  helpful: number;         // 有帮助票数,0 表示没有或没抓到
};

export type ReviewSample = {
  platform: string;
  marketplace: string;
  externalId: string;
  adapterVersion: string;
  reviews: CapturedReview[];
  provenance: Provenance;
};

/**
 * 样本溯源。这一块的存在意义就是**让偏样本无法伪装成全样本**。
 * 报告页会把它原样显示出来。
 */
export type Provenance = {
  /** featured = 详情页那 8 条精选;list = 评论列表页 */
  sampleType: "featured" | "list";
  pageNumber: number;
  /** 用户当前的星级筛选,如 "one_star";空 = 全部星级 */
  starFilter: string;
  /** 排序:recent(最新) / helpful(最有用,亚马逊默认) */
  sortBy: string;
  /** 评论人类型筛选:all_reviews / avp_only_reviews(仅已购) */
  reviewerType: string;
  /** 该商品评论总数(页面上标的),用来算采样覆盖率 */
  totalReviews: number | null;
  /**
   * 商品名。评论页上也有(顶部那行) —— 带上它,是为了用户「只采评论没采商品」时,
   * 网站还能据此建出一份有名有姓的档案,而不是一个光秃秃的 ASIN。
   */
  productTitle: string;
  /**
   * 真实星级分布,如 {"5":75,"4":13,"3":5,"2":2,"1":5}(百分比)。页面上就印着。
   *
   * 这是分层采样的**权重**:亚马逊已关掉评论深度翻页(pageNumber=3 与第 1 页
   * 返回同一批),一次只给得到十条左右;但按星级筛选是分开的。于是正确的采法是
   * 每个星级各采一批,再用这份真实占比还原整体 —— 比随机抓 50 条靠谱得多。
   * 没有它,一份「五个星级各 10 条」的样本会让一星看起来占 20%(实际 5%)。
   */
  ratingHistogram: Record<string, number> | null;
  capturedAt: string;
  sourceUrl: string;
};

const REVIEWS_PATH_RE = /\/product-reviews\/([A-Z0-9]{10})/i;
const DP_ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

export function isReviewsPage(url: URL): boolean {
  return REVIEWS_PATH_RE.test(url.pathname);
}

/** 认得这个页面、且它上面可能有评论吗 */
export function matchesReviews(url: URL): boolean {
  return !!marketOf(url) && (isReviewsPage(url) || DP_ASIN_RE.test(url.pathname));
}

function asinOf(doc: Document, url: URL): string | undefined {
  const m = url.pathname.match(REVIEWS_PATH_RE) ?? url.pathname.match(DP_ASIN_RE);
  if (m?.[1]) return m[1].toUpperCase();
  const el = doc.querySelector("input#ASIN, input[name='ASIN']");
  const v = el?.getAttribute("value");
  return v && /^[A-Z0-9]{10}$/i.test(v) ? v.toUpperCase() : undefined;
}

function clean(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/**
 * 单条评论的评分:"4.0 out of 5 stars" / "5つ星のうち4.0"。
 *
 * 与 amazon.ts 的 ratingOf 同一个坑,**先找小数、找不到才退整数**:
 * 原来的 /(\d+[.,]\d+|\d+)/ 交替分支从左往右试,「5つ星のうち4.0」
 * (日文语序:5 星中的 4.0)会在位置 0 用第二分支匹到满分那个 5。
 * n <= 5 这道校验也拦不住 —— 5 确实 <= 5。
 * 结果 amazon.co.jp 每条评论都是 5 星,整个星级结构失真。
 */
function ratingOf(node: Element): number {
  const raw = clean(node.querySelector("[data-hook='review-star-rating'], [data-hook='cmps-review-star-rating'], .review-rating"));
  const m = raw.match(/\d+[.,]\d+/) ?? raw.match(/\d+/);
  const n = parseNumber(m?.[0]);
  return n !== undefined && n <= 5 ? n : 0;
}

function reviewIdOf(node: Element): string {
  const id = node.getAttribute("id") ?? "";
  if (/^R[A-Z0-9]{10,}$/i.test(id)) return id;
  // 有些布局把 id 挂在内层链接上
  const href = node.querySelector("[data-hook='review-title'] a, a[href*='/review/']")?.getAttribute("href") ?? "";
  return href.match(/\/review\/(R[A-Z0-9]+)/i)?.[1] ?? "";
}

/**
 * 评论正文。
 *
 * 实测亚马逊把 data-hook="review-body" 拿掉了(诊断显示卡片有 13 个、
 * review-body 有 0 个),而正文非空是「算不算一条样本」的判据 —— 13 条全被丢掉,
 * 用户看到的是「这一页没找到评论」。
 *
 * 所以除了候选 hook,还留一条**不依赖任何名字**的兜底:
 * 卡片里最长的那段文字就是正文。这个判据来自内容本身而不是标记,
 * 亚马逊再改 hook 名也打不掉它。
 */
function bodyOf(node: Element): string {
  const byHook = [
    "[data-hook='review-body'] span",
    "[data-hook='review-body']",
    "[data-hook='review-collapsed'] span",
    "[data-hook='review-text'], [data-hook='review-text-read-more']",
    ".review-text-content span",
    ".review-text",
  ];
  for (const sel of byHook) {
    const t = clean(node.querySelector(sel));
    if (t) return t;
  }

  // 兜底:排除已知的非正文部件,取剩下最长的一段
  const excluded = node.querySelectorAll(
    "[data-hook='review-title'], [data-hook='review-date'], [data-hook='format-strip'], "
    + "[data-hook='review-star-rating'], [data-hook='helpful-vote-statement'], "
    + "[data-hook='avp-badge'], .a-profile, .cr-vote, [data-hook='review-image-tile-section']");
  const skip = new Set<Element>();
  for (const el of Array.from(excluded)) {
    skip.add(el);
    for (const kid of Array.from(el.querySelectorAll("*"))) skip.add(kid);
  }

  let best = "";
  for (const el of Array.from(node.querySelectorAll("span, p, div"))) {
    if (skip.has(el)) continue;
    // 只看叶子块,否则会取到把整张卡片包住的那个容器
    if (el.querySelector("span, p, div")) continue;
    const t = clean(el);
    if (t.length > best.length) best = t;
  }
  return best.length >= 15 ? best : "";
}

function extractOne(node: Element): CapturedReview | null {
  const text = bodyOf(node);
  if (!text) return null;                       // 没有正文的不算样本

  // 标题节点里混着评分文本("4.0 out of 5 stars 很好用"),取最后一个 span 才是标题
  const titleNode = node.querySelector("[data-hook='review-title']");
  const titleSpans = titleNode ? Array.from(titleNode.querySelectorAll("span")) : [];
  const title = clean(titleSpans[titleSpans.length - 1]) || clean(titleNode).replace(/^[\d.,]+\s*\S*\s*\d*\s*/, "");

  return {
    id: reviewIdOf(node),
    rating: ratingOf(node),
    date: clean(node.querySelector("[data-hook='review-date']")),
    variant: clean(node.querySelector("[data-hook='format-strip'], .review-format-strip")),
    title,
    text,
    verified: !!node.querySelector("[data-hook='avp-badge']"),
    helpful: parseCount(clean(node.querySelector("[data-hook='helpful-vote-statement']"))) ?? 0,
    // 刻意不取:评论人姓名(.a-profile-name)、头像、主页链接 —— 见文件头
  };
}

/**
 * 星级分布。按「行里有『N star』且有百分比」找,不依赖容器 ——
 * 这张表的容器 id 亚马逊换过好几轮,而这个文字模式十几年没变。
 */
function histogramOf(doc: Document): Record<string, number> | null {
  const out: Record<string, number> = {};
  const rows = doc.querySelectorAll(
    "#histogramTable tr, [data-hook='cr-histogram'] tr, li[data-reftag], #cm_cr_dp_d_rating_histogram tr, table tr, li");
  for (const row of Array.from(rows)) {
    const t = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (t.length > 60) continue;
    /*
     * 星级词各语言写法不同,而且**日文/韩文把数字放在词后面**(星5つ / 별 5개)。
     * 原来只认 star|星,实测 8 个站点里 6 个拿不到直方图 ——
     * 而它是分层采样的**权重**(本文件 ratingHistogram 的注释写着:
     * 没有它,五个星级各 10 条的样本会让一星看起来占 20%,实际 5%)。
     * 静默漏值,不报错,provenance 的承重件就这么没了。
     */
    const star = t.match(/([1-5])\s*(stars?|星|Sterne?|étoiles?|estrellas?|stelle|개)/i)
      ?? t.match(/(?:星|별)\s*([1-5])/);
    const pct = t.match(/(\d{1,3})\s*%/);
    if (star?.[1] && pct?.[1]) {
      const v = Number(pct[1]);
      if (v >= 0 && v <= 100 && out[star[1]] === undefined) out[star[1]] = v;
    }
  }
  // 五档齐全才算数:缺档的分布拿去做权重会算出错的整体
  return Object.keys(out).length === 5 ? out : null;
}

function provenanceOf(doc: Document, url: URL, sampleType: "featured" | "list"): Provenance {
  const q = url.searchParams;
  const totalRaw = clean(doc.querySelector("[data-hook='cr-filter-info-review-rating-count'], #acrCustomerReviewText, [data-hook='total-review-count']"));
  const title = clean(doc.querySelector(
    "#productTitle, [data-hook='product-link'], .product-title a, .a-link-normal[href*='/dp/'] .a-size-large"));
  return {
    sampleType,
    pageNumber: Math.max(1, Number(q.get("pageNumber") ?? 1) || 1),
    starFilter: q.get("filterByStar") ?? "",
    sortBy: q.get("sortBy") ?? (sampleType === "featured" ? "featured" : "helpful"),
    reviewerType: q.get("reviewerType") ?? "",
    totalReviews: parseCount(totalRaw) ?? null,
    capturedAt: new Date().toISOString(),
    sourceUrl: `${url.origin}${url.pathname}${url.search}`,
    productTitle: title.slice(0, 200),
    ratingHistogram: histogramOf(doc),
  };
}

/** 从当前页面抽评论。返回 null = 这页没有可采的评论。 */
export function captureReviews(doc: Document, rawUrl: string): ReviewSample | null {
  const url = new URL(rawUrl);
  const marketplace = marketOf(url);
  if (!marketplace) return null;
  const externalId = asinOf(doc, url);
  if (!externalId) return null;

  /*
   * 评论卡片:全文档找 [data-hook="review"],**不限定容器**。
   *
   * 第一版按容器 id 找(#cm-cr-dp-review-list 等),实测在详情页直接抓空 ——
   * 亚马逊换了容器,而卡片本身的 data-hook 十几年没变过。
   * 容器 id 是布局的一部分(改版就变),data-hook 是给自动化用的语义标记(稳)。
   *
   * 那容器原本承担的「这是精选还是全量」怎么判?用**页面地址** ——
   * 那本来就是这个区别的定义:/dp/ 上显示的就是亚马逊挑的,
   * /product-reviews/ 上显示的就是按用户筛选排序的。比猜容器可靠得多。
   */
  const onReviewsPage = isReviewsPage(url);
  const nodes = doc.querySelectorAll("[data-hook='review']");
  if (!nodes.length) return null;

  const reviews: CapturedReview[] = [];
  const seen = new Set<string>();
  for (const node of Array.from(nodes)) {
    const r = extractOne(node);
    if (!r) continue;
    // 同页内去重(亚马逊有时把同一条渲染两遍:一次在顶部精选、一次在列表里)
    const key = r.id || `${r.rating}|${r.date}|${r.text.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviews.push(r);
  }
  if (!reviews.length) return null;

  return {
    platform: "amazon",
    marketplace,
    externalId,
    adapterVersion: AMAZON_REVIEWS_VERSION,
    reviews,
    provenance: provenanceOf(doc, url, onReviewsPage ? "list" : "featured"),
  };
}


/**
 * 该商品的全部评论页地址。
 *
 * 插件知道 ASIN,所以能直接给出这个链接 —— 比让用户在页面上找「查看全部评论」
 * 强得多(实测那个入口在新版页面上不好找,有时干脆没有)。
 *
 * 这不是自动化抓取:用户点一下,开一个他本来也点得到的页面,
 * 到了那页仍然要他自己点采集、自己翻页。插件不会替他做任何一步。
 */
export function allReviewsUrl(url: URL, externalId: string): string {
  return `${url.origin}/product-reviews/${externalId}/?sortBy=recent&pageNumber=1`;
}

/*
 * 这里原本有 STAR_FILTERS 与 starFilterUrl:想靠「五个星级各采一批」把样本做大。
 * 用户实测后确认亚马逊连星级筛选也只放第一页,不同星级拿不到不同的评论 ——
 * 这条路走不通,已删,免得留着承诺一个做不到的能力。
 *
 * provenance 里的 starFilter 仍然解析并记录:用户手动带着筛选参数打开页面时,
 * 那仍是必须如实标注的采样条件。
 */


/**
 * 诊断:这一页上到底有什么。
 *
 * 采集失败时让插件自己报告,而不是靠人肉猜选择器。这不是临时调试代码 ——
 * 「静默失效」是读 DOM 这条路的固有代价,而失效时最缺的就是「现场是什么样」。
 * 用户点一下就能把现场发给我们,比让他去开 DevTools 现实得多。
 */
/**
 * 探针命中数(结构化)。诊断文本给人看,这个给机器 ——
 * 服务端靠它区分「卡片还在但正文没了」这类具体失效形态,
 * 那次线上失效正是这么定位的。
 */
export function probeCounts(doc: Document): Record<string, number> {
  const probes: [string, string][] = [
    ["review", "[data-hook='review']"],
    ["review-body", "[data-hook='review-body']"],
    ["review-star", "[data-hook='review-star-rating']"],
    ["review-date", "[data-hook='review-date']"],
    ["productTitle", "#productTitle"],
    ["asin-input", "input#ASIN"],
    ["price-offscreen", ".a-price .a-offscreen"],
    ["overview-table", "#productOverview_feature_div tr"],
  ];
  const out: Record<string, number> = {};
  for (const [name, sel] of probes) {
    try { out[name] = doc.querySelectorAll(sel).length; } catch { out[name] = -1; }
  }
  return out;
}

export function diagnoseReviews(doc: Document, rawUrl: string): string {
  const probes: [string, string][] = [
    ["data-hook=review", "[data-hook='review']"],
    ["data-hook=review-body", "[data-hook='review-body']"],
    ["data-hook=review-star-rating", "[data-hook='review-star-rating']"],
    ["data-hook=review-date", "[data-hook='review-date']"],
    ["id=cm_cr-review_list", "#cm_cr-review_list"],
    ["id=cm-cr-dp-review-list", "#cm-cr-dp-review-list"],
    ["id=reviewsMedley", "#reviewsMedley"],
    ["id=customer-reviews_feature_div", "#customer-reviews_feature_div"],
    ["class~=review", "[class*='review' i]"],
    ["id~=review", "[id*='review' i]"],
    ["iframe", "iframe"],
    ["a[href*=product-reviews]", "a[href*='product-reviews']"],
  ];
  const lines = [`URL: ${rawUrl}`, `title: ${doc.title.slice(0, 80)}`];
  for (const [label, sel] of probes) {
    let n = 0;
    try { n = doc.querySelectorAll(sel).length; } catch { n = -1; }
    lines.push(`${label}: ${n}`);
  }
  // 看得见「Verified Purchase」这类文字却抓不到卡片 = 结构变了而不是没评论
  const body = doc.body?.textContent ?? "";
  for (const probe of ["Verified Purchase", "Reviewed in", "Top reviews", "customer reviews"]) {
    lines.push(`text"${probe}": ${body.includes(probe) ? "有" : "无"}`);
  }
  // 评论卡片附近的实际结构:找一个含评分文字的最小容器,把它的属性дамп出来
  const star = Array.from(doc.querySelectorAll("i, span, div"))
    .find((el) => /out of 5 stars/i.test(el.textContent ?? "") && (el.textContent ?? "").length < 40);
  if (star) {
    const chain: string[] = [];
    let node: Element | null = star;
    for (let i = 0; i < 6 && node; i += 1) {
      const cls = (node.getAttribute("class") ?? "").slice(0, 60);
      const id = node.getAttribute("id") ?? "";
      const hook = node.getAttribute("data-hook") ?? "";
      chain.push(`${node.tagName.toLowerCase()}${id ? "#" + id : ""}${hook ? "[data-hook=" + hook + "]" : ""}${cls ? "." + cls.replace(/\s+/g, ".") : ""}`);
      node = node.parentElement;
    }
    lines.push("星级所在链路(由内向外): " + chain.join(" < "));
  } else {
    lines.push("星级所在链路: 没找到含「out of 5 stars」的节点");
  }
  return lines.join("\n");
}
