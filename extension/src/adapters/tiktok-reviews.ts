/**
 * TikTok Shop 评论采集。
 *
 * 与亚马逊那份的关键差别:
 *
 * 1. **评论在 JSON 里,不在 DOM 里** —— 与商品适配器同一个
 *    __MODERN_ROUTER_DATA__,路径 components_map[n].component_data.review_info。
 *    所以不写选择器,也不怕类名混淆。
 *
 * 2. **初始页只内联 3 条**,其余滚动/展开才加载。这是硬约束,不是我们能绕的:
 *    用户滚过多少,我们就采到多少。所以 provenance 必须如实标注这是**极小样本**,
 *    绝不能让 3 条评论伪装成 71548 条的代表 —— 这个仓的产品承诺就建立在
 *    「偏样本不许伪装成全样本」上。
 *
 * 3. **全量评分分布是白送的** —— review_ratings.rating_result 给出 1–5 星各自的
 *    真实条数(实测 {1:4536, 2:2237, 3:3861, 4:6208, 5:54706}),
 *    这是平台自己算的全量口径,比我们采几条评论有用得多。
 *    亚马逊那边要单独去抓 insights,TikTok 直接就在页面数据里。
 *
 * 4. **不采集评论人身份**。reviewer_name / reviewer_avatar_url / reviewer_id
 *    在 JSON 里都有,一律丢弃 —— 授权页写着「不含评论人姓名、头像与主页」,
 *    那是对用户的承诺,不是可选项。
 */
import type { CapturedReview, ReviewSample } from "./amazon-reviews";
import { marketOf, tiktokProductId } from "./tiktok";

export const TIKTOK_REVIEWS_VERSION = "tiktok-reviews@2";   // @2:认得出评论第几页(sampleType 可为 list);日期正则与合并判据修正

type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === "object" && !Array.isArray(v);

/** 与 tiktok.ts 同一套找法:loaderData → 有 page_config 的页 → components_map(**数组**)。 */
function reviewInfoFromDoc(doc: Document): Bag | null {
  const raw = (doc.querySelector("#__MODERN_ROUTER_DATA__")?.textContent || "").trim();
  if (!raw) return null;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  const loader = isBag(j) ? j.loaderData : null;
  if (!isBag(loader)) return null;
  for (const page of Object.values(loader)) {
    const cfg = isBag(page) ? page.page_config : null;
    const cmap = isBag(cfg) ? cfg.components_map : null;
    const comps: unknown[] = Array.isArray(cmap) ? cmap : isBag(cmap) ? Object.values(cmap) : [];
    for (const comp of comps) {
      const data = isBag(comp) ? comp.component_data : null;
      const ri = isBag(data) ? data.review_info : null;
      if (isBag(ri)) return ri;
    }
  }
  return null;
}

const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** review_time 实测是**毫秒时间戳**(1764656514693),转成 YYYY-MM-DD;认不出留空。 */
export function reviewDate(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  // 秒/毫秒都兼容:10 位当秒
  const ms = String(Math.trunc(n)).length <= 10 ? n * 1000 : n;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (y < 2015 || y > new Date().getUTCFullYear() + 1) return "";   // 明显不合理的不填
  return d.toISOString().slice(0, 10);
}

/** 全量评分分布 —— 平台自己算的,比我们采的样本可信得多。 */
export type RatingHistogram = { star: number; count: number }[];

export function histogramFrom(ri: Bag): { total: number; overall: number; bars: RatingHistogram } | null {
  const rr = isBag(ri.review_ratings) ? ri.review_ratings : null;
  if (!rr) return null;
  const res = isBag(rr.rating_result) ? rr.rating_result : null;
  if (!res) return null;
  const bars: RatingHistogram = [];
  for (let s = 5; s >= 1; s--) {
    const c = int(res[String(s)]);
    bars.push({ star: s, count: c });
  }
  const total = int(rr.review_count);
  const overall = typeof rr.overall_score === "number" ? rr.overall_score : 0;
  // 分布全 0 = 没解析出来,别把空直方图当成「这个商品没人评价」
  return bars.some((b) => b.count > 0) ? { total, overall, bars } : null;
}

/* ---------------- 从**渲染后的 DOM** 补采 ---------------- */

/**
 * SSR 的 JSON 里恒定只有 3 条 —— 用户滚动加载的评论进的是 React 状态,
 * **永远不会回写那个 script 标签**。所以只读 JSON 的话,滚了也白滚。
 * 想让「展开评论区再采」真的有用,必须读渲染后的 DOM。
 *
 * 结构(实测 2026-08-02):#pdp-review-section 内每条评论是一个
 * div.flex.flex-col.gap-12,直接子节点依次是
 *   [0] 评论人 + 是否真实购买 + 国家(评论人身份我们不取)
 *   [1] 星级 —— **有 aria-label="Rating: 5 out of 5 stars"**,不用数星星图标
 *   [2] 正文
 *   [4] 商品规格
 *   [5] 日期 YYYY-MM-DD
 * 第一个 gap-12 块是评分直方图,不是评论 —— 按「有没有星级 aria-label」区分,
 * 不按下标,布局一变下标就错。
 */
const RATING_RE = /(\d+(?:\.\d+)?)\s*out of\s*5/i;
/**
 * 评论日期形如 2026-08-01。用来认「这一块是不是一条评论」。
 *
 * **不能用 \b 当边界。** 整块 textContent 是各子节点直接拼起来的,没有空白:
 *   "商品:LARGE SIZE 5.3 OZ EDGE CONTROL2025-12-02"
 * `L` 和 `2` 都是词字符,中间根本没有词边界,`\b\d{4}` 恒不匹配 ——
 * 于是 62 个星级一个都找不到日期祖先,整个采集静默返回 0 条。
 * 用「前后不是数字」的断言表达真正想要的意思。
 */
const DATE_RE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/;
/** 同一条正则的计数版。分开写是因为带 g 的正则有 lastIndex 状态,test() 复用会隔次失败。 */
const DATE_ALL_RE = /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g;

export function reviewsFromDom(doc: Document): CapturedReview[] {
  /*
   * **从星级出发往上找,不从布局 class 出发。**
   *
   * 第一版遍历 div.flex.flex-col.gap-12 —— 那是详情页内联那几条评论的容器。
   * 真机诊断(2026-08-02)戳破了这个假设:同一页上
   *   [role="img"][aria-label*="out of"]  →  62 个
   *   div.flex.flex-col.gap-12            →   8 个
   * 分页列表里的评论块用的是另一套 class。而且根本没有浮层(dialog: null),
   * 评论就内联在页面里 —— 我先前「浮层」的判断也是错的。
   *
   * 所以锚点选**一定存在且有语义**的那个:星级的 aria-label("Rating: 5 out of 5 stars")。
   * class 会随发版变,aria-label 是无障碍契约,稳得多。
   * 从它往上找最近的、同时含正文与日期的祖先,那就是这条评论的块。
   */
  const out: CapturedReview[] = [];
  const seen = new Set<string>();
  const stars = Array.from(doc.querySelectorAll('[role="img"][aria-label]'));
  for (const star of stars) {
    const m = (star.getAttribute("aria-label") || "").match(RATING_RE);
    if (!m) continue;
    const rating = Math.round(Number(m[1]));

    /*
     * 往上找评论块:判据是「这一块里**正好有一个**日期」。
     *
     * 只判「有日期」不够 —— 再往上一层就是整个评论列表,它当然也含日期,
     * 会把十几条评论并成一条(正文取最长的那条、日期取第一条的),
     * 又是一个自信的错值。要求恰好一个日期,天然锁定单条评论的那层。
     * 层数放到 8:内联块是 2 层,分页列表的嵌套更深,留出余量。
     */
    let block: Element | null = star.parentElement;
    let host: Element | null = null;
    for (let i = 0; i < 8 && block; i++, block = block.parentElement) {
      const hits = (block.textContent || "").match(DATE_ALL_RE);
      if (hits && hits.length === 1) { host = block; break; }
      if (hits && hits.length > 1) break;   // 已经越过单条评论的边界,再往上只会更糟
    }
    if (!host) continue;

    const kids = Array.from(host.querySelectorAll("*"))
      .filter((e) => e.children.length === 0)
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const date = kids.find((t) => DATE_RE.test(t) && t.length <= 12) || "";

    /*
     * 规格不能从叶子节点里取。实测叶子是 ["商品:", "2025-12-02", ...] ——
     * "商品:" 这个标签自己是叶子,而规格值那一节还带子元素(不是叶子),
     * 于是按叶子找会匹配到标签本身,去掉前缀后是空串:静默丢字段。
     * 改成在整块里找「文本以 商品:/Product: 开头、且前缀之后还有内容」的**最小**元素。
     */
    const variant = Array.from(host.querySelectorAll("*"))
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .map((t) => t.match(/^(?:商品|Product)\s*[::]\s*(.+)$/)?.[1] || "")
      .filter(Boolean)
      .sort((a, b) => a.length - b.length)[0] || "";
    // 正文 = 最长的一段,且不是日期/规格/星级说明
    const text = kids
      .filter((t) => t.length > 12 && !DATE_RE.test(t) && !RATING_RE.test(t)
                     && !/^(商品|Product)\s*[::]/.test(t))
      .sort((a, b) => b.length - a.length)[0] || "";
    if (!text || seen.has(text)) continue;
    seen.add(text);

    out.push({
      // DOM 抠的没有 review_id(页面不暴露),而评论分页、要跨页累积去重 ——
      // 用正文当键:同一条评论正文不变,按顺序编号会因翻页顺序变化而认错。
      id: `t:${text.slice(0, 80)}`,
      rating: rating >= 1 && rating <= 5 ? rating : 0,
      date, variant, title: "", text,
      // 「真实购买 / Verified」是本地化文案,认不出就当没有,不瞎猜
      verified: /真实购买|verified/i.test(host.textContent || ""),
      helpful: 0,
    });
  }
  return out;
}

/**
 * 当前在评论列表的第几页。认不出就当详情页内联的精选(featured)。
 *
 * **第一版按 `aria-current="page"` 认,错了。** 那是分页组件的 ARIA 标准写法,
 * 但 TikTok 没这么用 —— 实测这个属性出现在**一个商品标题**上。猜通用契约就是会这样。
 *
 * 真实结构(实测,评论第 3 页保存的页面):
 *   <div class="flex gap-6">
 *     <div class="…rounded-8 cursor-pointer">1</div>
 *     <div class="…rounded-8 cursor-pointer">2</div>
 *     <div class="…rounded-8 cursor-pointer background-color-UIText1 text-color-UISheetFlat1">3</div>
 *     …
 * 当前页靠**多出来的两个 class**(反白高亮)区分,没有任何 aria 标记。
 *
 * 但**不写死那两个类名** —— 它们是 TikTok 的设计令牌,改版就没,
 * 而失效方式是静默退回 featured(样本被低估),不报错。
 * 改用结构判据:一排页码里,**class 与其它兄弟不同的那一个**就是当前页。
 * 这条性质与命名无关,类名整体换掉也还成立。
 *
 * 认不出一律 featured。往保守方向错:把详情页内联的 3 条精选标成 list,
 * 下游会当成「完整的一页」,让平台挑过的 3 条去代表全部口碑 ——
 * 那是这个产品最不该犯的错。
 */
function pageInfo(doc: Document): { sampleType: "featured" | "list"; pageNumber: number } {
  for (const bar of Array.from(doc.querySelectorAll("*"))) {
    /*
     * **只看数字子节点,忽略其余。**
     *
     * 第一版要求「每一个子节点都是连续整数」,那是被夹具骗了:
     * 夹具那个商品只有 7 页(1 2 3 4 5 6 7),恰好满足。而真实的长列表是
     *   上一步  1  2  3  4  5  …  2509  下一步
     * 省略号既不是数字、页码也不连续 —— 判据当场失败,静默退回 featured。
     * 实测(线上,7527 条评论 / 3 条每页 ≈ 2509 页):翻了 7 页采回 21 条,
     * 溯源仍写着「详情页内联的少量评论」。
     *
     * 现在只要求:数字子节点 ≥3 个、严格递增。省略号、上一页/下一页一律跳过。
     */
    const kids = Array.from(bar.children);
    if (kids.length < 3) continue;
    const pages = kids
      .map((k) => ({ el: k, t: (k.textContent || "").trim() }))
      .filter((x) => /^\d{1,6}$/.test(x.t))
      .map((x) => ({ el: x.el, n: Number(x.t) }));
    if (pages.length < 3) continue;
    if (!pages.every((p, i) => i === 0 || p.n > pages[i - 1]!.n)) continue;

    // 当前页 = class 与众不同的那一个。全都一样 → 认不出,不猜。
    const cls = pages.map((p) => p.el.getAttribute("class") || "");
    const tally = new Map<string, number>();
    for (const c of cls) tally.set(c, (tally.get(c) ?? 0) + 1);
    const odd = cls.findIndex((c) => tally.get(c) === 1);
    if (odd < 0 || tally.size !== 2) continue;   // 恰好「多数一致 + 一个例外」才算数

    const n = pages[odd]!.n;
    if (n >= 1) return { sampleType: "list", pageNumber: n };
  }
  return { sampleType: "featured", pageNumber: 1 };
}

export function captureTikTokReviews(doc: Document, rawUrl: string): ReviewSample | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  const marketplace = marketOf(url);
  const externalId = tiktokProductId(url);
  if (!marketplace || !externalId) return null;

  const ri = reviewInfoFromDoc(doc);
  if (!ri) return null;

  const raw = Array.isArray(ri.product_reviews) ? ri.product_reviews : [];
  const reviews: CapturedReview[] = [];
  for (const item of raw) {
    if (!isBag(item)) continue;
    const text = String(item.review_text ?? "").trim();
    if (!text) continue;                       // 只有图片没有正文的,采了也没法分析
    reviews.push({
      id: String(item.review_id ?? ""),        // 跨次采集去重靠它
      rating: int(item.review_rating),
      date: reviewDate(item.review_time),
      variant: String(item.sku_specification ?? "").trim(),
      title: "",                               // TikTok 评论没有标题
      text,
      verified: item.is_verified_purchase === true,
      helpful: 0,                              // TikTok 不公开「有帮助」票数
      // 注意:reviewer_name / reviewer_avatar_url / reviewer_id 一律不取 ——
      // 授权页写着「不含评论人姓名、头像与主页」。
    });
  }

  /*
   * DOM 与 JSON 的取舍 —— **DOM 非空就赢,不比条数。**
   *
   * 原来的判据是 `domReviews.length > reviews.length`,基于一个错的假设:
   * 「DOM 是滚动加载出来的,条数会比 SSR 多」。实测不是 ——
   * TikTok 的评论列表是**分页**的,而且每页恰好 3 条
   * (实测某商品 13122 条 / 4374 页 = 3.0)。SSR 的 JSON 也恰好 3 条,
   * 于是 3 > 3 恒为 false:翻到第 4374 页,交回去的仍是 SSR 那三条。
   * 而 SSR 是静态的、永不随翻页变化 —— 用户看到的是「都采过了」,
   * 真相是「我根本没看你翻的那一页」。
   *
   * 条数比大小从来就不该当判据。DOM 是用户眼前真实看到的那一页,
   * 它有内容就以它为准;抠不到才退回 JSON。
   */
  const domReviews = reviewsFromDom(doc);
  if (domReviews.length) {
    // DOM 条目没有 review_id(页面不暴露),只能拿正文当键。
    // 若 JSON 里有同一条,把真 review_id 认领过来 —— 它比正文前 80 字更可靠。
    const byText = new Map(reviews.map((r) => [r.text, r.id]));
    for (const r of domReviews) {
      const realId = byText.get(r.text);
      if (realId) r.id = realId;
    }
    /*
     * 不再把 JSON 那 3 条追加进来。在列表页第 6 页,SSR 那三条**不在这一页上**,
     * 混进去就是「本页评论」里混着别页的内容 —— 采集口径要对得上用户看到的东西。
     */
    reviews.length = 0;
    reviews.push(...domReviews);
  }

  const hist = histogramFrom(ri);
  /*
   * ratingHistogram 的契约是**百分比**(见 amazon-reviews.ts 里的说明:
   * 它是分层采样的权重)。而 TikTok 给的是**条数**(5星 54706 这种)。
   * 直接塞进去就是单位不符的静默错值:下游会把 54706 当成 54706%。
   * 所以这里换算成百分比,并保留一位小数。
   */
  let ratingHistogram: Record<string, number> | null = null;
  if (hist) {
    const sum = hist.bars.reduce((a, b) => a + b.count, 0);
    if (sum > 0) {
      ratingHistogram = {};
      for (const b of hist.bars) ratingHistogram[String(b.star)] = Math.round(b.count / sum * 1000) / 10;
    }
  }

  return {
    platform: "tiktok",
    marketplace,
    externalId,
    adapterVersion: TIKTOK_REVIEWS_VERSION,
    reviews,
    provenance: {
      /*
       * featured(详情页内联的精选几条)还是 list(评论列表页的完整一页)?
       *
       * 这两者对下游的意义完全不同:featured 是平台挑过的、天然偏正面,
       * 让它代表 13122 条的口碑是这个产品最不该犯的错。所以**认不出就按 featured**
       * —— 往保守方向错,宁可低估自己的样本,不可高估。
       *
       * 判据用 ARIA 标准的 aria-current="page"(分页组件的通用契约),
       * 不认 class。注意:尚无真实列表页夹具,若线上认不出,只是退回 featured,
       * 不会产生错值。
       */
      ...pageInfo(doc),
      /*
       * **这三个一律留空 —— 我们根本没读过页面上的排序与筛选控件。**
       *
       * 原来写死成 sortBy:"recent" / reviewerType:"all_reviews",于是样本卡上
       * 印着「按最新排序」。实测 TikTok 的默认是**推荐排序**,不是时间序,
       * 而且还有筛选条件 —— 我们断言了一件从没核实过的事。
       * 这正是这个仓最怕的那类错:不报错、看着专业、而且刚好错在
       * 「这批样本有没有偏」这个最需要准确的地方。
       *
       * 空 = 未知。下游按未知处理(不会声称任何排序),这是诚实的默认。
       * 哪天真去读了那两个控件,再把值填上。
       */
      starFilter: "",
      sortBy: "",
      reviewerType: "",
      totalReviews: hist?.total ?? int(ri.total_reviews) ?? null,
      productTitle: String(
        (Array.isArray(ri.product_reviews) && isBag(ri.product_reviews[0])
          ? (ri.product_reviews[0] as Bag).product_name : "") ?? "").trim(),
      ratingHistogram,
      capturedAt: new Date().toISOString(),
      sourceUrl: url.toString().split("?")[0] || url.toString(),
    },
  };
}
