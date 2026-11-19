/**
 * 亚马逊适配器回归。
 *
 * 适配器是插件里唯一会「自己坏掉」的部分:亚马逊改版,选择器失效,
 * 而失效的表现不是报错而是**静默抓空**——脏数据进档案,用户拿它算利润。
 * 所以这里的用例分两类:抓得对(字段值精确断言),以及抓不到时如实认错(missingFields)。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

import { capture, adapterFor } from "../src/adapters/index";
import { parseNumber, parseCount } from "../src/adapters/types";

function load(name: string, url: string) {
  const html = readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
  const { document } = parseHTML(html);
  return capture(document as unknown as Document, url);
}

const US_URL = "https://www.amazon.com/dp/B0CTEST123/ref=sr_1_3?keywords=bottle";
const DE_URL = "https://www.amazon.de/dp/B0DETEST99";

test("美国站:字段逐个抓对", () => {
  const c = load("amazon-us", US_URL)!;
  assert.ok(c, "详情页没识别出来");
  assert.equal(c.platform, "amazon");
  assert.equal(c.marketplace, "amazon-us");
  assert.equal(c.externalId, "B0CTEST123");
  assert.equal(c.sourceUrl, "https://www.amazon.com/dp/B0CTEST123", "sourceUrl 没剥掉 /ref= 追踪段");

  const f = c.fields;
  assert.match(f.title!, /^Insulated Water Bottle 32oz/);
  assert.equal(f.brand, "HydroPeak", "'Visit the X Store' 没剥干净");
  assert.equal(f.price, 24.99);
  assert.equal(f.currency, "USD");
  assert.equal(f.rating, 4.6);
  assert.equal(f.reviewCount, 12483, "千分位逗号没处理");
  assert.equal(f.mainImage, "https://m.media-amazon.com/images/I/full._AC_SL1500_.jpg",
    "取了缩略图而不是 data-old-hires 高清图");
  assert.equal(f.categoryPath, "Home & Kitchen > Kitchen & Dining > Travel Mugs");
  assert.equal(f.sellerName, "HydroPeak Direct");
  assert.equal(f.fulfillmentType, "FBA");
  assert.match(f.bsr!, /1,247/);
  assert.match(f.firstAvailable!, /March 3, 2024/);
  assert.deepEqual(c.missingFields, []);
});

test("美国站:要点列表剔除「See more」交互项", () => {
  const f = load("amazon-us", US_URL)!.fields;
  assert.equal(f.bulletPoints!.length, 3, "把「See more」当成卖点抓进来了");
  assert.match(f.bulletPoints![0]!, /DOUBLE WALL VACUUM/);
});

test("德国站:欧陆小数点不能读错", () => {
  const c = load("amazon-de", DE_URL)!;
  assert.equal(c.marketplace, "amazon-de");
  // 1.234,56 € —— 读成 1.234 会让用户以为这是个 1 欧的商品
  assert.equal(c.fields.price, 1234.56, "把千分位的点当成了小数点");
  assert.equal(c.fields.currency, "EUR");
  assert.equal(c.fields.rating, 4.3, "德语「4,3 von 5」没解析出来");
  assert.equal(c.fields.reviewCount, 1842);
  assert.equal(c.fields.brand, "Bergquell", "「Marke: X」没剥掉前缀");
  assert.equal(c.fields.fulfillmentType, "FBA", "「Versand durch Amazon」没识别成 FBA");
  assert.match(c.fields.firstAvailable!, /15\. Januar 2023/);
  assert.match(c.fields.bsr!, /3\.412/);
});

test("搜索结果页:不采集,返回 null", () => {
  // 页面上确实有一堆 data-asin,天真的实现会随手抓一个建档
  const c = load("amazon-search", "https://www.amazon.com/s?k=water+bottle");
  assert.equal(c, null, "把搜索结果页当成了商品详情页");
});

test("缺货商品:有价格缺失但仍可采集,并如实报缺", () => {
  const c = load("amazon-oos", "https://www.amazon.com/dp/B0OOSTEST1")!;
  assert.ok(c, "缺货商品应该照样能建档 —— 用户可能正是在研究它为什么下架");
  assert.equal(c.fields.price, undefined);
  assert.equal(c.fields.title, "Discontinued Gadget");
  assert.ok(c.missingFields.includes("price"), "抓不到价格却没报缺 —— 界面就无法提醒用户核对");
  assert.ok(c.missingFields.includes("brand"));
  assert.equal("price" in c.fields, false, "缺失字段不该以 undefined 形式留在 payload 里");
});

test("非亚马逊站点:没有适配器", () => {
  assert.equal(adapterFor("https://www.ebay.com/itm/12345"), null);
  assert.equal(adapterFor("https://example.com"), null);
  assert.ok(adapterFor("https://www.amazon.co.jp/dp/B0TEST00001"));
});

test("URL 里没 ASIN 时从 DOM 兜底", () => {
  // 变体切换 / 从搜索页跳转,URL 可能不带 /dp/
  const c = load("amazon-us", "https://www.amazon.com/gp/aw/ol/B0CTEST123");
  assert.equal(c!.externalId, "B0CTEST123", "URL 无 ASIN 时没从隐藏 input 兜底");
});

test("域名匹配不能被仿冒域名骗过", () => {
  // amazon.com.evil.example 与 notamazon.com 都不是亚马逊
  assert.equal(adapterFor("https://amazon.com.evil.example/dp/B0TEST00001"), null,
    "后缀仿冒域名被当成了亚马逊 —— 会把钓鱼页的内容采进档案");
  assert.equal(adapterFor("https://notamazon.com/dp/B0TEST00001"), null);
  assert.ok(adapterFor("https://www.amazon.com/dp/B0TEST00001"), "正常子域被误伤");
});

test("数字解析:两种千分位写法", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("1.234,56 €"), 1234.56);
  assert.equal(parseNumber("￥12,800"), 12800);
  assert.equal(parseNumber("24.99"), 24.99);
  assert.equal(parseNumber("abc"), undefined);
  assert.equal(parseNumber(undefined), undefined);
  assert.equal(parseCount("12,483 ratings"), 12483);
  assert.equal(parseCount("1.842 Sternebewertungen"), 1842);
  assert.equal(parseCount("共 57 条评价"), 57);
});


test("品牌:byline 只有「Visit the X Store」时从规格表兜底", () => {
  // 实测 B0016HF5GK(BISSELL Little Green)抓不到品牌 —— 顶部规格表用的是
  // <tr><td>Brand</td><td>Bissell</td></tr>,没有冒号,而第一版只会切冒号。
  const c = load("amazon-overview-table", "https://www.amazon.com/dp/B0016HF5GK")!;
  assert.equal(c.fields.brand, "Bissell", "规格表里的品牌没取到");
  assert.equal(c.externalId, "B0016HF5GK");
  assert.equal(c.fields.price, 99.99);
  assert.equal(c.fields.reviewCount, 94050);
  assert.ok(!c.missingFields.includes("brand"), "品牌抓到了却还报缺");
});

test("规格表取值不能把标签一起带出来", () => {
  const c = load("amazon-overview-table", "https://www.amazon.com/dp/B0016HF5GK")!;
  assert.doesNotMatch(c.fields.brand!, /Brand/i, "把「Brand Bissell」整行当成了品牌名");
});

test("要点表里带冒号的行取冒号后的值", () => {
  const c = load("amazon-overview-table", "https://www.amazon.com/dp/B0016HF5GK")!;
  assert.equal(c.fields.firstAvailable, "June 5, 2008");
  assert.match(c.fields.bsr!, /#38/);
  assert.doesNotMatch(c.fields.bsr!, /Best Sellers Rank/i, "排名值里混进了标签文字");
});

test("中文界面:规格表优先,不能把「访问 X 品牌旗舰店」当品牌", () => {
  // 实测踩到的:亚马逊美国站的中文界面下,byline 是「访问 Razor 品牌旗舰店」,
  // 而同一页规格表写着「品牌 | RAZOR」。原来先信 byline、又剥不掉中文后缀
  // (「品牌旗舰店」连着写,没有空格),整句就进了档案。
  const c = load("amazon-cn-locale", "https://www.amazon.com/dp/B0RAZOR001")!;
  assert.equal(c.fields.brand, "RAZOR", "没有优先读规格表");
  assert.doesNotMatch(c.fields.brand!, /访问|旗舰店/, "把 byline 广告语当成了品牌名");
});

test("中文界面的其它字段也要抓对", () => {
  const f = load("amazon-cn-locale", "https://www.amazon.com/dp/B0RAZOR001")!.fields;
  assert.equal(f.price, 27.57, "US$27.57 没解析出来");
  assert.equal(f.rating, 4.8, "中文「4.8 颗星,最多 5 颗星」没解析出来");
  assert.equal(f.reviewCount, 33729);
});

test("没有规格表时仍能从 byline 剥出品牌", () => {
  const c = load("amazon-byline-only", "https://www.amazon.com/dp/B0BYLINE01")!;
  assert.equal(c.fields.brand, "Acme", "规格表缺失时 byline 这条路断了");
});

test("剥不出干净品牌名时宁可不给 —— 别把广告语塞进档案", () => {
  const { document } = parseHTML(`<html><body>
    <h1 id="title"><span id="productTitle">某商品</span></h1>
    <div id="bylineInfo_feature_div"><a id="bylineInfo" href="#">点击访问我们的官方旗舰店,更多惊喜等你发现!</a></div>
    <input type="hidden" id="ASIN" value="B0JUNK0001">
  </body></html>`);
  const c = capture(document as unknown as Document, "https://www.amazon.com/dp/B0JUNK0001")!;
  assert.equal(c.fields.brand, undefined, "一整句广告语被当成了品牌名");
  assert.ok(c.missingFields.includes("brand"), "没抓到品牌却不报缺 —— 界面就不会提醒用户核对");
});


test("价格带单位价时只取主价 —— 这是本次审查抓到的最严重的一个", () => {
  // 亚马逊很常见:「$19.99 ($0.50 / Count)」。
  // parseNumber 原来先把非数字字符全删掉,两个数字粘成一个 → 实测得到 19990.5。
  // 而这个值会直接进商品档案的平台事实,再被「填入财务模型」写成售价 ——
  // 下游所有利润测算全错,而页面上看着就是个「奇怪的大数字」,没人会往解析上想。
  assert.equal(parseNumber("$19.99 ($0.50 / Count)"), 19.99);
  assert.equal(parseNumber("$19.99 ($1.25/Fl Oz)"), 19.99);
  assert.equal(parseNumber("1.234,56 € (0,50 €/Stück)"), 1234.56);
  assert.equal(parseNumber("$99.99 List: $129.99"), 99.99, "划线价在同一段里时取错了主价");
});

test("多语言评分文本里的「满分 5」不能被粘进结果", () => {
  // 「4,5 von 5 Sternen」全删非数字后是 "4,55" → 4.55 分。
  // ratingOf 目前先用正则截一段所以侥幸没错,但 parseNumber 本身必须是对的 ——
  // 下一个调用它的人不会知道要先截。
  assert.equal(parseNumber("4,5 von 5 Sternen"), 4.5);
  assert.equal(parseNumber("4.6 out of 5 stars"), 4.6);
  assert.equal(parseNumber("5つ星のうち4.6"), 5, "日文语序是「5 星中的 4.6」,第一个数字确实是 5");
});

test("前导小数点与尾随分隔符", () => {
  assert.equal(parseNumber(".99"), 0.99, "前导小数点丢了会读成 99");
  assert.equal(parseNumber("$.5"), 0.5);
  assert.equal(parseNumber("5."), 5);
  assert.equal(parseNumber("1,234,"), 1234);
});

test("法语站空格千分位 —— 我自己引入过的回归", () => {
  // v0.2.2 为修「$19.99 ($0.50/Count)」改成「切第一个数字串」,结果在空格处停住:
  // amazon.fr 的 "1 234,56 €" 被读成 1 —— 比原来那个 bug 更糟(差 1000 倍),
  // 而且因为有值,missingFields 不报缺、界面不提示核对,直接进档案填进财务模型。
  assert.equal(parseNumber("1 234,56 €"), 1234.56);
  assert.equal(parseNumber("12 345,00 €"), 12345);
  assert.equal(parseNumber("1 234,56 $"), 1234.56, "加拿大法语界面同样用空格分位");
  // 不换行空格与窄不换行空格,亚马逊都用过
  assert.equal(parseNumber("1 234,56 €"), 1234.56);
  assert.equal(parseNumber("1 234,56 €"), 1234.56);
  // 修这个不能把上一个修坏
  assert.equal(parseNumber("$19.99 ($0.50 / Count)"), 19.99);
});

test("评分要取小数而不是「满分」那个整数", () => {
  // /(\d+[.,]\d+|\d+)/ 的交替分支从左往右试,「5つ星のうち4.6」(日文语序:
  // 5 星中的 4.6)会在位置 0 匹到满分那个 5 → amazon.co.jp 全站评分变 5.0。
  // 而 n <= 5 这道校验放它过去了 —— 5 确实 <= 5。
  const mk = (t: string, url = "https://www.amazon.co.jp/dp/B0RATE0001") => {
    const { document } = parseHTML(`<html><body>
      <h1 id="title"><span id="productTitle">T</span></h1>
      <div id="averageCustomerReviews"><span id="acrPopover" title="${t}"></span></div>
      <div id="imgTagWrapperId"><img id="landingImage" src="x.jpg"></div>
      <input type="hidden" id="ASIN" value="B0RATE0001"></body></html>`);
    return capture(document as unknown as Document, url)!.fields.rating;
  };
  assert.equal(mk("5つ星のうち4.6"), 4.6, "日文语序把满分当成了评分");
  assert.equal(mk("5 段评分中的 4.6 段"), 4.6);
  assert.equal(mk("별 5개 중 4.4개"), 4.4);
  assert.equal(mk("4.6 out of 5 stars", "https://www.amazon.com/dp/B0RATE0001"), 4.6);
  assert.equal(mk("5 out of 5 stars", "https://www.amazon.com/dp/B0RATE0001"), 5, "真的满分要保留");
});

test("裸 $ 不能一律判成美元", () => {
  // amazon.ca / .com.au / .com.mx 的价格就是裸 "$24.99"。原来 SYMBOL_CURRENCY
  // 最后一条 [/\$/, "USD"] 一命中就 return,MARKET_CURRENCY 里的 CAD/AUD/MXN
  // 成了死代码 —— 1234 比索被当成 1234 美元。
  const mk = (price: string, host: string) => {
    const { document } = parseHTML(`<html><body>
      <h1 id="title"><span id="productTitle">T</span></h1>
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">${price}</span></span></div>
      <div id="imgTagWrapperId"><img id="landingImage" src="x.jpg"></div>
      <input type="hidden" id="ASIN" value="B0CURR0001"></body></html>`);
    return capture(document as unknown as Document, `https://www.${host}/dp/B0CURR0001`)!.fields;
  };
  assert.equal(mk("$1,234.56", "amazon.com.mx").currency, "MXN");
  assert.equal(mk("$99.99", "amazon.ca").currency, "CAD");
  assert.equal(mk("$24.99", "amazon.com.au").currency, "AUD");
  assert.equal(mk("US$27.57", "amazon.com").currency, "USD", "带 US 前缀的仍要判 USD");
  assert.equal(mk("$19.99", "amazon.com").currency, "USD");
});

test("规格表的「品牌」键名不能用 \\b —— CJK 不是 \\w", () => {
  // \b 要求两侧有一个是 \w,CJK 都不是。于是「品牌 RAZOR」「品牌松下」匹配不上,
  // v0.2.1 那条「规格表优先」在中/日界面上整体失效。
  // 更糟:原 fixture 写成 <td>品牌</td><td>RAZOR</td>(标签紧贴 ASCII 值),
  // 那种情况下 \b 侥幸成立 —— 测试通过而真页面不通过。
  const mk = (label: string, value: string) => {
    const { document } = parseHTML(`<html><body>
      <h1 id="title"><span id="productTitle">T</span></h1>
      <div id="productOverview_feature_div"><table><tbody>
        <tr><td><span>${label}</span></td><td><span>${value}</span></td></tr>
      </tbody></table></div>
      <div id="bylineInfo_feature_div"><a id="bylineInfo">点击访问品牌旗舰店,更多惊喜</a></div>
      <div id="imgTagWrapperId"><img id="landingImage" src="x.jpg"></div>
      <input type="hidden" id="ASIN" value="B0BRND0001"></body></html>`);
    return capture(document as unknown as Document, "https://www.amazon.com/dp/B0BRND0001")!.fields.brand;
  };
  assert.equal(mk("品牌", "松下"), "松下", "中文标签 + 中文品牌名匹配不上");
  assert.equal(mk("品牌", "RAZOR"), "RAZOR");
  assert.equal(mk("ブランド", "アンカー"), "アンカー");
  assert.equal(mk("브랜드", "앵커"), "앵커");
  assert.equal(mk("Brand", "Bissell"), "Bissell");
  assert.equal(mk("Brandenburg 产地", "德国"), undefined, "「Brandenburg」误命中了品牌键名");
});

test("履约方式:各语言都要认得,认不出就说不知道", () => {
  /*
   * 原来无条件 `return "FBM"` —— 任何没覆盖到的语言都会得到「FBM 自发货」
   * 这个确定的结论,还会被 analyze 配上「配送时效由卖家自己控制」的肯定语气。
   * 而 fulfillmentType 不在 missingFields 的 expected 列表里,缺了也不提示。
   *
   * 实测:意大利语(spedito/venduto)整个没覆盖 → **amazon-it 全站误判成 FBM**,
   * 连自营商品也是;德语只认旧写法 "Verkauf durch",现行页面是 "Verkauft von"。
   * 选品时 FBA/FBM 是关键一格。
   */
  // capture 要有标题才认这是一个商品页
  const wrap = (info: string) =>
    parseHTML(`<html><body><span id="productTitle">测试商品</span>`
      + `<div id="merchant-info">${info}</div></body></html>`).document as unknown as Document;
  const grab = (info: string) => capture(wrap(info), "https://www.amazon.it/dp/B0TESTIT01")?.fields.fulfillmentType;

  assert.equal(grab("Venduto e spedito da Amazon"), "亚马逊自营", "意大利站自营被判错");
  assert.equal(grab("Spedito da Amazon Venduto da TechStore SRL"), "FBA", "意大利站 FBA 被判成 FBM");
  assert.equal(grab("Spedito da TechStore Venduto da TechStore SRL"), "FBM");
  assert.equal(grab("Verkauft von Amazon Versand durch Amazon"), "亚马逊自营", "德语现行写法没认出来");
  assert.equal(grab("Ships from Amazon Sold by ACME"), "FBA");
  // 认不出就该是「没抓到」,而不是一个自信的 FBM
  assert.equal(grab("某种全新的页面结构，什么都不像"), undefined, "认不出却给了确定答案");
});
