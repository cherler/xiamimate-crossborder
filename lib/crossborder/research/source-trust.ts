/**
 * 来源可信度:先由**代码按域名**定档,模型只能在此基础上下调。
 *
 * 为什么不让模型自己判:实测(2026-08-01,线上真实报告)它看着标题 + 一段正文猜,
 * 知名域名判得对(nytimes → high/original、youtube → sponsored/low),
 * 长尾商业站全线判错 —— 同一份报告里 6/10 条被标成 official:
 *
 *   official  high  www.bing.com                 ← 搜索结果页
 *   official  mid   www.wholesalesockdeals.com   ← B2B 批发站
 *   official  mid   www.made-in-china.com
 *   official  low   www.omaskafactory.com        ← official 却 sponsored,自相矛盾
 *
 * 而长尾正是选品研究的主场 —— 判错的恰恰是最需要判对的那一批。
 *
 * 代码给不出结论的域名(绝大多数长尾)一律落到 unknown,由模型补判,
 * 但**模型只能下调、不能上调**:它没有能力把一个陌生商业站升成权威来源。
 */

import type { EvidenceLevel } from "./types";

/**
 * 权威一手来源:政府、标准组织、学术、主流媒体。
 *
 * 政府域名要按**各国写法**列全 —— 只写 .gov 会漏掉一大片:
 * 实测线上一条 www.cbsa-asfc.gc.ca(加拿大边境服务局)就没被认出来,
 * 落到 unknown 交给模型,判对纯属碰巧。而跨境研究恰恰常引各国海关/监管口径。
 */
const AUTHORITATIVE = [
  ".gov", ".gov.uk", ".gov.cn", ".gov.au", ".gov.sg", ".gov.in", ".gov.br",
  ".gc.ca", ".canada.ca",            // 加拿大
  ".gouv.fr", ".service-public.fr",  // 法国
  ".go.jp", ".go.kr", ".go.id",      // 日 / 韩 / 印尼
  ".bund.de", ".gv.at", ".admin.ch", // 德 / 奥 / 瑞士
  ".govt.nz", ".gob.mx", ".gob.es",  // 新西兰 / 墨西哥 / 西班牙
  ".europa.eu", "cpsc.gov", "fda.gov", "ftc.gov",
  ".edu", ".ac.uk", ".edu.au", ".edu.cn",
  "iso.org", "astm.org", "en.wikipedia.org",
  "nytimes.com", "reuters.com", "bloomberg.com", "wsj.com", "ft.com",
  "theguardian.com", "bbc.com", "bbc.co.uk", "apnews.com", "cnbc.com",
  "consumerreports.org", "which.co.uk",
];

/** 行业媒体与垂直评测:比长尾商业站可信,但不是一手权威。 */
const TRADE_MEDIA = [
  "modernretail.co", "retaildive.com", "digitalcommerce360.com", "marketplacepulse.com",
  "junglescout.com", "helium10.com", "sellercentral.amazon.com",
  "ecommercebytes.com", "practicalecommerce.com", "packagingdigest.com",
];

/**
 * UGC 平台:内容本身有价值(真实用户声音),但可信度按 ugc 记 —— 单条不足为凭。
 * 注意这里只影响**可信度定档**,是否采纳由 lowValueSourceReason 另行判断。
 */
const UGC_PLATFORMS = [
  "reddit.com", "quora.com", "stackexchange.com", "trustpilot.com",
  "youtube.com", "tiktok.com", "instagram.com", "facebook.com", "x.com", "twitter.com",
];

/** B2B 批发/供应商目录:营销文案为主,规格常年不更新 —— 一律低可信。 */
const B2B_DIRECTORY = [
  "alibaba.com", "made-in-china.com", "dhgate.com", "globalsources.com",
  "indiamart.com", "ec21.com", "tradekey.com", "1688.com", "aliexpress.com",
];

/**
 * 卖家自己的售卖页 —— 路径特征。
 *
 * 这类页面上的说法是**卖家的营销文案**,不是关于这个产品的第三方观察。
 * 它可以作为「市场上有人这么卖、这么标参数」的证据,但不能当可信来源。
 * 实测线上长尾命中大量落在这一类(bagsinbulk / backpacksusa / 2moda …),
 * 而域名表不可能穷举 —— 按路径认更实在。
 *
 * /products/ 与 /collections/ 是 Shopify 的规范路径,这类长尾卖家极多。
 */
const VENDOR_PATH = /\/(products?|collections?|shop|cart|checkout|item|dp|sku)(\/|$)/i;

export type TrustVerdict = {
  level: EvidenceLevel | "unknown";
  /** 为什么这么定 —— 落进证据里,用户点开能看到依据 */
  why: string;
};

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return null; }
}

/**
 * 域名匹配。点号开头的条目(如 ".gouv.fr")既要匹配子域,**也要匹配裸域本身** ——
 * 只写 host.endsWith(".gouv.fr") 的话,gouv.fr 这个域名自己反而匹配不上。
 * 实测就是这么漏的:www.gouv.fr 去掉 www 之后正好是裸域,落到了 unknown。
 */
const matches = (host: string, list: string[]): boolean =>
  list.some((d) => (d.startsWith(".")
    ? host === d.slice(1) || host.endsWith(d)
    : host === d || host.endsWith(`.${d}`)));

/** 按域名定档。认不出的返回 unknown —— 交给模型补判,但它只能往低了调。 */
export function trustByDomain(url: string | null | undefined): TrustVerdict {
  const host = hostOf(url);
  if (!host) return { level: "high", why: "你上传的一手数据" };   // user_upload 无 url
  if (matches(host, AUTHORITATIVE)) return { level: "high", why: "权威机构或主流媒体" };
  if (matches(host, TRADE_MEDIA)) return { level: "mid", why: "行业媒体 / 垂直评测" };
  if (matches(host, B2B_DIRECTORY)) return { level: "low", why: "B2B 目录站,以营销文案为主" };
  if (matches(host, UGC_PLATFORMS)) return { level: "low", why: "用户生成内容,单条不足为凭" };
  // 卖家售卖页按路径认 —— 放在权威/行业媒体判定**之后**,
  // 免得把 nytimes.com/products/… 这种正经内容误降级。
  try {
    if (VENDOR_PATH.test(new URL(url!).pathname)) {
      return { level: "low", why: "卖家自己的售卖页,内容是营销文案" };
    }
  } catch { /* URL 前面已经解析过,这里不会到 */ }
  return { level: "unknown", why: "" };
}

const RANK: Record<EvidenceLevel, number> = { high: 3, mid: 2, low: 1 };

/**
 * 合并代码判定与模型判定。
 *
 * 铁律:**模型只能下调,不能上调**。它没有能力把一个陌生商业站升成权威来源,
 * 而实测它恰恰爱这么干(把 wholesalesockdeals.com 标成 official/mid)。
 * 域名认不出时(unknown)才完全采纳模型的判断 —— 那时它至少读过内容,
 * 比我们一无所知强。
 */
export function resolveTrust(url: string | null | undefined, modelLevel: unknown): TrustVerdict {
  const byCode = trustByDomain(url);
  const m = String(modelLevel) as EvidenceLevel;
  const valid = m === "high" || m === "mid" || m === "low";
  if (byCode.level === "unknown") {
    return valid ? { level: m, why: "按内容判定" } : { level: "low", why: "无法判定来源,保守记低" };
  }
  if (valid && RANK[m] < RANK[byCode.level]) {
    return { level: m, why: `${byCode.why}(按内容下调)` };
  }
  return byCode;
}
