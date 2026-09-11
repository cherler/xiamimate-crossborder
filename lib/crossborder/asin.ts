/**
 * 商品链接 / ASIN 识别(#57 插件 step-0)。
 *
 * 纯本地解析,不发任何请求 —— 平台页面我们不抓取(产品承诺),
 * 但用户手里的链接/ASIN 本身是身份信息,贴进来就能建档:
 * 商品实体从此有了平台侧锚点,浏览器插件后续填充的就是同一个档案。
 */

export type ListingRef = {
  asin: string;
  marketplace: string;        // products.ts 的 marketplace 口径,如 amazon-us
  url: string | null;         // 贴的是链接时保留原始链接(截断查询串)
};

const HOST_TO_MARKET: Array<[RegExp, string]> = [
  [/amazon\.com$/, "amazon-us"],
  [/amazon\.co\.uk$/, "amazon-uk"],
  [/amazon\.de$/, "amazon-de"],
  [/amazon\.fr$/, "amazon-fr"],
  [/amazon\.it$/, "amazon-it"],
  [/amazon\.es$/, "amazon-es"],
  [/amazon\.co\.jp$/, "amazon-jp"],
  [/amazon\.ca$/, "amazon-ca"],
  [/amazon\.com\.au$/, "amazon-au"],
  [/amazon\.com\.mx$/, "amazon-mx"],
];

// ASIN:10 位大写字母/数字。新品几乎都是 B0 开头,但老 ASIN 可能是纯数字(ISBN)。
const ASIN_RE = /^[A-Z0-9]{10}$/;
const PATH_ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|-\/[a-z]{2}\/dp)\/([A-Z0-9]{10})(?:[/?]|$)/i;

export function parseListingRef(raw: string): ListingRef | null {
  const input = raw.trim();
  if (!input) return null;

  // 裸 ASIN
  const bare = input.toUpperCase();
  if (ASIN_RE.test(bare) && /[A-Z]/.test(bare)) {
    return { asin: bare, marketplace: "amazon-us", url: null };
  }

  // 链接
  let u: URL;
  try { u = new URL(input.startsWith("http") ? input : `https://${input}`); }
  catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  const market = HOST_TO_MARKET.find(([re]) => re.test(host))?.[1];
  if (!market) return null;
  const m = u.pathname.match(PATH_ASIN_RE);
  if (!m) return null;
  return {
    asin: m[1].toUpperCase(),
    marketplace: market,
    url: `${u.origin}${u.pathname.split("/ref=")[0]}`,
  };
}

// 销售平台 + 地区。深度研究是公开网络洞察(不抓平台页),平台在这里是「市场框架 +
// 检索角度」——不同平台的口碑画像不同(亚马逊长评论 vs TikTok 达人/病毒式),
// TikTok 内容对公开搜索引擎不友好,覆盖会弱于亚马逊系(报告里如实标注)。
export const MARKET_LABEL: Record<string, string> = {
  "amazon-us": "亚马逊美国", "amazon-uk": "亚马逊英国", "amazon-de": "亚马逊德国",
  "amazon-fr": "亚马逊法国", "amazon-it": "亚马逊意大利", "amazon-es": "亚马逊西班牙",
  "amazon-jp": "亚马逊日本", "amazon-ca": "亚马逊加拿大", "amazon-au": "亚马逊澳洲",
  "amazon-mx": "亚马逊墨西哥",
  "tiktok-us": "TikTok Shop 美国", "tiktok-uk": "TikTok Shop 英国",
  "tiktok-id": "TikTok Shop 印尼", "tiktok-sea": "TikTok Shop 东南亚",
};

/** 平台是否为 TikTok Shop —— gather 补达人检索角度、报告标注覆盖限制都据此判断。 */
export function isTikTokMarket(marketplace?: string | null): boolean {
  return !!marketplace && marketplace.toLowerCase().startsWith("tiktok");
}
