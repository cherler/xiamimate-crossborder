import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseCsv, parseReturnCsv, parseReviewCsv, aggregateThemes, overallAvgRating, profileSample,
  detectSampleIssues, detectThemeIssues, compareThemes, detectComparabilityIssues,
  mapSuggestions, SURFACE_LABEL,
  type Review, type ThemeAssignment, type ThemeStat, type SampleProfile, type ChangeSuggestion,
} from "../lib/crossborder/review-insight.ts";

const review = (over: Partial<Review> & { id: string }): Review =>
  ({ rating: 5, date: "2026-06-01", variant: "", text: "good", ...over });

/* ---------------- CSV ---------------- */

// 评论正文里逗号和换行都很常见，解析器错一点就整表错位。
test("parseCsv · 引号内的逗号与换行不当分隔符", () => {
  const rows = parseCsv('a,b\n"含,逗号","含\n换行"\n');
  assert.deepEqual(rows, [["a", "b"], ["含,逗号", "含\n换行"]]);
});

test("parseCsv · 转义的双引号", () => {
  assert.deepEqual(parseCsv('a\n"他说""好用"""'), [["a"], ['他说"好用"']]);
});

test("parseCsv · 跳过纯空行，兼容 CRLF", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n\r\n3,4"), [["a", "b"], ["1", "2"], ["3", "4"]]);
});

test("parseReviewCsv · 识别常见列名并归一化", () => {
  const r = parseReviewCsv(`Rating,Review Date,Style,Body
5,2026-06-01,Black,"Great bottle, keeps cold"
2,2026-06-05,Small,"Too small for A4"`);
  assert.equal(r.missingText, false);
  assert.equal(r.reviews.length, 2);
  assert.deepEqual(r.reviews[0], { id: "r1", rating: 5, date: "2026-06-01", variant: "Black", text: "Great bottle, keeps cold" });
  assert.equal(r.reviews[1].variant, "Small");
  assert.equal(r.columns.text, "Body");
});

// 认不出正文列就说认不出，不能拿第一列凑数 —— 那会把评分当评论去分析。
test("parseReviewCsv · 认不出正文列时明说，不拿别的列凑", () => {
  const r = parseReviewCsv("foo,bar\n1,2");
  assert.equal(r.missingText, true);
  assert.equal(r.reviews.length, 0);
});

test("parseReviewCsv · 非法评分归 0 而不是当成真分数", () => {
  const r = parseReviewCsv("rating,body\n99,x\nabc,y\n4,z");
  assert.deepEqual(r.reviews.map((x) => x.rating), [0, 0, 4]);
});

test("parseReviewCsv · 跳过空正文的行", () => {
  const r = parseReviewCsv('rating,body\n5,"有内容"\n4,""\n3,"   "');
  assert.equal(r.reviews.length, 1);
});

/* ---------------- 聚合：数字必须算自样本 ---------------- */

const reviews: Review[] = [
  review({ id: "r1", rating: 2, variant: "Small", text: "too small" }),
  review({ id: "r2", rating: 1, variant: "Small", text: "way smaller than expected" }),
  review({ id: "r3", rating: 5, variant: "Large", text: "perfect" }),
  review({ id: "r4", rating: 5, variant: "Large", text: "love it" }),
];
const assignments: ThemeAssignment[] = [
  { reviewId: "r1", theme: "尺寸比预期小", sentiment: "negative", quote: "too small" },
  { reviewId: "r2", theme: "尺寸比预期小", sentiment: "negative", quote: "way smaller than expected" },
  { reviewId: "r3", theme: "保温效果好", sentiment: "positive", quote: "perfect" },
  { reviewId: "r4", theme: "保温效果好", sentiment: "positive", quote: "love it" },
];

test("aggregateThemes · 频次 / 占比 / 评分影响都算自实际样本", () => {
  assert.equal(overallAvgRating(reviews), 3.3); // (2+1+5+5)/4
  const [neg] = aggregateThemes(reviews, assignments);
  assert.equal(neg.theme, "尺寸比预期小");
  assert.equal(neg.count, 2);
  assert.equal(neg.share, 50);
  assert.equal(neg.avgRating, 1.5);
  assert.equal(neg.ratingDelta, -1.8); // 1.5 − 3.3
  assert.deepEqual(neg.variants, ["Small"]);
  assert.equal(neg.evidence.length, 2);
});

test("aggregateThemes · 负面优先，且按拖累评分的程度排序", () => {
  const stats = aggregateThemes(reviews, assignments);
  assert.equal(stats[0].sentiment, "negative");
  assert.equal(stats[1].sentiment, "positive");
});

// 模型编一个不存在的 reviewId，统计里就会混进幽灵评论。
test("aggregateThemes · 丢弃指向不存在评论的标签", () => {
  const stats = aggregateThemes(reviews, [
    ...assignments,
    { reviewId: "ghost", theme: "编的主题", sentiment: "negative", quote: "编的" },
  ]);
  assert.equal(stats.find((s) => s.theme === "编的主题"), undefined);
});

test("aggregateThemes · 同一主题同一条评论只算一次", () => {
  const stats = aggregateThemes(reviews, [
    assignments[0],
    { ...assignments[0], quote: "重复标注" },
  ]);
  assert.equal(stats[0].count, 1);
  assert.equal(stats[0].share, 25);
});

test("aggregateThemes · 无评分的评论不参与平均分", () => {
  const rs = [review({ id: "a", rating: 0, text: "x" }), review({ id: "b", rating: 4, text: "y" })];
  const stats = aggregateThemes(rs, [
    { reviewId: "a", theme: "T", sentiment: "negative", quote: "x" },
    { reviewId: "b", theme: "T", sentiment: "negative", quote: "y" },
  ]);
  assert.equal(stats[0].count, 2);
  assert.equal(stats[0].avgRating, 4); // 只有 b 有分
});

test("aggregateThemes · 证据缺 quote 时用评论原文兜底", () => {
  const stats = aggregateThemes(reviews, [{ reviewId: "r1", theme: "T", sentiment: "negative", quote: "" }]);
  assert.equal(stats[0].evidence[0].quote, "too small");
});

/* ---------------- 样本体检 ---------------- */

test("profileSample · 汇总样本量、时间跨度与变体", () => {
  const p = profileSample([
    review({ id: "a", date: "2026-05-01", variant: "Small" }),
    review({ id: "b", date: "2026-06-10", variant: "Large" }),
    review({ id: "c", date: "2026-04-02", variant: "Small", rating: 0 }),
  ]);
  assert.equal(p.total, 3);
  assert.equal(p.rated, 2);
  assert.equal(p.dateFrom, "2026-04-02");
  assert.equal(p.dateTo, "2026-06-10");
  assert.deepEqual(p.variants.sort(), ["Large", "Small"]);
});

// 30 条里的 18% 和 3000 条里的 18% 不是一回事，必须先说清楚再谈结论。
test("detectSampleIssues · 小样本要明确警告不足以支撑决策", () => {
  const w = detectSampleIssues(profileSample(reviews));
  const small = w.find((x) => x.id === "small-sample");
  assert.ok(small);
  assert.equal(small.level, "warn");
  assert.match(small.text, /不足以支撑/);
});

test("detectSampleIssues · 大样本不再报小样本警告", () => {
  const many = Array.from({ length: 50 }, (_, i) => review({ id: `r${i}`, variant: "A", date: "2026-06-01" }));
  assert.equal(detectSampleIssues(profileSample(many)).find((x) => x.id === "small-sample"), undefined);
});

// 永远要说清结论只覆盖上传的样本 —— 导出时的筛选条件直接决定结论。
test("detectSampleIssues · 永远声明只覆盖上传样本", () => {
  const w = detectSampleIssues(profileSample(reviews));
  const only = w.find((x) => x.id === "sample-only");
  assert.ok(only);
  assert.match(only.text, /不代表全部买家/);
  assert.match(only.text, /筛选条件/);
});

test("detectSampleIssues · 缺变体 / 缺日期各自如实提示", () => {
  const ids = detectSampleIssues(profileSample([review({ id: "a", variant: "", date: "" })])).map((w) => w.id);
  assert.ok(ids.includes("no-variant"));
  assert.ok(ids.includes("no-date"));
});

test("detectSampleIssues · 空样本只说没数据", () => {
  assert.deepEqual(detectSampleIssues(profileSample([])).map((w) => w.id), ["empty"]);
});


/* ---------------- 归类质量 ---------------- */

const stat = (theme: string, count: number): ThemeStat =>
  ({ theme, sentiment: "negative", count, share: 0, avgRating: 0, ratingDelta: 0, variants: [], evidence: [] });

// 7 条评论归出 8 个主题 —— 实测就是这样，同义主题被拆开了，此时占比毫无意义。
test("detectThemeIssues · 几乎一条一个主题 → 警告占比不可信", () => {
  const stats = Array.from({ length: 8 }, (_, i) => stat(`主题${i}`, 1));
  const w = detectThemeIssues(stats, 7);
  assert.equal(w[0].id, "fragmented");
  assert.equal(w[0].level, "warn");
  assert.match(w[0].text, /占比不可信/);
});

test("detectThemeIssues · 多数主题只出现一次 → 提示可能是同义拆分", () => {
  const stats = [stat("A", 20), stat("B", 1), stat("C", 1), stat("D", 1), stat("E", 1)];
  const w = detectThemeIssues(stats, 100);
  assert.equal(w[0].id, "singletons");
  assert.equal(w[0].level, "info");
});

test("detectThemeIssues · 归类正常时不报噪音", () => {
  assert.deepEqual(detectThemeIssues([stat("A", 40), stat("B", 30), stat("C", 20)], 100), []);
  assert.deepEqual(detectThemeIssues([], 100), []);
});

/* ---------------- 竞品对比 ---------------- */

const s = (theme: string, sentiment: "negative" | "positive", count: number, share: number, avgRating = 3): ThemeStat =>
  ({ theme, sentiment, count, share, avgRating, ratingDelta: 0, variants: [], evidence: [] });

test("compareThemes · 分出我方独有 / 共有 / 对方独有", () => {
  const c = compareThemes(
    [s("尺寸比预期小", "negative", 5, 25), s("盖子漏水", "negative", 3, 15)],
    [s("盖子漏水", "negative", 8, 8), s("涂层掉漆", "negative", 6, 6)],
  );
  const by = (t: string) => c.find((x) => x.theme === t)!;
  assert.equal(by("尺寸比预期小").verdict, "mine_only");
  assert.equal(by("盖子漏水").verdict, "shared");
  assert.equal(by("涂层掉漆").verdict, "theirs_only");
});

test("compareThemes · 两边都有才算占比差", () => {
  const c = compareThemes([s("盖子漏水", "negative", 3, 15)], [s("盖子漏水", "negative", 8, 8)]);
  assert.equal(c[0].shareDelta, 7); // 15 − 8
  assert.equal(compareThemes([s("独有", "negative", 1, 5)], [])[0].shareDelta, null);
});

// 我们独有的问题最该先看 —— 那是真该改的；他们独有的才是可打的差异。
test("compareThemes · 我方独有排最前，对方独有排最后", () => {
  const c = compareThemes(
    [s("我方问题", "negative", 1, 5), s("共有问题", "negative", 9, 45)],
    [s("共有问题", "negative", 9, 45), s("对方问题", "negative", 9, 45)],
  ).filter((x) => x.sentiment === "negative");
  assert.deepEqual(c.map((x) => x.verdict), ["mine_only", "shared", "theirs_only"]);
});

test("compareThemes · 缺一边时另一边为 null", () => {
  const c = compareThemes([s("只有我方", "negative", 2, 10)], []);
  assert.equal(c[0].theirs, null);
  assert.deepEqual(c[0].mine, { count: 2, share: 10, avgRating: 3 });
});

/* ---------------- 可比性：最容易得出错误结论的地方 ---------------- */

const prof = (total: number, from = "2026-01-01", to = "2026-06-01"): SampleProfile =>
  ({ total, rated: total, avgRating: 4, variants: [], dateFrom: from, dateTo: to });

// 30 条对 500 条：小样本里一条评论就是 3.3%，对面一条只有 0.2%。
test("detectComparabilityIssues · 样本量差 3 倍以上就不能比占比", () => {
  const w = detectComparabilityIssues(prof(30), prof(500));
  const m = w.find((x) => x.id === "size-mismatch");
  assert.ok(m);
  assert.equal(m.level, "warn");
  assert.match(m.text, /不能直接比/);
});

test("detectComparabilityIssues · 样本量接近时不报", () => {
  assert.equal(detectComparabilityIssues(prof(100), prof(120)).find((x) => x.id === "size-mismatch"), undefined);
});

test("detectComparabilityIssues · 时间段不重叠 = 在比两个不同时期的产品", () => {
  const w = detectComparabilityIssues(prof(100, "2026-01-01", "2026-03-01"), prof(100, "2026-05-01", "2026-06-01"));
  const m = w.find((x) => x.id === "period-mismatch");
  assert.ok(m);
  assert.match(m.text, /不同时期/);
});

test("detectComparabilityIssues · 时间重叠时不报", () => {
  const w = detectComparabilityIssues(prof(100, "2026-01-01", "2026-06-01"), prof(100, "2026-03-01", "2026-08-01"));
  assert.equal(w.find((x) => x.id === "period-mismatch"), undefined);
});

test("detectComparabilityIssues · 永远声明差异未必来自产品本身", () => {
  const w = detectComparabilityIssues(prof(100), prof(100));
  const c = w.find((x) => x.id === "compare-caveat");
  assert.ok(c);
  assert.match(c.text, /未必来自产品本身/);
});

test("detectComparabilityIssues · 有一边为空就不谈可比性", () => {
  assert.deepEqual(detectComparabilityIssues(prof(0), prof(100)), []);
});

/* ---------------- 洞察映射 ---------------- */

const themes3: ThemeStat[] = [
  s("尺寸比预期小", "negative", 5, 25, 1.5),
  s("盖子漏水", "negative", 3, 15, 2),
];

const sug = (over: Partial<ChangeSuggestion> = {}): ChangeSuggestion => ({
  surface: "image", theme: "尺寸比预期小", action: "主图加比例参照", rationale: "买家看不出实际大小", ...over,
});

test("mapSuggestions · 数字取自聚合结果，不采信模型复述", () => {
  const { mapped } = mapSuggestions([sug()], themes3, []);
  assert.equal(mapped[0].count, 5);
  assert.equal(mapped[0].share, 25);
  assert.equal(mapped[0].ratingDelta, themes3[0].ratingDelta);
});

// 针对一个不存在主题的建议，是模型自己想出来的问题，不在数据里。
test("mapSuggestions · 丢弃针对编造主题的建议并说明", () => {
  const { mapped, issues } = mapSuggestions([sug(), sug({ theme: "模型编的问题" })], themes3, []);
  assert.equal(mapped.length, 1);
  const i = issues.find((x) => x.id === "invented-theme");
  assert.ok(i);
  assert.match(i.text, /不在你的样本里/);
});

// 「五点里写明尺寸」——但尺寸还没确认，照着写就是瞎写。
test("mapSuggestions · 建议依赖未确认事实时标出来", () => {
  const { mapped, issues } = mapSuggestions(
    [sug({ surface: "bullets", action: "五点第一条写明商品尺寸与可容纳物品" })],
    themes3,
    ["商品尺寸", "质保"],
  );
  assert.deepEqual(mapped[0].needsFacts, ["商品尺寸"]);
  const i = issues.find((x) => x.id === "needs-facts");
  assert.ok(i);
  assert.match(i.text, /商品尺寸/);
  assert.match(i.text, /先在事实库里确认/);
});

test("mapSuggestions · 不依赖未确认事实的建议不误报", () => {
  const { mapped, issues } = mapSuggestions([sug()], themes3, ["质保", "认证"]);
  assert.deepEqual(mapped[0].needsFacts, []);
  assert.equal(issues.find((x) => x.id === "needs-facts"), undefined);
});

test("mapSuggestions · 按占比与评分影响排优先级", () => {
  const { mapped } = mapSuggestions(
    [sug({ theme: "盖子漏水" }), sug({ theme: "尺寸比预期小" })],
    themes3, [],
  );
  assert.deepEqual(mapped.map((m) => m.theme), ["尺寸比预期小", "盖子漏水"]);
});

test("SURFACE_LABEL · 五个面都有中文标签", () => {
  for (const k of ["product", "image", "title", "bullets", "service"] as const) {
    assert.ok(SURFACE_LABEL[k], `${k} 缺标签`);
  }
});

// ── 退货 CSV(P2)──

test("parseReturnCsv:中英列名、qty 缺失按 1、原因必需", () => {
  const csv = [
    "日期,变体,退货原因,数量",
    "2026-06-01,Green,尺寸偏小,2",
    "2026-06-03,Gray,quality issue,",
    ",,,",                              // 空原因行跳过
    "2026-06-05,Red,尺寸偏小,3",
  ].join("\n");
  const r = parseReturnCsv(csv);
  assert.equal(r.missingReason, false);
  assert.equal(r.returns.length, 3);
  assert.deepEqual(r.returns[0], { id: "t1", date: "2026-06-01", variant: "Green", reason: "尺寸偏小", qty: 2 });
  assert.equal(r.returns[1].qty, 1);                       // 缺数量按 1 件
  assert.equal(r.columns.reason, "退货原因");
});

test("parseReturnCsv:认不出原因列 → missingReason,不拿别的列凑数", () => {
  const r = parseReturnCsv("date,sku\n2026-01-01,A1");
  assert.equal(r.missingReason, true);
  assert.equal(r.returns.length, 0);
});

test("parseReturnCsv:引号内逗号与换行", () => {
  const r = parseReturnCsv('reason,qty\n"broke, cracked on arrival",5');
  assert.equal(r.returns[0].reason, "broke, cracked on arrival");
  assert.equal(r.returns[0].qty, 5);
});
