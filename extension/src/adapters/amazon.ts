/**
 * 亚马逊商品详情页适配器。
 *
 * 选择器策略:每个字段都给一串候选,按「稳定 → 易变」排。亚马逊各站点、
 * A+ 页面、移动版 DOM 差别很大,而且经常 A/B 测试改版 —— 单一选择器必挂。
 * 抓不到就如实进 missingFields,不猜、不留空串。
 *
 * 版本号在改动选择器时必须递增:导入记录里存着它,某天档案里出现一批脏数据时,
 * 靠它才能定位是哪一版解析器产的。
 */
import {
  type Adapter, type Capture, type ProductFields,
  attrAny, parseCount, parseNumber, text, textAny,
} from "./types";

export const AMAZON_VERSION = "amazon@2";

/** 与网站 lib/crossborder/asin.ts 的 HOST_TO_MARKET 同源,改一处要同步另一处。 */
const HOST_TO_MARKET: Array<[RegExp, string]> = [
  [/(^|\.)amazon\.com$/, "amazon-us"],
  [/(^|\.)amazon\.co\.uk$/, "amazon-uk"],
  [/(^|\.)amazon\.de$/, "amazon-de"],
  [/(^|\.)amazon\.fr$/, "amazon-fr"],
  [/(^|\.)amazon\.it$/, "amazon-it"],
  [/(^|\.)amazon\.es$/, "amazon-es"],
  [/(^|\.)amazon\.co\.jp$/, "amazon-jp"],
  [/(^|\.)amazon\.ca$/, "amazon-ca"],
  [/(^|\.)amazon\.com\.au$/, "amazon-au"],
  [/(^|\.)amazon\.com\.mx$/, "amazon-mx"],
];

const PATH_ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|-\/[a-z]{2}\/dp)\/([A-Z0-9]{10})(?:[/?]|$)/i;

export function marketOf(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  return HOST_TO_MARKET.find(([re]) => re.test(host))?.[1];
}

function asinOf(doc: Document, url: URL): string | undefined {
  const fromPath = url.pathname.match(PATH_ASIN_RE)?.[1];
  if (fromPath) return fromPath.toUpperCase();
  // 后备:详情页把 ASIN 放在隐藏 input / data 属性里(变体切换后 URL 可能不带)。
  //
  // 这里**只认详情页独有的容器**。曾经用过通用的 `[data-asin]`,结果搜索结果页
  // 每张卡片都带这个属性 —— 插件在搜索页会随手抓第一个结果建档,
  // 用户得到一份自己从没打开过的商品档案。
  const fromDom = attrAny(doc, [
    ["input#ASIN", "value"],
    ["input[name='ASIN']", "value"],
    ["#averageCustomerReviews[data-asin]", "data-asin"],
    ["#dp[data-asin]", "data-asin"],
  ]);
  return fromDom && /^[A-Z0-9]{10}$/i.test(fromDom) ? fromDom.toUpperCase() : undefined;
}

/** 这是商品详情页吗。ASIN 之外再要一个详情页独有的结构信号,防止在列表页误采。 */
function looksLikeDetailPage(doc: Document): boolean {
  return !!(doc.querySelector("#productTitle") || doc.querySelector("#titleSection")
    || doc.querySelector("#dp-container") || doc.querySelector("#feature-bullets"));
}

/**
 * 币种:优先读页面自己标的符号,再按站点兜底。
 * 不直接按站点推断 —— 亚马逊会按买家所在地展示别的币种,
 * 站点推断会把一个用美元标价的页面记成欧元。
 */
const MARKET_CURRENCY: Record<string, string> = {
  "amazon-us": "USD", "amazon-uk": "GBP", "amazon-de": "EUR", "amazon-fr": "EUR",
  "amazon-it": "EUR", "amazon-es": "EUR", "amazon-jp": "JPY", "amazon-ca": "CAD",
  "amazon-au": "AUD", "amazon-mx": "MXN",
};
/**
 * 带国别前缀的货币符号 —— 只有这些能单凭符号断定币种。
 *
 * **裸 `$` 不在此列。** amazon.ca / .com.au / .com.mx 的价格就是裸 "$24.99",
 * 原来最后一条 [/\$/, "USD"] 会一律判成美元,而 MARKET_CURRENCY 里的
 * CAD/AUD/MXN 成了死代码 —— 1234 比索被当成 1234 美元(差约 17 倍)。
 * 裸 $ 一律回落到按站点判断。
 */
const SYMBOL_CURRENCY: Array<[RegExp, string]> = [
  [/US\$|\$US/i, "USD"], [/£/, "GBP"], [/€/, "EUR"], [/￥|¥|円/, "JPY"],
  [/CDN\$|C\$/i, "CAD"], [/A\$/i, "AUD"], [/MX\$/i, "MXN"],
];

function currencyOf(priceText: string | undefined, market: string): string | undefined {
  if (priceText) {
    for (const [re, code] of SYMBOL_CURRENCY) if (re.test(priceText)) return code;
  }
  return MARKET_CURRENCY[market];
}

function priceText(doc: Document): string | undefined {
  // .a-offscreen 是给读屏软件的完整价格文本(带币种符号),比拼接整数/小数部分稳
  return textAny(doc, [
    "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
    "#corePrice_feature_div .a-price .a-offscreen",
    "#apex_desktop .a-price .a-offscreen",
    "#price_inside_buybox",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".a-price .a-offscreen",
  ]);
}

function ratingOf(doc: Document): number | undefined {
  // "4.6 out of 5 stars" / "5 段评分中的 4.6 段" —— 各语言写法不同,取第一个小数
  const raw = textAny(doc, [
    "#acrPopover .a-icon-alt",
    "[data-hook='rating-out-of-text']",
    "#averageCustomerReviews .a-icon-alt",
  ]) ?? doc.querySelector("#acrPopover")?.getAttribute("title") ?? undefined;
  if (!raw) return undefined;
  /*
   * **先找小数,找不到才退整数。**
   *
   * 原来是 /(\d+[.,]\d+|\d+)/ —— 交替分支从左往右试,遇到
   * 「5つ星のうち4.6」(日文语序:5 星中的 4.6)会在位置 0 用第二分支匹到满分那个 5,
   * 于是 amazon.co.jp 全站评分都是 5.0。
   * 「5 段评分中的 4.6 段」「별 5개 중 4.4개」同理。
   * 而 n <= 5 这道校验放它过去了 —— 5 确实 <= 5。
   */
  const m = raw.match(/\d+[.,]\d+/) ?? raw.match(/\d+/);
  const n = parseNumber(m?.[0]);
  return n !== undefined && n <= 5 ? n : undefined;
}

function bulletsOf(doc: Document): string[] | undefined {
  const nodes = doc.querySelectorAll("#feature-bullets li span.a-list-item, #featurebullets_feature_div li span.a-list-item");
  const out: string[] = [];
  for (const el of Array.from(nodes)) {
    const t = el.textContent?.replace(/\s+/g, " ").trim();
    // 亚马逊在要点列表里混了「查看更多」这类交互项
    if (t && t.length > 2 && !/^(see more|показать|もっと見る|查看更多)/i.test(t)) out.push(t);
  }
  return out.length ? out.slice(0, 10) : undefined;
}

function categoryOf(doc: Document): string | undefined {
  const nodes = doc.querySelectorAll("#wayfinding-breadcrumbs_feature_div ul li a, #nav-subnav a.nav-b");
  const parts = Array.from(nodes)
    .map((el) => el.textContent?.replace(/\s+/g, " ").trim())
    .filter((t): t is string => !!t);
  return parts.length ? parts.join(" > ") : undefined;
}

/**
 * 品牌。byline 各站点写法不一:"Visit the Acme Store" / "Marke: Acme" /
 * "品牌: Acme" / "Marca: Acme"。
 *
 * 不逐语言枚举前缀 —— 那是场永远追不完的比赛(十个站点 × 亚马逊随时改文案)。
 * 按结构处理:有冒号且冒号前像个标签(短、无空格或极少)就取冒号后。
 */
/**
 * 品牌名的合理性检查。
 *
 * 存在的理由:实测抓到过「访问 Razor 品牌旗舰店」当品牌名 —— byline 是给人看的
 * 广告语,剥不干净就会整句进档案。品牌名的特征很硬:短、不含动词、不含「店」。
 * 与其继续追着各语言的引导语措辞跑,不如在出口设一道闸:像广告语的一律不要。
 */
const BRAND_JUNK = /(访问|访问|visit|shop\s|besuchen|visita|旗舰店|专卖店|官方店|品牌店|store$|storefront|ストア|의\s?스토어)/i;

function plausibleBrand(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  // 品牌名不会有这么长,也不会带句读 —— 那是描述或广告语
  if (!t || t.length > 40 || /[。;;!!??]/.test(t)) return undefined;
  if (BRAND_JUNK.test(t)) return undefined;
  return t;
}

/**
 * 品牌。
 *
 * **先读规格表,再退回 byline** —— 这个顺序是实测纠正过来的。
 * 原来反着来(byline 优先),结果在中文界面的亚马逊页面上抓到了
 * 「访问 Razor 品牌旗舰店」,而同一页的规格表里明明白白写着「品牌 | RAZOR」。
 *
 * 规格表是结构化的键值对,各语言只有键名不同(品牌/Brand/Marke/ブランド);
 * byline 是营销文案,写法无穷且亚马逊一直在改。拿后者当主依据本来就不对。
 */
function brandOf(doc: Document): string | undefined {
  // 1. 规格表:结构化、跨语言只差键名
  const fromTable = plausibleBrand(detailRow(doc, BRAND_RE));
  if (fromTable) return fromTable;

  // 2. byline:剥掉引导语再用。中文/日文没有空格,所以不能靠 \s 断词
  const byline = textAny(doc, [
    "#bylineInfo", "#brand", "a#bylineInfo_feature_div",
    "#bylineInfo_feature_div a", "#brandByLine_feature_div a",
  ]);
  if (!byline) return undefined;
  let v = byline.trim();

  // 「品牌: Acme」这类带冒号的,取冒号后
  const colon = v.search(/[::]/);
  if (colon > 0 && colon <= 15) v = v.slice(colon + 1).trim();

  v = v
    // 前缀引导语。中文「访问」后面可能没有空格
    .replace(/^(visit the|visit|shop|besuchen sie den|visita la tienda de)\s+/i, "")
    .replace(/^(访问|前往|查看)\s*/, "")
    // 后缀店铺词。**不要求前面有空格** —— 中文「品牌旗舰店」是连着写的,
    // 原来那条 /\s+(旗舰店|store)$/ 在中文页面上永远匹配不到
    .replace(/\s*(品牌)?(旗舰店|专卖店|官方店|品牌店|自营店)\s*$/, "")
    .replace(/\s+(store|shop|storefront|ストア|-store)\s*$/i, "")
    .trim();

  return plausibleBrand(v);
}

/** 履约方式:买家框里的「由 X 配送」。判断是不是 FBA —— 选品时的关键一格。 */
function fulfillmentOf(doc: Document): string | undefined {
  const info = textAny(doc, [
    "#merchant-info", "#tabular-buybox", "#fulfillerInfoFeature_feature_div",
    "#shipsFromSoldByModule",
  ]);
  if (!info) return undefined;
  /*
   * 「配送方」与「销售方」的各语言写法。
   *
   * 漏掉的语言不会变成「不知道」,会变成**一个自信的错值** —— 见下面 return。
   * 原来缺意大利语(spedito/venduto),而 amazon-it 是支持的站点:
   * 整个意大利站的履约方式一律被判成 FBM,连自营商品也是。
   * 德语只认了旧写法 "Verkauf durch",现行页面用的是 "Verkauft von" ——
   * 自营被判成 FBA(少判一层)。
   */
  const shipsFromAmazon = /(ships from|发货方|発送元|expédié par|versand durch|enviado por|spedito da|spedizione a cura di).{0,20}amazon/i.test(info)
    || /amazon\.(com|co\.uk|de|fr|it|es|co\.jp|ca|com\.au|com\.mx)\s*(发货|配送)/i.test(info);
  const soldByAmazon = /(sold by|销售方|販売元|vendu par|verkauf(t)? (durch|von)|vendido por|venduto da|venduto e spedito da).{0,20}amazon/i.test(info);
  if (soldByAmazon && shipsFromAmazon) return "亚马逊自营";
  if (shipsFromAmazon) return "FBA";
  /*
   * **认不出就说不知道,不要兜底成 FBM。**
   *
   * 原来无条件 `return "FBM"`:任何一个没覆盖到的语言/改版写法,都会得到
   * 「FBM 自发货」这个确定的结论,还会被 analyze 配上「配送时效由卖家自己控制」
   * 的肯定语气 —— 而 fulfillmentType 不在 missingFields 的 expected 列表里,
   * 缺了也不提示。选品时 FBA/FBM 是关键一格,整站反向而无人知晓。
   * 返回 undefined 至少让它显示成「没抓到」。
   */
  const anySellerInfo = /(sold by|ships from|销售方|发货方|販売元|発送元|vendu par|expédié par|verkauf|versand|vendido|enviado|venduto|spedito)/i.test(info);
  return anySellerInfo ? "FBM" : undefined;
}

function sellerOf(doc: Document): string | undefined {
  return textAny(doc, [
    "#sellerProfileTriggerId",
    "#merchant-info a",
    "#tabular-buybox .tabular-buybox-text[tabular-attribute-name='Sold by'] span",
  ]);
}

/**
 * 商品详情表里的字段(品牌、上架日期、大类排名)。
 *
 * 亚马逊把这些塞在四种结构里、各站点还不一致,所以按「行文本包含关键词」找,
 * 不依赖固定选择器。取值也不能靠切冒号:
 *   规格表  <tr><th>Brand</th><td>Bissell</td></tr>        ← 没有冒号
 *   要点表  <li><span>Date First Available :</span><span>…</span></li>
 * 所以先按**单元格结构**取最后一格,取不到再退回切冒号。
 * (第一版只会切冒号,于是规格表里的品牌被读成 "Brand Bissell" 那一整行,
 *  实测在 BISSELL 那个页面上直接抓空。)
 */
const DETAIL_CONTAINERS = [
  "#productOverview_feature_div tr",           // 顶部规格表(品牌/颜色/尺寸)
  "#productDetails_detailBullets_sections1 tr",
  "#productDetails_techSpec_section_1 tr",
  "#productDetails_db_sections tr",
  "#prodDetails tr",
  "#detailBullets_feature_div li",
  "#detailBulletsWrapper_feature_div li",
  "#productFactsDesktopExpander .a-fixed-left-grid",
].join(", ");

function cellValue(row: Element): string | undefined {
  // 表格行:最后一个单元格就是值
  const cells = row.querySelectorAll("td, th");
  if (cells.length >= 2) {
    const last = cells[cells.length - 1]?.textContent?.replace(/\s+/g, " ").trim();
    if (last) return last;
  }
  // 要点行:<span 标签><span 值>,取最后一个非空 span
  const spans = Array.from(row.querySelectorAll("span"))
    .map((el) => el.textContent?.replace(/\s+/g, " ").trim())
    .filter((t): t is string => !!t && !/[::]\s*$/.test(t));
  if (spans.length >= 2) return spans[spans.length - 1];
  return undefined;
}

function detailRow(doc: Document, keys: RegExp): string | undefined {
  for (const row of Array.from(doc.querySelectorAll(DETAIL_CONTAINERS))) {
    const t = row.textContent?.replace(/\s+/g, " ").trim();
    if (!t || !keys.test(t)) continue;
    const byCell = cellValue(row);
    if (byCell && !keys.test(byCell)) return byCell.slice(0, 200);
    const colon = t.search(/[::]/);
    if (colon > 0) {
      const v = t.slice(colon + 1).trim();
      if (v) return v.slice(0, 200);
    }
    // 既没单元格也没冒号:把标签词从行首剥掉("Brand Bissell" → "Bissell")
    const stripped = t.replace(keys, "").replace(/^[\s::.-]+/, "").trim();
    if (stripped && stripped !== t) return stripped.slice(0, 200);
  }
  return undefined;
}

/**
 * 规格表里「品牌」这一行的键名。
 *
 * **不能用 \b。** \b 要求两侧有一个是 \w,而 CJK 字符不是 —— 于是
 * 「品牌 RAZOR」「品牌松下」「ブランド アンカー」全都匹配不上,
 * v0.2.1 那条「规格表优先」在中/日界面上整体失效,品牌又退回 byline 广告语。
 *
 * 更糟的是我的 fixture 恰好写成 <td>品牌</td><td>RAZOR</td>(标签紧贴 ASCII 值),
 * 那种情况下 \b 侥幸成立 —— 测试通过,真页面不通过。
 *
 * 也不能用 \b 去防 "Brandenburg":表格行文本常常是「BrandBissell」(单元格之间
 * 没有空白),\b 在 d 与 B 之间同样不成立 —— 那样英文站又匹配不上了。
 * 改用「键名后不紧跟小写字母」:Brandenburg 的 e 是小写 → 不命中;
 * BrandBissell 的 B 是大写 → 命中。
 *
 * 注:整条正则**不能带 i 标志** —— 带了之后 (?![a-z]) 会连大写 B 一起排除,
 * "BrandBissell" 又匹配不上。所以键名逐字母写出大小写形态。
 */
const BRAND_RE = /^(?:(?:[Bb][Rr][Aa][Nn][Dd]|[Mm][Aa][Rr][CcKk][AaEe]|[Mm][Aa][Rr][Qq][Uu][Ee])(?![a-z])|品牌|ブランド|브랜드)/;
const FIRST_AVAILABLE_RE = /(date first available|first available|上架时间|発売日|fecha de disponibilidad|im angebot von amazon\.de seit|date de mise en ligne)/i;
const BSR_RE = /(best sellers rank|bestsellers rank|商品の売れ筋ランキング|amazon bestseller-rang|clasificación en los más vendidos|classement des meilleures ventes|排名)/i;

export const amazonAdapter: Adapter = {
  id: "amazon",
  version: AMAZON_VERSION,

  matches(url) {
    return !!marketOf(url);
  },

  extract(doc, url) {
    const marketplace = marketOf(url);
    if (!marketplace) return null;
    const asin = asinOf(doc, url);
    // 搜索页/榜单页/店铺页不该采集 —— 宁可什么都不给,也不要给一份错的档案
    if (!asin || !looksLikeDetailPage(doc)) return null;

    const pt = priceText(doc);
    const fields: ProductFields = {
      title: text(doc, "#productTitle") ?? text(doc, "#title"),
      brand: brandOf(doc),
      price: parseNumber(pt),
      currency: currencyOf(pt, marketplace),
      mainImage: attrAny(doc, [
        ["#landingImage", "data-old-hires"],
        ["#landingImage", "src"],
        ["#imgTagWrapperId img", "src"],
        ["#main-image-container img", "src"],
      ]),
      rating: ratingOf(doc),
      reviewCount: parseCount(textAny(doc, ["#acrCustomerReviewText", "[data-hook='total-review-count']"])),
      categoryPath: categoryOf(doc),
      bulletPoints: bulletsOf(doc),
      sellerName: sellerOf(doc),
      fulfillmentType: fulfillmentOf(doc),
      bsr: detailRow(doc, BSR_RE),
      firstAvailable: detailRow(doc, FIRST_AVAILABLE_RE),
    };

    // 详情页上「本该有」的字段。缺货商品没有价格属正常,但标题/主图缺了就是解析器出问题了。
    const expected: (keyof ProductFields)[] = [
      "title", "price", "mainImage", "rating", "reviewCount", "brand", "categoryPath",
    ];
    const missingFields = expected.filter((k) => fields[k] === undefined);

    for (const k of Object.keys(fields) as (keyof ProductFields)[]) {
      if (fields[k] === undefined) delete fields[k];
    }

    return {
      platform: "amazon",
      marketplace,
      externalId: asin,
      sourceUrl: `${url.origin}${url.pathname.split("/ref=")[0]}`,
      adapterVersion: AMAZON_VERSION,
      fields,
      missingFields,
    };
  },
};
