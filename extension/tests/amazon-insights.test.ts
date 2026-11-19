/**
 * 亚马逊「Customers say」全量口碑摘要。
 *
 * 这一块比我们逐页采的十几条评论值钱一个数量级:它的主题计数来自**全部**评论
 * (这个商品是 94,050 条),而亚马逊已经关掉了评论深度翻页与星级筛选,
 * 我们自己最多只能拿到十几条。
 *
 * 所以口碑分析的分工应当是:主题与量级用亚马逊的全量聚类,
 * 代表性原文用我们采的那十几条。用十几条自己聚类得出的占比撑不起置信度。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

import { captureInsights } from "../src/adapters/amazon-insights";

function load(name: string, url: string) {
  const html = readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
  const { document } = parseHTML(html);
  return captureInsights(document as unknown as Document, url);
}

const DP_URL = "https://www.amazon.com/dp/B0016HF5GK";

test("抓下全量主题聚类与计数", () => {
  const i = load("amazon-customers-say", DP_URL)!;
  assert.ok(i, "没抓到 Customers say");
  assert.equal(i.externalId, "B0016HF5GK");
  assert.equal(i.totalReviews, 94050);
  assert.equal(i.topics.length, 8, "主题数不对 —— 多半把「Next page (3)」这类零碎算进来了");

  const top = i.topics[0]!;
  assert.equal(top.name, "Effectiveness");
  assert.equal(top.mentions, 4900, "4.9K 没换算成 4900");
  assert.equal(top.sentiment, "positive");   // 500/4900 ≈ 10% 负面
});

test("负面主题必须认出来 —— 认错方向比没有还糟", () => {
  const topics = load("amazon-customers-say", DP_URL)!.topics;
  const leak = topics.find((t) => t.name === "Leakage")!;
  assert.equal(leak.mentions, 1300);
  assert.equal(leak.negative, 1100);
  assert.equal(leak.sentiment, "negative",
    "「漏水」被当成了正面 —— 会在报告里显示成优点");

  const suction = topics.find((t) => t.name === "Suction")!;
  assert.equal(suction.sentiment, "mixed", "500/1500 = 33% 负面,是「褒贬不一」而非一边倒");
});

test("没有正负条数就是 unknown,不靠图标猜", () => {
  // 图标猜方向那条路已删:类名亚马逊换过好几轮,猜错时会给出一个
  // **自信的错颜色** —— 把「漏水」标成绿色的优点,比不给这条信息糟得多。
  const { document } = parseHTML(`<html><body>
    <span id="acrCustomerReviewText">94,050 ratings</span>
    <a class="a-positive-sentiment"><i class="icon-arrow-up"></i>Leakage (1.3K)</a>
    <input type="hidden" id="ASIN" value="B0016HF5GK">
  </body></html>`);
  const t = captureInsights(document as unknown as Document, DP_URL)!.topics[0]!;
  assert.equal(t.mentions, 1300);
  assert.equal(t.sentiment, "unknown",
    "仅凭 class 里的 positive 就判成正面 —— 这正是那条已删的猜测路径");
});

test("主题按提及量排序 —— 量级就是重要性", () => {
  const topics = load("amazon-customers-say", DP_URL)!.topics;
  const counts = topics.map((t) => t.mentions);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a));
});

test("摘要原文完整抓下", () => {
  const s = load("amazon-customers-say", DP_URL)!.summary;
  assert.match(s, /Customers find the carpet cleaner effective/);
  assert.match(s, /several customers report leakage issues/);
  assert.doesNotMatch(s, /Customers say/, "把标题当成了摘要正文");
});

test("零碎的「(3)」不是主题", () => {
  const topics = load("amazon-customers-say", DP_URL)!.topics;
  assert.ok(!topics.some((t) => /next page/i.test(t.name)), "把翻页链接当成了口碑主题");
  assert.ok(topics.every((t) => t.mentions >= 50));
});

test("没有这一块的商品返回 null,而不是空结构", () => {
  const { document } = parseHTML(
    '<html><body><h1 id="title"><span id="productTitle">冷门商品</span></h1></body></html>');
  assert.equal(captureInsights(document as unknown as Document, DP_URL), null,
    "评论太少的商品没有 Customers say,这不是解析失败");
});


test("小体量商品:阈值不能写死,不然主题几乎全被滤掉", () => {
  // 实测:685 条评论的商品,八个主题提及量是 96/57/35/31/26/24/24/23。
  // 原来用「<50 就丢」(照 94,050 条那个商品校的),结果只剩两个。
  const i = load("amazon-customers-say-small", DP_URL)!;
  assert.equal(i.totalReviews, 685);
  assert.equal(i.topics.length, 8, "主题被绝对阈值杀掉了 —— 量级随商品变化两三个数量级");
  assert.equal(i.topics[0]!.name, "Effectiveness");
  assert.ok(!i.topics.some((t) => /next page/i.test(t.name)), "翻页链接被当成主题");
});

test("正负条数比箭头精确 —— 能算比例才能排出先改哪个", () => {
  const topics = load("amazon-customers-say-small", DP_URL)!.topics;
  const eff = topics.find((t) => t.name === "Effectiveness")!;
  assert.equal(eff.mentions, 96);
  assert.equal(eff.positive, 79);
  assert.equal(eff.negative, 17);
  assert.equal(eff.sentiment, "mixed", "17/96 负面,不该报成一边倒的正面");

  const heat = topics.find((t) => t.name === "Heat up time")!;
  assert.equal(heat.negative, 18);
  assert.equal(heat.sentiment, "negative", "18/24 负面却没被判成负面 —— 这正是要优先改的那一项");

  const quality = topics.find((t) => t.name === "Quality")!;
  assert.equal(quality.sentiment, "positive", "5/57 负面,应当算正面");
});

test("摘要只取真正的一段话,不糊一坨", () => {
  // 实测翻车形态:抓回来的是整个控件的拼接文本 ——
  // 「AI Generated…Select to learn moreEffectiveness(96)Quality(57)…」
  const s2 = load("amazon-customers-say-small", DP_URL)!.summary;
  assert.match(s2, /^Customers find the steam cleaner effective/);
  assert.doesNotMatch(s2, /Select to learn more/, "把按钮文字糊进了摘要");
  assert.doesNotMatch(s2, /\(\d+\)/, "把主题标签糊进了摘要");
  assert.doesNotMatch(s2, /customers mention/i, "把逐主题的统计句糊进了摘要");
  assert.doesNotMatch(s2, /Read more/, "把「Read more」糊进了摘要");
});

test("德/西/意站的点是千分位,不是小数点 —— 1.234 是 1234 不是 1", () => {
  /*
   * 分隔符的含义取决于后面有没有 K/M:有单位是小数点(4.9K=4900),
   * 无单位是千分位(amazon.de 的 1.234=1234)。原来只删逗号,
   * 于是德站 1234 条提及读成 1 —— 而这个错值偏小,
   * mentions > totalReviews 那道校验只防偏大,拦不住它;
   * 排序键还跟着变小,主题被埋到列表末尾,用户看到「几乎没人提」。
   */
  const doc = (chips: string) => parseHTML(`<html><body>
    <span id="acrCustomerReviewText">5.678 Bewertungen</span>
    ${chips}
  </body></html>`).document as unknown as Document;

  const i = captureInsights(doc(`
    <a><span>Verarbeitung (1.234)</span></a>
    <a><span>Lautstärke (2.345)</span></a>
    <a><span>Preis (96)</span></a>
  `), "https://www.amazon.de/dp/B0016HF5GK")!;

  const by = Object.fromEntries(i.topics.map((t) => [t.name, t.mentions]));
  assert.equal(by["Verarbeitung"], 1234, "德站千分位点被当成小数点了");
  assert.equal(by["Lautstärke"], 2345);
  assert.equal(by["Preis"], 96, "没有分隔符的整数不能改坏");
  assert.equal(i.totalReviews, 5678, "评论总数(分母)同样是千分位");

  // 带单位时点仍是小数点 —— 不能为了修德站把这条弄反
  const k = captureInsights(doc(`<a><span>Effectiveness (4.9K)</span></a>`), DP_URL)!;
  assert.equal(k.topics[0]!.mentions, 4900, "4.9K 被当成千分位读成 49000 了");
});
