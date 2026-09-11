/**
 * 浏览器扩展的「待确认导入」：拉取队列、确认时并入商品档案、忽略。
 *
 * 为什么要有这一层，而不是让扩展直接写云端商品档案：
 * 商品档案是**本地优先**的（products.ts 里的 localStorage 是主本，云端是镜像）。
 * 扩展若直接写云端，用户切回网站看到的仍是本地那份旧数据，要等 reconcileCloud
 * 才出现——他会以为采集没生效，然后再点一次。所以扩展只入队，
 * 由**这台浏览器**在用户确认时写进本地档案，再走既有的防抖同步推上云。
 *
 * 确认这一步同时承担字段复核：扩展的解析器会随目标站点改版而失准，
 * 让用户过一眼比事后发现档案里混进脏数据便宜得多。
 */
import { authFetch } from "../api";
import * as store from "./products";

export type PendingImport = {
  importId: string;
  platform: string;
  marketplace: string;
  externalId: string;
  sourceUrl: string;
  createdAt: string;
  fields: ImportFields;
  /** 解析器自报的缺失字段——扩展在目标站改版后会开始漏字段，界面据此提示用户核对 */
  missingFields: string[];
  adapterVersion: string;
};

export type ImportFields = {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  mainImage?: string;
  rating?: number;
  reviewCount?: number;
  categoryPath?: string;
  bulletPoints?: string[];
  sellerName?: string;
  fulfillmentType?: string;
  /** 大类排名原文,如 "#1,247 in Home & Kitchen"。不解析成数字 —— 各站点写法不一,
   *  存原文让用户自己看,比存一个可能解析错的数字诚实。 */
  bsr?: string;
  /** 上架日期原文。选品判断新旧的关键信号。 */
  firstAvailable?: string;
  /** 累计已售件数。**TikTok 独有**——亚马逊不公开销量，所以这个字段在亚马逊档案里恒为空。
   *  值取自页面 JSON 的精确数（如 672572），不是页面上显示的缩写「672.6K」。 */
  soldCount?: number;
};

/** 平台展示字段白名单——与后端 IMPORT_FIELDS 一致。经营参数（成本/售价/目标）永不在内。 */
const ALLOWED: (keyof ImportFields)[] = [
  "title", "brand", "price", "currency", "mainImage", "rating",
  "reviewCount", "categoryPath", "bulletPoints", "sellerName", "fulfillmentType",
  "bsr", "firstAvailable", "soldCount",
];

function toNum(v: unknown): number | undefined {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : undefined;
}

/**
 * 后端已按白名单过滤过一遍，这里再过一遍。
 * 不是重复劳动：前端是唯一真正往档案里写的地方，白名单守在写入点才有意义——
 * 将来若有别的入队来源（旧版扩展、导入文件），这道闸门照样管用。
 */
export function sanitizeFields(raw: unknown): ImportFields {
  const out: ImportFields = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const k of ALLOWED) {
    const v = r[k];
    if (v === undefined || v === null) continue;
    if (k === "price" || k === "rating" || k === "reviewCount" || k === "soldCount") {
      const n = toNum(v);
      if (n !== undefined) (out as Record<string, unknown>)[k] = n;
    } else if (k === "bulletPoints") {
      if (Array.isArray(v)) out.bulletPoints = v.filter((x) => typeof x === "string").slice(0, 10) as string[];
    } else if (typeof v === "string" && v.trim()) {
      (out as Record<string, unknown>)[k] = v.trim().slice(0, 500);
    }
  }
  return out;
}

function normalizeRow(row: Record<string, unknown>): PendingImport {
  const payload = (row.payload || {}) as Record<string, unknown>;
  return {
    importId: String(row.import_id ?? ""),
    platform: String(row.platform ?? ""),
    marketplace: String(row.marketplace ?? ""),
    externalId: String(row.external_id ?? ""),
    sourceUrl: String(row.source_url ?? ""),
    createdAt: String(row.created_at ?? ""),
    fields: sanitizeFields(payload),
    missingFields: Array.isArray(payload.missingFields)
      ? (payload.missingFields as unknown[]).map(String) : [],
    adapterVersion: String(payload.adapterVersion ?? "unknown"),
  };
}

export async function fetchPending(): Promise<PendingImport[]> {
  const res = await authFetch("/v1/extension/imports");
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((r: Record<string, unknown>) => normalizeRow(r));
}

async function resolveOnServer(importId: string, status: "accepted" | "dismissed"): Promise<boolean> {
  const res = await authFetch(`/v1/extension/imports/${encodeURIComponent(importId)}`, {
    method: "POST", body: JSON.stringify({ status }),
  });
  return res.ok;
}

export function dismiss(importId: string): Promise<boolean> {
  return resolveOnServer(importId, "dismissed");
}

/**
 * 采集条目 → 商品档案。返回落到哪个商品、以及是并进已有档案还是新建。
 *
 * 合并规则（顺序即优先级）：
 * 1. 按 ASIN + 市场找已有档案——扩展带的是平台身份，比名字可靠
 * 2. **用户亲手命名过的档案（named）不改名**；只有自动起名的才跟随平台标题
 * 3. finance（成本、售价、目标净利率）一律不碰——那是用户的判断，不是页面上的事实
 * 4. 落一条 ident 记录留溯源：来源网址、适配器版本、采集时间
 */
export function applyToArchive(item: PendingImport): {
  product: store.Product; existed: boolean; linkedAsRival: number;
} {
  /*
   * 平台侧的商品 ID —— **所有平台都要存**,不只亚马逊。
   *
   * 原来是 `platform === "amazon" ? externalId : ""`,于是 TikTok 商品的 asin 恒为空。
   * 后果在真机上显形(2026-08-02):商品明明并进了已有档案,而同一次采集的评论样本
   * 却报「还没有商品档案」要求补建 —— 因为 findOrphans 是按 asin+marketplace 匹配的,
   * 空 asin 永远配不上。用户看到的是「同一个商品,上面说合并成功,下面说没有档案」。
   *
   * asin 这个字段的注释本来就写着「平台侧身份锚点(用户贴入/插件带回)」,
   * 不是亚马逊专属;review-samples 里也一直拿它当通用 externalId 用。
   */
  const asin = item.externalId;
  const before = store.findProduct({
    name: item.fields.title || "", marketplace: item.marketplace, asin: asin || undefined,
  });
  const product = store.findOrCreateProduct({
    name: item.fields.title || item.externalId,
    marketplace: item.marketplace,
    asin: asin || undefined,
  });
  const existed = !!before;

  store.updateProduct(product.id, (p) => ({
    ...p,
    // 用户改过的名字不覆盖；自动名（或空名）才跟随平台标题
    name: p.named ? p.name : (item.fields.title?.slice(0, 80) || p.name),
    marketplace: item.marketplace || p.marketplace,
    asin: asin || p.asin,
    // 平台事实整块换新:它描述的是「平台上现在是什么样」,保留旧值没有意义。
    // 与 finance 分开存 —— finance / project / records 原样保留,
    // 这里刻意不解构展开它们。
    platform: {
      ...item.fields,
      sourceUrl: item.sourceUrl,
      capturedAt: Date.now(),
      adapterVersion: item.adapterVersion,
    },
  }));

  // 记录一条溯源。平台事实本身存在 product.platform 上(会被下次采集覆盖),
  // 这条记录是不可变的历史 —— 半年后想知道「当时价格多少」只能靠它。
  store.addRecord(product.id, {
    tool: "ident",
    label: existed ? "扩展采集·更新" : "扩展采集·建档",
    values: {
      ...item.fields,
      platform: item.platform,
      marketplace: item.marketplace,
      externalId: item.externalId,
      url: item.sourceUrl,
      adapterVersion: item.adapterVersion,
      missingFields: item.missingFields,
      source: "extension",
    },
  });

  // 用户可能早就手录过这个 ASIN 当竞品 —— 现在它有真档案了,自动接上,
  // 不该还要他手动去连一次。
  const linked = store.autoLinkRivals();

  if (store.isCloudEnabled()) store.schedulePush();
  return {
    product: store.listProducts().find((x) => x.id === product.id) ?? product,
    existed, linkedAsRival: linked,
  };
}

/** 确认导入：先写本地档案，成功后再把队列项收口。
 *  顺序不能反——服务端先收口而本地写失败，这条采集就无声消失了。 */
export async function accept(item: PendingImport): Promise<{
  product: store.Product; existed: boolean; linkedAsRival: number;
}> {
  const result = applyToArchive(item);
  await resolveOnServer(item.importId, "accepted");
  return result;
}
