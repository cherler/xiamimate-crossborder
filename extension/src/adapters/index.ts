/** 适配器注册表。新增平台只在这里加一行。 */
import { type Adapter, type Capture } from "./types";
import { amazonAdapter } from "./amazon";
import { tiktokAdapter } from "./tiktok";
import { captureTikTokReviews, TIKTOK_REVIEWS_VERSION } from "./tiktok-reviews";
import { captureReviews, matchesReviews, AMAZON_REVIEWS_VERSION } from "./amazon-reviews";

// 顺序即优先级:两个适配器的 matches 互斥(按域名),先后无所谓,
// 但新增平台时要确认不会互相抢 —— matches 只看 URL,不碰 DOM,冲突时先命中者赢。
export const ADAPTERS: Adapter[] = [amazonAdapter, tiktokAdapter];

export function adapterFor(rawUrl: string): Adapter | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

/** 在页面里跑一次采集。返回 null = 站点认得但不是商品详情页。 */
export function capture(doc: Document, rawUrl: string): Capture | null {
  const url = new URL(rawUrl);
  const adapter = ADAPTERS.find((a) => a.matches(url));
  return adapter ? adapter.extract(doc, url) : null;
}

export * from "./types";

/**
 * 评论采集的分发。
 *
 * 此前 content/collect.ts 直接 import amazon-reviews —— 写死一个平台。
 * 加 TikTok 时如果照抄成 if (isTikTok) ... else ...,下一个平台还要再改一次,
 * 而漏改的症状是「采集按钮点了没反应」,不报错。所以按 URL 分发,与商品适配器同一套。
 */
export function captureReviewsFor(doc: Document, rawUrl: string): unknown | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  if (tiktokAdapter.matches(url)) return captureTikTokReviews(doc, rawUrl);
  return captureReviews(doc, rawUrl);
}

/**
 * 这一页的评论采集用的是哪份适配器 —— 采集失败上报要带对版本号。
 *
 * popup 原来写死 AMAZON_REVIEWS_VERSION,于是 TikTok 采不到时上报的是
 * 「amazon-reviews@N 失效了」。这种错报比不报更糟:我们会去查一个没坏的东西。
 */
export function reviewsVersionFor(rawUrl: string): string {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return AMAZON_REVIEWS_VERSION; }
  return tiktokAdapter.matches(url) ? TIKTOK_REVIEWS_VERSION : AMAZON_REVIEWS_VERSION;
}

/** 这个页面上「可能有评论可采」吗 —— popup 据此决定要不要显示采集按钮。 */
export function hasReviewsFor(rawUrl: string): boolean {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  return tiktokAdapter.matches(url) || matchesReviews(url);
}
