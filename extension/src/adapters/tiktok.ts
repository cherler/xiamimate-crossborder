/**
 * TikTok Shop 商品详情页适配器。
 *
 * **与亚马逊适配器的策略完全不同,原因写在这里。**
 *
 * 亚马逊那份是「一串 CSS 选择器按稳定度排队」,因为亚马逊的 DOM 有语义 id
 * (#productTitle、#acrPopover),改版也还认得出。TikTok Shop 是 React 渲染、
 * 类名全部混淆(css-1x2y3z-StyledTitle),而且每次发版都变 —— 写死选择器
 * 活不过一次发版,而失败方式是**静默返回空**,不是报错。
 *
 * 所以这里走 JSON:TikTok 把页面数据以 JSON 内联在 <script> 里(SSR 水合用)。
 * 但**不写死 JSON 路径** —— 路径同样会变。改成在所有 script 里找
 * 「形状像商品」的对象:同时具备标题类字段和价格类字段。找形状比找路径耐用。
 *
 * 认不出就如实进 missingFields。宁可交回一个「只有 ID 和链接」的采集结果,
 * 也不要猜一个值 —— 这个仓里所有最难查的 bug 都是「自信的错值」。
 *
 * 已用真实页面验证(tests/fixtures/tiktok-us.html,2026-08-02):
 * 六个字段全部抠得出来,missingFields 为空。
 * 第一版是盲写的,一跑真实页面 URL 正则、JSON 路径、容器类型三处全错 ——
 * 而错的方式都是「静默返回空」。所以夹具测试是这份适配器唯一的真实性来源,
 * 改解析逻辑必须同时更新夹具与版本号。
 */
import {
  type Adapter, type Capture, type ProductFields,
  parseNumber,
} from "./types";

export const TIKTOK_VERSION = "tiktok@2";   // @2:已售数量从 bulletPoints 备注升为一等字段 soldCount

/** 与网站 lib/crossborder/asin.ts 的 MARKET_LABEL 同源,改一处要同步另一处。 */
const HOST_TO_MARKET: Array<[RegExp, string]> = [
  [/(^|\.)shop\.tiktok\.com$/, "tiktok-us"],      // 具体市场由路径/参数再细分
  [/(^|\.)tiktok\.com$/, "tiktok-us"],
];

/** 区域段是路径**第一段**:/us/pdp/... /gb/pdp/...(实测)。 */
const PATH_MARKET: Array<[RegExp, string]> = [
  [/^\/(gb|uk)\//i, "tiktok-uk"],
  [/^\/id\//i, "tiktok-id"],
  [/^\/(my|th|vn|ph|sg)\//i, "tiktok-sea"],
  [/^\/us\//i, "tiktok-us"],
];

/**
 * 商品 ID。TikTok Shop 的详情页路径形态不止一种,这几条都见过:
 *   shop.tiktok.com/view/product/<id>
 *   www.tiktok.com/shop/pdp/<slug>/<id>
 *   shop.tiktok.com/@shop/product/<id>
 * 认不出就返回 undefined —— 没有 ID 的采集结果不该入库(与档案对不上号)。
 */
const ID_PATTERNS = [
  // 实测(2026-08-02,真实页面):shop.tiktok.com/us/pdp/<slug>/<id>
  // 区域段在最前,slug 在中间 —— 我原来按 /shop/pdp/ 猜的形态并不存在。
  /\/[a-z]{2}\/pdp\/[^/]+\/(\d{8,25})/i,
  /\/pdp\/(?:[^/]+\/)?(\d{8,25})/,
  /\/view\/product\/(\d{8,25})/,
  /\/product\/(\d{8,25})/,
];

export function tiktokProductId(url: URL): string | undefined {
  const s = url.pathname;
  for (const re of ID_PATTERNS) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  // 有些形态把 id 放在查询参数里
  const q = url.searchParams.get("product_id") || url.searchParams.get("productId");
  return q && /^\d{8,25}$/.test(q) ? q : undefined;
}

export function marketOf(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  const base = HOST_TO_MARKET.find(([re]) => re.test(host))?.[1];
  if (!base) return undefined;
  const byPath = PATH_MARKET.find(([re]) => re.test(url.pathname))?.[1];
  return byPath || base;
}

/* ---------------- 从 __MODERN_ROUTER_DATA__ 里取商品 ---------------- */

/**
 * 实测结构(2026-08-02,真实商品页):
 *   #__MODERN_ROUTER_DATA__
 *     .loaderData["(region)/pdp/(product_name_slug$)/(product_id)/page"]
 *       .page_config.components_map["3"].component_data.product_info
 *         product_model    { product_id, name, images[], sold_count, ... }
 *         promotion_model  { promotion_product_price.min_price.{sale_price_decimal, currency_name} }
 *         review_model     { product_overall_score, product_review_count }
 *         seller_model     { shop_name, shop_logo }
 *
 * 路由键与 components_map 的下标都会变(那是页面编排的产物),所以**都不写死**:
 * 在 loaderData 下找有 page_config 的那个,再在 components_map 里找带 product_info 的那个。
 * 层级名(product_model / promotion_model …)是接口契约,相对稳定,可以按名取。
 */
type Bag = Record<string, unknown>;
const isBag = (v: unknown): v is Bag => !!v && typeof v === "object" && !Array.isArray(v);

export function productInfoFromDoc(doc: Document): Bag | null {
  const el = doc.querySelector("#__MODERN_ROUTER_DATA__");
  const raw = (el?.textContent || "").trim();
  if (!raw) return null;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  const loader = isBag(j) ? (j as Bag).loaderData : null;
  if (!isBag(loader)) return null;
  for (const page of Object.values(loader)) {
    const cfg = isBag(page) ? (page as Bag).page_config : null;
    // components_map 实测是**数组**(不是对象)—— isBag 显式排除数组,
    // 用它当判据会直接跳过整页。容器允许数组,内容才要求是对象。
    const cmap = isBag(cfg) ? (cfg as Bag).components_map : null;
    const comps: unknown[] = Array.isArray(cmap) ? cmap : isBag(cmap) ? Object.values(cmap) : [];
    for (const comp of comps) {
      const data = isBag(comp) ? (comp as Bag).component_data : null;
      const pi = isBag(data) ? (data as Bag).product_info : null;
      // product_info 有两处:一处只有 product_model{product_id,seller_id}(占位),
      // 真正带内容的那一处有 promotion_model。按「有没有价格」认,不按下标认。
      if (isBag(pi) && isBag(pi.promotion_model)) return pi;
    }
  }
  return null;
}

const sub = (pi: Bag, key: string): Bag | null => (isBag(pi[key]) ? pi[key] as Bag : null);

const str = (v: unknown): string | undefined => {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
};

/** sold_count / product_review_count 实测是**字符串**("672572"),不是数字。 */
const int = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : parseNumber(String(v ?? ""));
  return n !== undefined && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/**
 * 价格取 promotion_product_price.min_price.sale_price_decimal(实测 "10.99")。
 * 用 decimal 而不是 format:format 可能带千分位或货币符号,decimal 是纯数值串。
 * 注意这是**起始价**(多规格商品),所以下面会把它标注清楚。
 */
export function priceFrom(pi: Bag): { price?: number; currency?: string; isFrom: boolean } {
  const promo = sub(pi, "promotion_model");
  const pp = promo && isBag(promo.promotion_product_price) ? promo.promotion_product_price as Bag : null;
  const min = pp && isBag(pp.min_price) ? pp.min_price as Bag : null;
  if (!min) return { isFrom: false };
  const price = parseNumber(String(min.sale_price_decimal ?? min.sale_price_format ?? ""));
  const currency = str(min.currency_name);
  // max_price 与 min_price 不等 → 这是「起始价」,不是唯一售价
  const max = pp && isBag(pp.max_price) ? pp.max_price as Bag : null;
  const maxV = max ? parseNumber(String(max.sale_price_decimal ?? "")) : undefined;
  return { price, currency, isFrom: maxV !== undefined && price !== undefined && maxV > price };
}

export const tiktokAdapter: Adapter = {
  id: "tiktok",
  version: TIKTOK_VERSION,

  matches(url) {
    return !!marketOf(url) && !!tiktokProductId(url);
  },

  extract(doc, url) {
    const externalId = tiktokProductId(url);
    const marketplace = marketOf(url);
    if (!externalId || !marketplace) return null;   // 不是商品详情页

    const pi = productInfoFromDoc(doc);
    const fields: ProductFields = {};
    const missing: string[] = [];
    const need = (k: string, v: unknown) => { if (v === undefined || v === "") missing.push(k); return v; };

    if (!pi) {
      // 连 product_info 都没找到 = 页面结构变了(或不是详情页)。
      // 如实交回「只有 ID 和链接」的结果 —— 不猜,让下游看得见这次采集是空的。
      return {
        platform: "tiktok", marketplace, externalId,
        sourceUrl: url.toString().split("?")[0] || url.toString(),
        adapterVersion: TIKTOK_VERSION, fields: {},
        missingFields: ["__no_product_json__", "title", "price", "currency",
                        "rating", "reviewCount", "sellerName", "mainImage"],
      };
    }

    const pm = sub(pi, "product_model");
    const rm = sub(pi, "review_model");
    const sm = sub(pi, "seller_model");

    const title = str(pm?.name);
    if (need("title", title)) fields.title = title;

    const { price, currency, isFrom } = priceFrom(pi);
    if (need("price", price)) fields.price = price;
    if (need("currency", currency)) fields.currency = currency;

    // 评分实测是数字 4.5,评价数是字符串 "71548"
    const rating = typeof rm?.product_overall_score === "number" ? rm.product_overall_score : undefined;
    if (need("rating", rating !== undefined && rating > 0 && rating <= 5 ? rating : undefined)) {
      fields.rating = rating;
    }
    const reviews = int(rm?.product_review_count);
    if (need("reviewCount", reviews)) fields.reviewCount = reviews;

    const shop = str(sm?.shop_name);
    if (need("sellerName", shop)) fields.sellerName = shop;

    // 主图:images[0].url_list[0]
    const imgs = Array.isArray(pm?.images) ? pm!.images as unknown[] : [];
    const first = isBag(imgs[0]) ? imgs[0] as Bag : null;
    const urls = Array.isArray(first?.url_list) ? first!.url_list as unknown[] : [];
    const img = str(urls[0]);
    if (need("mainImage", img)) fields.mainImage = img;

    /*
     * 已售数量 —— TikTok 特有的强信号,亚马逊没有公开销量。
     * 实测 sold_count 是字符串 "672572"(页面上显示成 672.6K)。
     *
     * 此前它只能塞进 bulletPoints 当一句中文备注,因为白名单里没有这个字段。
     * 结果是采了、存了、传了,而商品详情页与待确认列表**都不渲染 bulletPoints** ——
     * 我们把 TikTok 上最有价值的那个数字采回来,然后藏起来了。
     * 现在已升为一等字段(三仓白名单同时加,有 whitelist-sync 测试兜着)。
     */
    const sold = int(pm?.sold_count);
    if (sold !== undefined) fields.soldCount = sold;

    // 多规格商品的价格是「起始价」,不标注的话用户会当成唯一售价填进利润计算器
    if (isFrom) {
      fields.bulletPoints = ["注意:该商品有多个规格,上方价格是最低规格的起始价"];
    }

    return {
      platform: "tiktok",
      marketplace,
      externalId,
      sourceUrl: url.toString().split("?")[0] || url.toString(),
      adapterVersion: TIKTOK_VERSION,
      fields,
      missingFields: missing,
    };
  },
};
