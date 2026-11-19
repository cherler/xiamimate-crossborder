/**
 * 本地分析。
 *
 * 这里唯一的纪律是:**认不出来就闭嘴**。分析要给出的是判断,而一个看起来
 * 精确的错判断(把 2023 年的老品说成新品)比不给判断更容易让人做错决定。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyze, bsrRank, monthsSince } from "../src/lib/analyze";
import { type Capture } from "../src/adapters/index";

const NOW = new Date("2026-07-29T00:00:00Z");

function cap(fields: Capture["fields"], missingFields: string[] = []): Capture {
  return {
    platform: "amazon", marketplace: "amazon-us", externalId: "B0TEST0001",
    sourceUrl: "https://www.amazon.com/dp/B0TEST0001", adapterVersion: "amazon@1",
    fields, missingFields,
  };
}

const textOf = (c: Capture) => analyze(c, NOW).map((n) => n.text).join(" | ");

test("上架日期:多种写法都要认出来", () => {
  assert.equal(monthsSince("March 3, 2024", NOW), 28);
  assert.equal(monthsSince("2024/3/3", NOW), 28);
  assert.equal(monthsSince("15. Januar 2023", NOW), 42);
  assert.equal(monthsSince("2023年1月15日", NOW), 42);
});

test("上架日期:认不出来返回 null,不瞎猜", () => {
  assert.equal(monthsSince("不知道什么时候", NOW), null);
  assert.equal(monthsSince(undefined, NOW), null);
  assert.equal(monthsSince("", NOW), null);
  // 未来日期是解析错了,不能当成「刚上架 0 个月」
  assert.equal(monthsSince("March 3, 2099", NOW), null);
});

test("大类排名:两种千分位写法", () => {
  assert.equal(bsrRank("#1,247 in Home & Kitchen"), 1247);
  assert.equal(bsrRank("Nr. 3.412 in Küche"), 3412);
  assert.equal(bsrRank(undefined), null);
  assert.equal(bsrRank("暂无排名"), null);
});

test("口碑体量:只说事实,不说「对你是机会还是麻烦」", () => {
  assert.match(textOf(cap({ reviewCount: 12 })), /体量还小/);
  assert.match(textOf(cap({ reviewCount: 12483 })), /很难在评价数上被追平/);
});

test("低评分 + 足够样本 = 这个 listing 有问题", () => {
  assert.match(textOf(cap({ rating: 3.8, reviewCount: 900 })), /差评里通常有反复出现的具体问题/);
  // 样本太少时不下这个判断 —— 5 条评价的 3.8 分说明不了任何事
  assert.doesNotMatch(textOf(cap({ rating: 3.8, reviewCount: 6 })), /反复出现/);
});

test("履约方式只陈述事实,不站队", () => {
  // 「对手没上 FBA,有可乘之机」预设了这是竞品。用户完全可能在看自己的 listing。
  assert.match(textOf(cap({ fulfillmentType: "亚马逊自营" })), /买家框通常由亚马逊占据/);
  assert.match(textOf(cap({ fulfillmentType: "FBM" })), /配送时效由卖家自己控制/);
  for (const t of ["亚马逊自营", "FBA", "FBM"]) {
    const notes = analyze(cap({ fulfillmentType: t }), NOW);
    assert.equal(notes[0]!.tone, "info", `履约方式被判了好坏(${t}) —— 谁受益取决于你站在哪一边`);
  }
});

test("色彩表示这个 listing 健不健康,不是「对你是好是坏」", () => {
  // 这是用户实测时点出来的:采集自己的商品时,「评分偏低」被标成绿色的好消息,
  // 是彻头彻尾的错。色彩必须与「商品是谁的」无关。
  const low = analyze(cap({ rating: 3.6, reviewCount: 800 }), NOW)
    .find((n) => /差评里/.test(n.text))!;
  assert.equal(low.tone, "warn", "评分低被标成了好消息 —— 那是站在看竞品的视角");

  const high = analyze(cap({ rating: 4.8, reviewCount: 800 }), NOW)
    .find((n) => /满意度很高/.test(n.text))!;
  assert.equal(high.tone, "good", "评分高被标成了警示 —— 同样是站错了视角");
});

test("不出现预设立场的用词", () => {
  const all = [
    cap({ reviewCount: 12483, rating: 3.5, fulfillmentType: "FBM", bsr: "#38 in X",
          firstAvailable: "March 3, 2024" }),
    cap({ reviewCount: 20, rating: 4.9, fulfillmentType: "亚马逊自营" }),
  ].flatMap((c) => analyze(c, NOW)).map((n) => n.text).join(" | ");

  for (const word of ["对手", "可乘之机", "抢不过", "慎选", "切入", "起量", "骂"]) {
    assert.ok(!all.includes(word),
      `文案里出现了预设「这是竞品」的用词:${word} —— 用户可能在看自己的商品`);
  }
});

test("有字段没抓到必须说出来", () => {
  const t = textOf(cap({ title: "T" }, ["price", "rating"]));
  assert.match(t, /没抓到/);
  assert.match(t, /price、rating/);
  assert.match(t, /导入前请核对/);
});

test("什么都没有时不硬凑结论", () => {
  assert.deepEqual(analyze(cap({}), NOW), []);
});
