/**
 * TikTok Shop 评论采集 —— 真实页面夹具验证。
 *
 * 实测(tests/fixtures/tiktok-us.html):详情页只内联 3 条评论,其余滚动加载。
 * 但**全量评分分布是白送的**:review_ratings.rating_result 给出 1–5 星真实条数,
 * 那是平台自己算的全量口径,比我们采到的 3 条有用得多。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

import {
  captureTikTokReviews, reviewDate, histogramFrom, reviewsFromDom, TIKTOK_REVIEWS_VERSION,
} from "../src/adapters/tiktok-reviews";
import { captureReviewsFor, hasReviewsFor } from "../src/adapters/index";

const here = dirname(fileURLToPath(import.meta.url));
const URL_STR = "https://shop.tiktok.com/us/pdp/edge-control-gel/1729385107321885580?source=x";
const doc = () => parseHTML(readFileSync(join(here, "fixtures/tiktok-us.html"), "utf8"))
  .document as unknown as Document;

test("真实页面能采到评论正文", () => {
  const s = captureTikTokReviews(doc(), URL_STR)!;
  assert.ok(s, "整页没认出来");
  assert.equal(s.platform, "tiktok");
  assert.equal(s.externalId, "1729385107321885580");
  assert.ok(s.reviews.length >= 1, "一条评论都没采到");
  const r = s.reviews[0]!;
  assert.ok(r.text.length > 5, "评论正文是空的");
  assert.ok(r.rating >= 1 && r.rating <= 5, `评分不合法:${r.rating}`);
  assert.ok(r.id, "没有评论 id —— 跨次采集去重就没依据了");
});

test("评论时间是毫秒时间戳,要转成日期", () => {
  assert.equal(reviewDate(1764656514693), "2025-12-02");
  assert.equal(reviewDate(1764656514), "2025-12-02", "十位数当秒处理");
  assert.equal(reviewDate(0), "", "认不出的不瞎填");
  assert.equal(reviewDate("abc"), "");
  assert.equal(reviewDate(99999999999999), "", "明显不合理的年份不填");
});

test("不采集评论人身份 —— 授权页写着不含姓名与头像", () => {
  const s = captureTikTokReviews(doc(), URL_STR)!;
  const blob = JSON.stringify(s);
  // JSON 里确实有 reviewer_name / reviewer_avatar_url,必须一个都不带出来
  for (const k of ["reviewer_name", "reviewer_avatar", "reviewer_id", "tiktokcdn-us.com/tos-useast5-avt"]) {
    assert.ok(!blob.includes(k), `采集结果里带出了 ${k} —— 这是对用户承诺过不采的`);
  }
});

test("全量评分分布要拿到,且换算成百分比", () => {
  const s = captureTikTokReviews(doc(), URL_STR)!;
  const h = s.provenance.ratingHistogram!;
  assert.ok(h, "没拿到评分分布 —— 那是平台算好的全量口径,白送的");
  // 实测 {1:4536, 2:2237, 3:3861, 4:6208, 5:54706},5 星应占七成以上
  assert.ok(h["5"]! > 70 && h["5"]! < 80, `5 星占比 ${h["5"]!}%,与实测不符`);
  const sum = Object.values(h).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 1.5, `各星占比合计 ${sum}%,不是百分比口径`);
  // 这一条最要紧:契约是百分比,而 TikTok 给的是条数。
  // 直接透传的话 54706 会被下游当成 54706%,分层采样权重全废。
  assert.ok(h["5"]! < 100, "看起来把条数当百分比透传了");
});

test("3 条不能伪装成 71548 条 —— 靠总数与页码,不靠 sampleType", () => {
  /*
   * 这条测试原本断言 sampleType 必须是 featured,理由是「详情页只内联 3 条精选」。
   * **那个前提是错的。** 实测详情页嵌的就是评论列表的**第 1 页**,下面带着
   * 完整的分页条(1 2 3 4 5 … 23850)—— TikTok 根本没有「精选评论」这回事,
   * 是我拿亚马逊的心智去套。标成 featured 反而在说一件不存在的事。
   *
   * 「3 条不代表 71548 条」这件事本来也不该由 sampleType 承担:
   * 它由 totalReviews 与采样比例表达(网站的 samplePenalty 在比例 <2% 时
   * 会明说「只采了该商品 0.0% 的评论」),那个口径对分页与非分页一样成立。
   */
  const s = captureTikTokReviews(doc(), URL_STR)!;
  assert.equal(s.provenance.sampleType, "list");
  assert.equal(s.provenance.pageNumber, 1, "详情页嵌的是评论列表第 1 页");
  assert.ok((s.provenance.totalReviews ?? 0) > 1000,
    "没带上评论总数 —— 没有它就算不出采样覆盖率,3 条会被当成全部");
  assert.ok(s.reviews.length / (s.provenance.totalReviews ?? 1) < 0.02,
    "采样比例应当极低,下游据此给出「仅供参考」的提示");
});

/* ── 分发 ── */

test("评论采集按 URL 分发,不再写死亚马逊", () => {
  assert.ok(hasReviewsFor(URL_STR), "TikTok 商品页被判成「没有评论可采」");
  assert.ok(hasReviewsFor("https://www.amazon.com/product-reviews/B0XXXXXXXX"), "亚马逊评论页被判错");
  assert.ok(!hasReviewsFor("https://example.com/x"), "无关页面被认领");

  const s = captureReviewsFor(doc(), URL_STR) as { platform?: string } | null;
  assert.equal(s?.platform, "tiktok", "分发没走到 TikTok 采集器");
});

test("页面结构变了就返回 null,不交回空样本", () => {
  const empty = parseHTML("<html><body>x</body></html>").document as unknown as Document;
  assert.equal(captureTikTokReviews(empty, URL_STR), null);
  // 分布全 0 也不算「拿到了」—— 别把空直方图当成「这商品没人评价」
  assert.equal(histogramFrom({ review_ratings: { rating_result: { "1": 0, "5": 0 } } } as never), null);
});

/* ── 从渲染后的 DOM 补采:让「滚动加载」真的有用 ── */

test("DOM 里的评论抠得出来,字段与 JSON 一致", () => {
  const rs = reviewsFromDom(doc());
  assert.equal(rs.length, 3, "夹具里渲染了 3 条");
  const r = rs[0]!;
  assert.equal(r.rating, 5, "星级取自 aria-label(Rating: N out of 5),不用数星星图标");
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(r.variant.length > 3, "规格没抠到");
  assert.equal(r.verified, true);
  assert.ok(r.text.length > 20);
});

test("认日期不能用 \\b —— 整块文本里日期紧贴着字母", () => {
  /*
   * 真机上「重新采集本页评论」永远只有 3 条,根因就是这一个字符。
   * 评论块的 textContent 是各子节点直接拼起来的,中间没有空白:
   *   "商品:LARGE SIZE 5.3 OZ EDGE CONTROL2025-12-02"
   * `L` 和 `2` 都是词字符 —— 中间没有词边界,`\b\d{4}` 恒不匹配。
   * 于是「往上找含日期的祖先」一个都找不到,reviewsFromDom 静默返回 0,
   * 合并逻辑退回 SSR 那恒定 3 条,用户滚多少页都一样。
   *
   * 单独钉住这条,是因为手搓的 DOM 夹具里节点之间往往有空白,`\b` 恰好成立 ——
   * 只有真实页面能暴露它。
   */
  const joined = "商品:LARGE SIZE 5.3 OZ EDGE CONTROL2025-12-02";
  assert.equal(/\b\d{4}-\d{2}-\d{2}\b/.test(joined), false, "这就是当初写错的那个正则");
  assert.equal(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/.test(joined), true);

  // 而真实夹具里,评论块的文本确实是这样拼出来的
  const blocks = Array.from(doc().querySelectorAll("#pdp-review-section div.flex.flex-col.gap-12"));
  const txt = blocks.map((b) => (b.textContent || "").replace(/\s+/g, " ")).join("\n");
  assert.ok(/[A-Za-z一-龥]\d{4}-\d{2}-\d{2}/.test(txt),
    "夹具里日期不再紧贴文字了 —— 若页面结构真变了,这条测试可以放宽");
});

test("评分直方图那一块不能被当成评论", () => {
  // #pdp-review-section 里第一个 gap-12 块是直方图(纯数字),
  // 按下标跳过的话布局一变就错;按「有没有星级 aria-label」认才稳。
  const rs = reviewsFromDom(doc());
  assert.ok(!rs.some((r) => /^\d+$/.test(r.text.replace(/\s/g, ""))),
    "把评分直方图当成了一条评论");
});

test("SSR 只有 3 条,DOM 多出来的要合并进去", () => {
  /**
   * 这是「滚动加载」能不能生效的关键:
   * SSR 的 __MODERN_ROUTER_DATA__ 恒定 3 条 —— 用户滚出来的评论进的是 React 状态,
   * **永远不会回写那个 script**。只读 JSON 的话,滚了也白滚。
   */
  const cap = captureTikTokReviews(doc(), URL_STR)!;
  assert.ok(cap.reviews.length >= 3);
  // 夹具没滚动过,所以 DOM 与 JSON 都是 3 条,合并后仍是 3(不能变成 6)
  assert.equal(cap.reviews.length, 3, "同样的评论被算了两遍 —— 去重没生效");
});

test("翻页后要交回眼前这一页,不能退回 SSR 那几条", () => {
  /*
   * 真机上「翻到第 6 页再采」永远还是最初那 3 条,根因是合并的判据写成了
   *   if (domReviews.length > reviews.length)
   * 它假设「DOM 是滚出来的,条数一定更多」。实测不是:TikTok 评论列表**分页**,
   * 每页恰好 3 条(13122 条 / 4374 页 = 3.0),SSR 的 JSON 也恰好 3 条 ——
   * 3 > 3 为 false,于是交回 SSR 那批。而 SSR 是静态的,翻到第 4374 页也不变。
   * 症状是「本页没有新评论(都采过了)」:确实全是重复,重复的是同一批 SSR。
   *
   * 这里把渲染出来的正文改掉、JSON 原封不动,模拟「用户翻到了别的页」。
   * 条数刻意保持 3 比 3 —— 只有这样才踩得中那个门槛。
   */
  const d = doc();
  const shown = reviewsFromDom(d);
  assert.equal(shown.length, 3, "夹具前提变了");
  for (const [i, r] of shown.entries()) {
    const node = Array.from(d.querySelectorAll("*")).find(
      (e) => e.children.length === 0 && (e.textContent || "").trim() === r.text);
    assert.ok(node, "找不到正文节点");
    node.textContent = `第六页第 ${i + 1} 条 —— 与 SSR 那批完全不同的评论正文`;
  }

  const cap = captureTikTokReviews(d, URL_STR)!;
  assert.equal(cap.reviews.length, 3);
  assert.ok(cap.reviews.every((r) => r.text.startsWith("第六页第")),
    "交回的是 SSR 那三条,不是用户眼前这一页 —— 翻多少页都一样");
});

test("没有评论区时不报错,退回 JSON 那几条", () => {
  const noSec = parseHTML("<html><body><div id='x'></div></body></html>").document as unknown as Document;
  assert.deepEqual(reviewsFromDom(noSec), []);
});

test("DOM 抠的评论要有去重键 —— 评论是分页的,翻一页采一次", () => {
  /**
   * TikTok 的评论在详情页里**分页**(实测某商品 4374 页,每页约 10 条),
   * 不是滚动加载。采法与亚马逊评论列表页一样:翻一页采一次,篮子累积。
   * 而 DOM 抠出来的条目没有 review_id(页面不暴露)——
   * 没有去重键的话,同一页采两次就会重复累积。
   */
  const rs = reviewsFromDom(doc());
  assert.ok(rs.every((r) => r.id), "有条目没有 id,跨页累积时无法去重");
  assert.equal(new Set(rs.map((r) => r.id)).size, rs.length, "同一页内 id 撞了");
  // id 必须由正文决定 —— 按顺序编号的话,翻页顺序一变就认不出是同一条
  const again = reviewsFromDom(doc());
  assert.deepEqual(again.map((r) => r.id), rs.map((r) => r.id), "两次抠出的 id 不一致");
});

test("评论区判断必须按平台走,不能用亚马逊那套", async () => {
  // 真机症状:翻到评论第 3 页后 popup 只剩「采集本页商品」,
  // 「重新采集本页评论」压根不出现 —— 因为 popup 用的是 matchesReviews(亚马逊专属)。
  const src = readFileSync(new URL("../src/popup/popup.ts", import.meta.url), "utf8");
  assert.match(src, /hasReviewsFor\(tabUrl\)/,
    "popup 又用回亚马逊专属的 matchesReviews —— TikTok 上评论区永远不渲染,且不报错");
  assert.doesNotMatch(src, /if \(matchesReviews\(new URL\(tabUrl\)\)\)/);
});

/* ── 第二份真实页面:另一个商品、评论翻到第 3 页时保存 ── */

const doc2 = () => parseHTML(readFileSync(join(here, "fixtures/tiktok-us-reviews-p3.html"), "utf8"))
  .document as unknown as Document;
const URL2 = "https://shop.tiktok.com/us/pdp/threadmill-cotton-sheet-set/1729000000000000001";

test("换一个商品页照样采得到,且全量分布是百分比", () => {
  const cap = captureTikTokReviews(doc2(), URL2)!;
  assert.ok(cap, "第二份真实页面没认出来");
  assert.ok(cap.reviews.length >= 1, "一条评论都没采到");

  const hist = cap.provenance.ratingHistogram!;
  assert.ok(hist, "全量星级分布没拿到 —— 那是我们唯一的全量锚点");
  const sum = Object.values(hist).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) < 0.6,
    `分布应当是百分比、合计约 100,实际 ${sum} —— 平台给的是条数,漏了换算就是单位不符的错值`);
  for (const k of ["1", "2", "3", "4", "5"]) {
    assert.ok(k in hist, `缺 ${k} 星那一档 —— 缺档会让下游把它当 0% 而不是"没数据"`);
  }
});

test("认得出当前在评论第几页 —— 靠结构,不靠类名", () => {
  /*
   * 这份夹具是**评论翻到第 3 页**时保存的,所以期望 list / 第 3 页。
   *
   * 第一版按 `aria-current="page"` 认,错了:那是分页组件的 ARIA 标准写法,
   * 而 TikTok 把这个属性用在了**一个商品标题**上 —— 猜通用契约就是会这样,
   * 而且失败方式是静默退回 featured,不报错。
   *
   * 真实结构里当前页只靠**多出来的两个 class**(反白高亮)区分。
   * 但判据不写类名:一排连续页码里「class 与其它兄弟不同的那一个」就是当前页。
   * 下面这条断言保证判据没有退化成硬编码。
   */
  const cap = captureTikTokReviews(doc2(), URL2)!;
  assert.equal(cap.provenance.sampleType, "list");
  assert.equal(cap.provenance.pageNumber, 3);

  const src = readFileSync(join(here, "../src/adapters/tiktok-reviews.ts"), "utf8");
  const fn = src.slice(src.indexOf("function pageInfo("));
  for (const token of ["background-color-UIText1", "text-color-UISheetFlat1", "aria-current"]) {
    assert.ok(!fn.slice(0, fn.indexOf("\n}")).includes(`"${token}"`),
      `pageInfo 写死了 ${token} —— 改版即失效,而且是静默失效`);
  }
});

test("没有分页条时不许自称第几页 —— 认不出就退回 featured", () => {
  /*
   * featured 现在的定位变了:它不再表示「平台精选」(TikTok 没这回事),
   * 而是**「我看不出你在第几页」**的兜底。
   * 认不出还硬报一个页码,就是自信的错值;退回来至少下游知道口径不确定。
   */
  const raw = readFileSync(join(here, "fixtures/tiktok-us-reviews-p3.html"), "utf8");
  // 把分页条整段拆掉,模拟「评论区没展开 / 只有一页」的页面
  const noBar = raw.replace(/<div class="flex gap-6">[\s\S]{0,900}?7<\/div><\/div>/, "<div></div>");
  assert.notEqual(noBar, raw, "没拆掉分页条 —— 这条测试等于没跑");

  const prov = captureTikTokReviews(
    parseHTML(noBar).document as unknown as Document, URL2)!.provenance;
  assert.equal(prov.sampleType, "featured");
  assert.equal(prov.pageNumber, 1);
});

test("页码判据的三种退化,都必须往保守方向走", () => {
  /*
   * 判据是「一排连续页码里 class 与众不同的那一个」。三种情况各验一次:
   * 换类名要照样认得(否则 TikTok 一改版就静默失效),
   * 认不出、说不清都要退回 featured —— 宁可低估自己的样本,不可高估。
   */
  const raw = readFileSync(join(here, "fixtures/tiktok-us-reviews-p3.html"), "utf8");
  const cap = (html: string) => captureTikTokReviews(
    parseHTML(html).document as unknown as Document, URL2)!.provenance;

  const HIGHLIGHT = "background-color-UIText1 text-color-UISheetFlat1";

  const renamed = cap(raw.split(HIGHLIGHT).join("zz9-whatever-token"));
  assert.equal(renamed.sampleType, "list", "类名一换就认不出 —— 判据退化成硬编码了");
  assert.equal(renamed.pageNumber, 3);

  const flat = cap(raw.split(" " + HIGHLIGHT).join(""));
  assert.equal(flat.sampleType, "featured", "七个页码长得一样却还敢说当前页 —— 那是猜的");

  const two = cap(raw.replace(/(rounded-8 cursor-pointer)">4</, `$1 ${HIGHLIGHT}">4<`));
  assert.equal(two.sampleType, "featured", "两个页码同时高亮时必须认输,不能挑一个");
});

test("适配器版本号必须随解析改动递增", () => {
  // 档案里存着它:某天样本的溯源对不上时,靠它定位是哪一版产的
  assert.equal(TIKTOK_REVIEWS_VERSION, "tiktok-reviews@2", "解析逻辑变了就要升版本号");
});


test("长分页条带省略号 —— 夹具没有,线上到处都是", () => {
  /*
   * **这条是线上实测打回来的。**
   *
   * 第一版判据要求「分页条里每一个子节点都是连续整数」。夹具那个商品只有 7 页
   * (1 2 3 4 5 6 7),恰好满足,于是本地全绿。而真实的长列表是
   *     上一步  1  2  3  4  5  …  2509  下一步
   * 省略号既不是数字、页码也不连续 —— 判据当场失败,静默退回 featured。
   * 线上实测:某商品 7527 条评论 / 3 条每页 ≈ 2509 页,用户翻了 7 页采回 21 条,
   * 溯源仍写着「详情页内联的少量评论」。
   *
   * 教训不在判据本身,在**夹具不具代表性**:它只有 7 页,是分页里最简单的那种。
   * 所以这里手工合成一个带省略号的长分页条,补上夹具覆盖不到的形态。
   */
  const raw = readFileSync(join(here, "fixtures/tiktok-us-reviews-p3.html"), "utf8");
  const HL = "background-color-UIText1 text-color-UISheetFlat1";
  const CELL = "flex justify-center items-center w-32 h-32 Headline-Semibold rounded-8 cursor-pointer";
  const longBar = '<div class="flex gap-6">'
    + [1, 2, 3].map((n) => `<div class="${CELL}">${n}</div>`).join("")
    + `<div class="${CELL} ${HL}">4</div>`
    + `<div class="${CELL}">5</div>`
    + '<div class="flex justify-center items-center w-32 h-32">…</div>'
    + `<div class="${CELL}">2509</div>`
    + "</div>";
  const swapped = raw.replace(/<div class="flex gap-6">[\s\S]{0,900}?7<\/div><\/div>/, longBar);
  assert.notEqual(swapped, raw, "没换成长分页条 —— 这条测试等于没跑");

  const prov = captureTikTokReviews(
    parseHTML(swapped).document as unknown as Document, URL2)!.provenance;
  assert.equal(prov.sampleType, "list", "带省略号的分页条认不出来 —— 线上绝大多数商品都是这种");
  assert.equal(prov.pageNumber, 4);
});
