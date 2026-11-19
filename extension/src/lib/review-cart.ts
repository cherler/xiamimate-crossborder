/**
 * 评论采集篮:跨页累积用户翻过的评论。
 *
 * 商品信息是一次点击一个结果;评论不是 —— 用户要自己翻好几页,
 * 每页点一次采集,最后一起导入。所以状态必须跨多次弹窗开合活着,落 storage。
 *
 * **不自动翻页。** 自动翻页就是爬虫:服务器上多了不是人产生的访问。
 * 用户自己翻,插件只读他当前看的这一页 —— 这条界线是整个方案能站住的根本。
 */
import { type CapturedReview, type Provenance, type ReviewSample } from "../adapters/amazon-reviews";

const KEY = "reviewCart";
export const MAX_CART_REVIEWS = 500;

export type ReviewCart = {
  platform: string;
  marketplace: string;
  externalId: string;
  adapterVersion: string;
  reviews: CapturedReview[];
  /** 采过的每一页的溯源。报告页要拿它说明「这 N 条是怎么来的」。 */
  pages: Provenance[];
  updatedAt: number;
};

export async function readCart(): Promise<ReviewCart | null> {
  const got = await chrome.storage.local.get(KEY);
  return (got[KEY] as ReviewCart | undefined) ?? null;
}

export async function clearCart(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

export type AddResult = {
  cart: ReviewCart;
  added: number;
  duplicates: number;
  /** 因为到上限而没收下的条数。静默丢弃会让用户以为都采到了。 */
  overflow: number;
  /** 换了商品 —— 旧篮子被清掉了,界面要说一声,不能悄悄丢掉用户翻了十页的成果 */
  switched: boolean;
};

/**
 * 把一页评论加进篮子。
 *
 * 换商品时**换篮子**:一份样本必须属于同一个 ASIN,混着就毫无意义。
 * 但要如实告诉用户旧的没了 —— 他可能刚翻完十页。
 */
export async function addToCart(sample: ReviewSample): Promise<AddResult> {
  const prev = await readCart();
  const sameItem = prev
    && prev.platform === sample.platform
    && prev.marketplace === sample.marketplace
    && prev.externalId === sample.externalId;

  const base: ReviewCart = sameItem && prev ? prev : {
    platform: sample.platform,
    marketplace: sample.marketplace,
    externalId: sample.externalId,
    adapterVersion: sample.adapterVersion,
    reviews: [],
    pages: [],
    updatedAt: 0,
  };

  // 跨页去重:用户来回翻、或详情页与列表页采到同一条,不该让样本量虚高 ——
  // 虚高的样本量会直接抬高报告的置信度表述。
  const seen = new Set(base.reviews.map(keyOf));
  let added = 0, duplicates = 0, overflow = 0;
  for (const r of sample.reviews) {
    // 只比 length:push 已经让它 +1,再加 added 就是双计 —— 上限会变成一半(实测 250)
    if (base.reviews.length >= MAX_CART_REVIEWS) { overflow += 1; continue; }
    if (seen.has(keyOf(r))) { duplicates += 1; continue; }
    seen.add(keyOf(r));
    base.reviews.push(r);
    added += 1;
  }

  /*
   * 同一页重复点采集,溯源不该记两遍 —— 但**判据不能只看 sourceUrl**。
   *
   * 亚马逊的评论翻页会改 URL(?pageNumber=2),所以 sourceUrl 足以区分。
   * TikTok 不改:分页是 React 状态,地址栏从头到尾一个样。
   * 于是 7 次翻页采集里只有第一次的溯源被记下,pageCount 结构上恒为 1、
   * pageNumbers 恒为 [1] —— 实测线上就是这样,而它还被显示成「7 页」的依据。
   * 一个永远算不对的数字,比不显示更糟。
   *
   * 加上 pageNumber 一起判:同一 URL 的不同页各记一次,同一页重复采仍只记一次。
   */
  const seenPage = (p: typeof sample.provenance) =>
    base.pages.some((x) => x.sourceUrl === p.sourceUrl && x.pageNumber === p.pageNumber);
  if (added > 0 && !seenPage(sample.provenance)) {
    base.pages.push(sample.provenance);
  }
  base.updatedAt = Date.now();
  await chrome.storage.local.set({ [KEY]: base });
  return { cart: base, added, duplicates, overflow, switched: !sameItem && !!prev };
}

function keyOf(r: CapturedReview): string {
  return r.id || `${r.rating}|${r.date}|${r.text.slice(0, 60)}`;
}

/**
 * 篮子 → 推送体。多页的溯源合成一份总账。
 *
 * `label` 记的是**这批评论是怎么来的**:随商品一起采,还是单独采评论。
 * 两条路以前存下来长得一模一样(source 都是 extension、label 都空),
 * 于是同一个商品下会冒出两张看不出区别的卡片 —— 用户合理地觉得莫名其妙。
 * 重复本身是正常的(去重在读的时候做),但「为什么有两条」得让人一眼看懂。
 */
export function toPayload(cart: ReviewCart, label = "") {
  const pageNumbers = [...new Set(cart.pages.map((p) => p.pageNumber))].sort((a, b) => a - b);
  const stars = [...new Set(cart.pages.map((p) => p.starFilter).filter(Boolean))];
  const sorts = [...new Set(cart.pages.map((p) => p.sortBy).filter(Boolean))];
  // 只要掺了一页详情页精选,整批就不能算作 list —— 就低不就高
  const sampleType = cart.pages.every((p) => p.sampleType === "list") ? "list" : "featured";
  return {
    platform: cart.platform,
    marketplace: cart.marketplace,
    externalId: cart.externalId,
    adapterVersion: cart.adapterVersion,
    label,
    reviews: cart.reviews,
    provenance: {
      sampleType,
      pageNumber: pageNumbers[0] ?? 1,
      pageNumbers,
      starFilter: stars.join(","),
      sortBy: sorts.join(","),
      reviewerType: [...new Set(cart.pages.map((p) => p.reviewerType).filter(Boolean))].join(","),
      totalReviews: cart.pages.find((p) => p.totalReviews !== null)?.totalReviews ?? null,
      capturedAt: new Date(cart.updatedAt).toISOString(),
      sourceUrl: cart.pages[0]?.sourceUrl ?? "",
      pageCount: cart.pages.length,
      // 任一页抓到商品名就够 —— 用户可能只采评论没采商品,网站靠它建档
      productTitle: cart.pages.find((p) => p.productTitle)?.productTitle ?? "",
      // 真实星级分布:分层样本还原成整体的权重
      ratingHistogram: cart.pages.find((p) => p.ratingHistogram)?.ratingHistogram ?? null,
      // 已采过哪些星级 —— 报告据此判断这份分层样本齐不齐
      starsCovered: [...new Set(cart.pages.map((p) => p.starFilter).filter(Boolean))],
    },
  };
}
