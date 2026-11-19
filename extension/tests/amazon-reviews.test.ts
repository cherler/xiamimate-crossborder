/**
 * 评论采集。
 *
 * 两条硬约束,其余都是解析细节:
 * 1. **不提取评论人身份**。隐私政策写死了「不接收买家姓名、账号等身份字段」,
 *    所以这些在插件本地就不进内存,而不是"传了再删"。
 * 2. **样本来源必须如实**。详情页那 8 条是亚马逊精选的;拿它跑口碑报告,
 *    结果会和跑 500 条的报告长得一模一样 —— 同样的百分比、同样的信心。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";

import {
  captureReviews, isReviewsPage, matchesReviews,
} from "../src/adapters/amazon-reviews";

function load(name: string, url: string) {
  const html = readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
  const { document } = parseHTML(html);
  return captureReviews(document as unknown as Document, url);
}

const LIST_URL = "https://www.amazon.com/product-reviews/B0016HF5GK/ref=cm_cr_arp_d_paging_btm_next_3"
  + "?pageNumber=3&filterByStar=one_star&sortBy=recent&reviewerType=avp_only_reviews";
const DP_URL = "https://www.amazon.com/dp/B0016HF5GK";

test("列表页:评论逐条抓对", () => {
  const s = load("amazon-reviews-list", LIST_URL)!;
  assert.ok(s, "列表页没识别出评论");
  assert.equal(s.externalId, "B0016HF5GK");
  assert.equal(s.marketplace, "amazon-us");
  assert.equal(s.reviews.length, 2, "没正文的条目不该算样本");

  const first = s.reviews[0]!;
  assert.equal(first.id, "R2ABCDEF1234567");
  assert.equal(first.rating, 1);
  assert.equal(first.title, "Tank cracked after three uses", "标题里混进了评分文本");
  assert.match(first.date, /March 3, 2024/);
  assert.equal(first.variant, "Color: Green");
  assert.equal(first.verified, true);
  assert.equal(first.helpful, 247);
  assert.match(first.text, /hairline crack/);
});

test("绝不提取评论人身份", () => {
  const s = load("amazon-reviews-list", LIST_URL)!;
  const dump = JSON.stringify(s);
  for (const identity of ["Jane D. Smith", "Mike", "amzn1.account", "avatar.jpg", "gp/profile"]) {
    assert.ok(!dump.includes(identity),
      `评论人身份「${identity}」被采进来了 —— 隐私政策明确承诺不接收买家姓名与账号`);
  }
  // 同时确认正文确实抓到了(别因为抓空而"碰巧"通过上面的断言)
  assert.match(dump, /hairline crack/, "正文没抓到,上面的隐私断言是假通过");
});

test("样本溯源:筛选与排序如实记录", () => {
  const p = load("amazon-reviews-list", LIST_URL)!.provenance;
  assert.equal(p.sampleType, "list");
  assert.equal(p.pageNumber, 3);
  assert.equal(p.starFilter, "one_star", "只看了一星却没记下来 —— 报告会把它当成全样本");
  assert.equal(p.sortBy, "recent");
  assert.equal(p.reviewerType, "avp_only_reviews");
  assert.equal(p.totalReviews, 94050);
  assert.ok(p.sourceUrl.includes("pageNumber=3"));
});

test("详情页那几条必须标成 featured", () => {
  const s = load("amazon-reviews-featured", DP_URL)!;
  assert.equal(s.provenance.sampleType, "featured",
    "详情页的精选评论被当成了普通样本 —— 基于 8 条精选好评的报告会伪装成全量分析");
  assert.equal(s.provenance.pageNumber, 1);
  assert.equal(s.reviews.length, 1);
  assert.equal(s.reviews[0]!.rating, 5);
});

test("无筛选时 starFilter 为空,不臆造", () => {
  const p = load("amazon-reviews-list", "https://www.amazon.com/product-reviews/B0016HF5GK")!.provenance;
  assert.equal(p.starFilter, "");
  assert.equal(p.pageNumber, 1);
});

test("页面识别", () => {
  assert.ok(isReviewsPage(new URL(LIST_URL)));
  assert.ok(!isReviewsPage(new URL(DP_URL)));
  assert.ok(matchesReviews(new URL(DP_URL)), "详情页也该能采(那 8 条精选)");
  assert.ok(!matchesReviews(new URL("https://www.amazon.com/s?k=cleaner")), "搜索页不该能采评论");
  assert.ok(!matchesReviews(new URL("https://www.ebay.com/itm/1")), "非亚马逊站点");
});

test("没有评论的页面返回 null", () => {
  const { document } = parseHTML("<html><body><h1>Nothing here</h1></body></html>");
  assert.equal(captureReviews(document as unknown as Document, DP_URL), null);
});


test("容器 id 变了也要抓得到 —— 认 data-hook 不认容器", () => {
  // 实测:详情页明明有评论,插件却说「这一页没找到评论」。
  // 原因是按容器 id 找,而亚马逊换了容器。data-hook 是给自动化用的语义标记,
  // 十几年没变过;容器 id 是布局的一部分,改版就变。
  const s = load("amazon-reviews-newlayout", DP_URL)!;
  assert.ok(s, "换了容器就抓不到 —— 这正是线上失效的样子");
  assert.equal(s.reviews.length, 1);
  assert.equal(s.reviews[0]!.title, "Small, Yet Mighty!");
  assert.equal(s.reviews[0]!.rating, 5);
  assert.equal(s.reviews[0]!.verified, true);
  assert.equal(s.provenance.sampleType, "featured", "详情页上的评论必须标成精选");
});

test("样本类型只看地址,不看容器", () => {
  // 同一份 DOM,在两个地址下有不同含义 —— 这本来就是「精选 vs 全量」的定义
  const asDetail = load("amazon-reviews-list", DP_URL)!;
  const asList = load("amazon-reviews-list", LIST_URL)!;
  assert.equal(asDetail.provenance.sampleType, "featured");
  assert.equal(asList.provenance.sampleType, "list");
});


test("评论页也带回商品名 —— 只采评论时网站才能建出有名有姓的档案", () => {
  const s = load("amazon-reviews-featured", DP_URL)!;
  assert.equal(s.provenance.productTitle, "BISSELL Little Green",
    "没带商品名 —— 用户只采评论不采商品时,档案会是一个光秃秃的 ASIN");
});


test("正文 hook 被拿掉也要抓得到 —— 靠内容而不是靠标记", () => {
  // 线上实测:data-hook="review" 有 13 个,data-hook="review-body" 有 0 个。
  // 正文非空是「算不算一条样本」的判据,所以 13 条全被丢掉,
  // 用户看到的是「这一页没找到评论」。
  const s = load("amazon-reviews-nobodyhook", DP_URL)!;
  assert.ok(s, "正文 hook 一没就整页抓空 —— 这正是线上的失效模式");
  assert.equal(s.reviews.length, 1);
  assert.match(s.reviews[0]!.text, /tested the Little Green on multiple types of stains/);
});

test("兜底取正文时不能把标题、日期、投票数当成正文", () => {
  const r = load("amazon-reviews-nobodyhook", DP_URL)!.reviews[0]!;
  assert.doesNotMatch(r.text, /Reviewed in the United States/, "把日期当成了正文");
  assert.doesNotMatch(r.text, /people found this helpful/, "把投票数当成了正文");
  assert.doesNotMatch(r.text, /Amy Vertacnik/, "把评论人姓名当成了正文 —— 身份字段绝不能进正文");
  assert.equal(r.title, "Small, Yet Mighty!");
  assert.equal(r.helpful, 1204);
});


test("抓下真实星级分布 —— 分层采样的权重", () => {
  // 亚马逊关掉了评论深度翻页,只能按星级分批采。那样「五个星级各 10 条」的样本
  // 会让一星看起来占 20%,而实际只占 5%。没有这份真实占比就没法还原。
  const h = load("amazon-reviews-featured", DP_URL)!.provenance.ratingHistogram!;
  assert.ok(h, "没抓到星级分布 —— 分层样本无法还原成整体");
  assert.deepEqual(h, { "5": 75, "4": 13, "3": 5, "2": 2, "1": 5 });
  assert.equal(Object.values(h).reduce((a, b) => a + b, 0), 100);
});

test("分布缺档就不给 —— 半张表算出来的权重是错的", () => {
  const s2 = load("amazon-reviews-list", LIST_URL)!;
  assert.equal(s2.provenance.ratingHistogram, null,
    "这个 fixture 没有完整的五档分布,不该硬凑一个出来");
});


test("用户手动带筛选参数打开时,仍要如实记录采样条件", () => {
  // 星级筛选按钮已删(亚马逊只放第一页,分层采样这条路走不通),
  // 但用户自己带着 filterByStar 打开页面时,那仍是必须标注的偏差来源。
  const p = load("amazon-reviews-list",
    "https://www.amazon.com/product-reviews/B0016HF5GK?filterByStar=one_star")!.provenance;
  assert.equal(p.starFilter, "one_star");
});

test("日文站每条评论的星级不能都读成 5 ——「5つ星のうち4.0」的语序陷阱", () => {
  /*
   * 日文/中文/韩文把满分写在前面:「5つ星のうち4.0」= 5 星中的 4.0。
   * 旧写法 /(\d+[.,]\d+|\d+)/ 交替分支从左往右试,在位置 0 就用第二分支
   * 匹到那个 5,于是 amazon.co.jp 全站每条评论都是满分 —— 而 n <= 5
   * 这道校验拦不住它。星级结构整体失真,口碑报告会说「几乎全是好评」。
   */
  const card = (stars: string) => `<div data-hook="review" id="R1ABCDEFGHIJ">
    <i data-hook="review-star-rating"><span class="a-icon-alt">${stars}</span></i>
    <span data-hook="review-body"><span>吸引力は強いですが、音がやや大きいです。長く使えそうです。</span></span>
  </div>`;
  const wrap = (inner: string) =>
    parseHTML(`<html><body>${inner}</body></html>`).document as unknown as Document;

  for (const [raw, want] of [
    ["5つ星のうち4.0", 4],          // 日文
    ["5 段评分中的 3.0 段", 3],      // 简体中文
    ["별 5개 중 2.0개", 2],         // 韩文
    ["4.0 out of 5 stars", 4],     // 英文,语序相反,不能改坏
    ["5.0 out of 5 stars", 5],     // 真的满分仍要是 5
  ] as [string, number][]) {
    const s = captureReviews(wrap(card(raw)), DP_URL)!;
    assert.equal(s.reviews[0]!.rating, want, `${raw} → 期望 ${want},实得 ${s.reviews[0]!.rating}`);
  }
});

test("星级直方图:各语言写法都要认得 —— 它是分层采样的权重", () => {
  /*
   * 原来只认 /([1-5])\s*(star|星)/ —— 实测 8 个站点里 6 个拿不到:
   *   5 Sterne / 5 étoiles / 5 estrellas / 5 stelle 都不命中,
   *   而日文韩文更把数字放在词**后面**(星5つ / 별 5개)。
   *
   * 拿不到的后果不是报错,是 ratingHistogram 返回 null —— 静默漏值。
   * 而它是分层采样的权重(见 Provenance.ratingHistogram 的注释):
   * 没有它,「五个星级各 10 条」的样本会让一星看起来占 20%,实际 5%。
   * provenance 整块的意义就是让偏样本无法伪装成全样本,这是它的承重件。
   */
  const rows = (lines: string[]) => `<html><body><table>${
    lines.map((l) => `<tr><td>${l}</td></tr>`).join("")}</table>
    <div data-hook="review" id="R1ABCDEFGHIJ">
      <span data-hook="review-body"><span>这条评论正文足够长,能通过判据。</span></span>
    </div></body></html>`;

  const locales: [string, string[]][] = [
    ["en", ["5 stars 61%", "4 stars 20%", "3 stars 9%", "2 stars 5%", "1 star 5%"]],
    ["de", ["5 Sterne 61%", "4 Sterne 20%", "3 Sterne 9%", "2 Sterne 5%", "1 Sterne 5%"]],
    ["fr", ["5 étoiles 61%", "4 étoiles 20%", "3 étoiles 9%", "2 étoiles 5%", "1 étoiles 5%"]],
    ["es", ["5 estrellas 61%", "4 estrellas 20%", "3 estrellas 9%", "2 estrellas 5%", "1 estrellas 5%"]],
    ["it", ["5 stelle 61%", "4 stelle 20%", "3 stelle 9%", "2 stelle 5%", "1 stelle 5%"]],
    ["jp", ["星5つ 61%", "星4つ 20%", "星3つ 9%", "星2つ 5%", "星1つ 5%"]],
  ];
  for (const [loc, lines] of locales) {
    const doc = parseHTML(rows(lines)).document as unknown as Document;
    const s = captureReviews(doc, DP_URL);
    assert.ok(s?.provenance.ratingHistogram, `${loc} 站拿不到星级分布 —— 分层采样的权重没了`);
    assert.equal(s!.provenance.ratingHistogram!["5"], 61, `${loc} 站的百分比读错了`);
  }
});
