/**
 * 适配器契约。
 *
 * 适配器必须是**纯函数**:(Document, URL) → 字段。不碰网络、不碰 chrome API、
 * 不改页面。理由很实在:适配器是整个插件里唯一会随目标站改版而失效的部分,
 * 纯函数才能拿保存下来的页面 HTML 跑回归 —— 否则每次亚马逊改版都只能靠用户报错。
 */

/** 与后端 IMPORT_FIELDS、前端 extension-imports.ts 的白名单三方一致。 */
export type ProductFields = {
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
  fulfillmentType?: string;   // FBA / FBM / 自营
  bsr?: string;               // 大类排名原文,如 "#1,234 in Home & Kitchen"
  firstAvailable?: string;    // 上架日期原文(选品判断新旧的关键信号)
  /**
   * 累计已售件数。**TikTok 独有 —— 亚马逊不公开销量。**
   *
   * 取 JSON 里的精确值(`sold_count: "672572"`),不是页面上显示的缩写「128.4K」。
   * 缩写是四舍五入过的,而这个数字的全部价值在于它是个确切的量级判断依据。
   * 将来若有人把它改成读页面文本,数字仍会显示、仍然"看起来对",
   * 只是精度悄悄没了 —— 所以在这里写明白。
   */
  soldCount?: number;
};

export type Capture = {
  platform: string;
  marketplace: string;        // products.ts 口径,如 amazon-us
  externalId: string;         // 亚马逊为 ASIN
  sourceUrl: string;
  adapterVersion: string;
  fields: ProductFields;
  /** 该适配器认为**应该有**却没抓到的字段。目标站改版时这里会变长 —— 这是我们唯一的哨兵。 */
  missingFields: string[];
};

export type Adapter = {
  id: string;
  version: string;
  /** 这个适配器认得当前网址吗(只看 URL,不碰 DOM) */
  matches(url: URL): boolean;
  /** 从已渲染的页面提取。返回 null = 认得站点但这不是商品详情页 */
  extract(doc: Document, url: URL): Capture | null;
};

// ---------------- 提取小工具(适配器共用) ----------------

export function text(doc: Document, selector: string): string | undefined {
  const el = doc.querySelector(selector);
  const t = el?.textContent?.replace(/\s+/g, " ").trim();
  return t || undefined;
}

/** 按顺序试多个选择器,取第一个有内容的。页面改版通常是换了个容器,旧选择器留着当后备。 */
export function textAny(doc: Document, selectors: string[]): string | undefined {
  for (const s of selectors) {
    const t = text(doc, s);
    if (t) return t;
  }
  return undefined;
}

export function attrAny(doc: Document, pairs: [string, string][]): string | undefined {
  for (const [sel, attr] of pairs) {
    const v = doc.querySelector(sel)?.getAttribute(attr)?.trim();
    if (v) return v;
  }
  return undefined;
}

/**
 * 从展示文本里取**第一个**数字。
 *
 * 千分位与小数点在各站点是反的:"1.234,56"(德/西/意)与 "1,234.56"(美/英)。
 * 猜错会把 €1.234 读成 1.234 欧,用户拿这个价算利润会得出完全离谱的结论。
 *
 * 判据不是「哪个分隔符在后」而是**它后面跟几位数字**:
 * 小数部分是 1~2 位,千分位后面恒为 3 位。
 * 只看位置会栽在 "￥12,800" 上 —— 日元没有小数位,逗号是千分位,会被读成 12.8。
 * 价格里不存在三位小数,所以「后跟 3 位」一律判千分位。
 *
 * **必须先切出第一个数字串,不能先把非数字字符全删掉。**
 * 亚马逊的价格文本经常带单位价:"$19.99 ($0.50 / Count)"。
 * 全删之后变成 "19.99.0.50",两个数字粘成一个 —— 实测解析出 19990.5,
 * 而这个值会直接进商品档案、再被「填入财务模型」写成售价,下游测算全错。
 */
// 允许前导小数点("$.5" 这种写法虽少见但存在),否则 ".99" 会被读成 99
const FIRST_NUMBER_RE = /[.,]?\d[\d.,]*/;

/**
 * 千分位用的空白。**必须先去掉再切数字串。**
 *
 * 法语站(amazon.fr、加拿大法语界面)的千分位是空格:"1 234,56 €"。
 * 上一版为了修「$19.99 ($0.50/Count)」改成「切第一个数字串」,结果在空格处停住,
 * 把 1234.56 读成 **1** —— 比原来那个 bug 更糟(差 1000 倍),而且因为有值,
 * missingFields 不报缺、界面不提示核对,直接进档案再填进财务模型。
 *
 * 亚马逊实际用过三种:普通空格、不换行空格(U+00A0)、窄不换行空格(U+202F)。
 */
const GROUP_SPACE_RE = /[\s\u00a0\u202f]/g;

export function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // 先去掉千分位空白,再定位第一个数字串 —— 顺序反了会在空格处截断(见 GROUP_SPACE_RE)
  const hit = raw.replace(GROUP_SPACE_RE, "").match(FIRST_NUMBER_RE);
  if (!hit) return undefined;
  // 去掉尾部粘着的分隔符:"5." / "1,234," 这类
  let cleaned = hit[0].replace(/[.,]+$/, "");
  // 前导分隔符补个 0,让后面的「后跟几位」判断照常成立:".99" → "0.99"
  if (/^[.,]/.test(cleaned)) cleaned = "0" + cleaned;
  if (!cleaned) return undefined;

  const lastSep = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));
  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned;
  } else if (cleaned.length - lastSep - 1 === 3) {
    normalized = cleaned.replace(/[.,]/g, "");            // 后跟 3 位 → 千分位
  } else {
    normalized = cleaned.slice(0, lastSep).replace(/[.,]/g, "") + "." + cleaned.slice(lastSep + 1);
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** 只取整数(评价数):"1,234 ratings" → 1234;"共 1,234 条评价" 同样适用。 */
export function parseCount(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.replace(/[., \s]/g, "").match(/\d+/);
  if (!m) return undefined;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : undefined;
}
