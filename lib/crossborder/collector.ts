import {
  parseCaptureBundle, bundleIdentity, bundleTitle, reviewKey, type CaptureBundle, type CollectedReview,
} from "../../shared/collector";
import { defaultModel } from "./product-model";
import type { Product } from "./products";
export async function captureFingerprint(bundle: CaptureBundle): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...bundle, exportedAt: "" }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}
/** Prepare without mutating the store. Import commits once, after user confirmation. */
export function prepareCaptureProduct(products: Product[], bundle: CaptureBundle, fingerprint: string, now = Date.now()) {
  const ref = bundleIdentity(bundle);
  const existing = products.find(p => p.asin === ref.externalId && p.marketplace === ref.marketplace);
  if (existing?.records?.some(r => r.tool === "capture" && r.values.fingerprint === fingerprint))
    return { product: existing, duplicate: true };
  const p: Product = existing ?? {
    id: "prod_" + crypto.randomUUID(), stableId: "pid_" + crypto.randomUUID(),
    name: bundleTitle(bundle), marketplace: ref.marketplace, asin: ref.externalId,
    finance: defaultModel(), project: null, named: true, cloudId: null, updatedAt: now,
  };
  if ((p.records?.length ?? 0) >= 50) throw new Error("该商品已有 50 条记录。请先备份并整理记录，再导入；现有内容未改动。");
  const c = bundle.product;
  const capturedAt = c ? Date.parse(c.capturedAt) : 0;
  const platform = c && capturedAt >= (p.platform?.capturedAt ?? 0)
    ? { ...p.platform, ...c.fields, sourceUrl: c.sourceUrl, capturedAt, adapterVersion: c.adapterVersion }
    : p.platform;
  return { duplicate: false, product: {
    ...p, platform, updatedAt: Math.max(now, p.updatedAt + 1),
    records: [{ id: "capture_" + crypto.randomUUID(), ts: now, tool: "capture", label: "插件采集 · " + bundleTitle(bundle),
      values: { fingerprint, bundle, summary: captureSummary(bundle) } }, ...(p.records ?? [])],
  } };
}
export function captureSummary(b: CaptureBundle): string {
  const ref = bundleIdentity(b), c = b.product;
  return [
    bundleTitle(b) + " · " + ref.marketplace + " · " + ref.externalId,
    ...(c ? ["采集时间：" + c.capturedAt, "来源：" + c.sourceUrl,
      ...Object.entries(c.fields).map(([k, v]) => k + "：" + (Array.isArray(v) ? v.join("；") : v))] : []),
    ...(b.reviews ? ["评论样本：" + b.reviews.reviews.length + " 条；仅代表已展开页面",
      ...b.reviews.pages.map(p => p.sourceUrl + " · 第 " + p.pageNumber + " 页 · " + p.sampleType + " · " + (p.starFilter || "无星级筛选"))] : []),
    ...(b.insights ? ["平台摘要（非本工具生成）：" + b.insights.summary,
      ...b.insights.topics.map(t => t.name + "：" + t.mentions + " 次提及")] : []),
  ].join("\n");
}
export function captureBundles(p: Product): CaptureBundle[] {
  return (p.records ?? []).filter(r => r.tool === "capture" && r.values.bundle).flatMap(r => {
    try { return [parseCaptureBundle(JSON.stringify(r.values.bundle))]; } catch { return []; }
  });
}
export function collectedReviews(p: Product): CollectedReview[] {
  const seen = new Map<string, CollectedReview>();
  for (const b of captureBundles(p)) for (const r of b.reviews?.reviews ?? [])
    if (!seen.has(reviewKey(r))) seen.set(reviewKey(r), r);
  return [...seen.values()];
}
