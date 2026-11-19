/**
 * 正负条数识别的**准确率实测**。
 *
 * 「准确率怎么样」不该由我口头估计。这里把见过的与可预见的句式列全,
 * 跑一遍给出命中/漏掉的清单 —— 漏掉哪些、为什么漏,写在用例名里。
 *
 * 判据只有一条:识别错(把 A 的数字安到 B 头上、或数字读错)是**不可接受**的;
 * 识别不出(没有百分比、颜色中性)是可接受的降级。
 * 所以下面每条「预期失败」的用例都额外断言:它失败得干净,不产生错数据。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";

import { captureInsights } from "../src/adapters/amazon-insights";

const URL_ = "https://www.amazon.com/dp/B0016HF5GK";

/** 造一个只含目标句子与对应标签的最小页面 */
function probe(sentence: string, chip = "Effectiveness (96)") {
  const { document } = parseHTML(`<html><body>
    <span id="acrCustomerReviewText">94,050 ratings</span>
    <a>${chip}</a>
    <span>${sentence}</span>
    <input type="hidden" id="ASIN" value="B0016HF5GK">
  </body></html>`);
  const got = captureInsights(document as unknown as Document, URL_);
  return got?.topics[0] ?? null;
}

// ---------------- 能认出来的 ----------------

test("实测见过的两种写法:裸写与带引号", () => {
  const bare = probe("96 customers mention effectiveness, 79 positive, 17 negative")!;
  assert.equal(bare.positive, 79);
  assert.equal(bare.negative, 17);

  const quoted = probe('57 customers mention "Effectiveness", 52 positive, 5 negative')!;
  assert.equal(quoted.positive, 52);
  assert.equal(quoted.negative, 5);
});

test("千分位逗号", () => {
  const t = probe("1,204 customers mention effectiveness, 900 positive, 304 negative")!;
  assert.equal(t.positive, 900);
  assert.equal(t.negative, 304);
});

test("单数写法(1 customer mentions)", () => {
  const t = probe("1 customer mentions effectiveness, 1 positive, 0 negative")!;
  assert.equal(t.positive, 1);
  assert.equal(t.negative, 0);
  assert.equal(t.sentiment, "positive");
});

test("大小写与多余空格不影响", () => {
  const t = probe("96  Customers  Mention  effectiveness,  79  positive,  17  negative")!;
  assert.equal(t.negative, 17);
});

// ---------------- 认不出来的:必须失败得干净 ----------------

test("【已知缺口】K 缩写的条数认不出 —— 但不会读成错数", () => {
  // 大商品若把条数写成 4.9K 而不是 4,900,正则不匹配。
  // 关键是它**不会**把 4 或 9 当成条数 —— 宁可没有,不能有错的。
  const t = probe("4.9K customers mention effectiveness, 3.9K positive, 1K negative")!;
  assert.equal(t.positive, undefined, "K 写法被读成了错误的数字");
  assert.equal(t.sentiment, "unknown", "认不出却给了情绪方向");
});

test("【已知缺口】非英文站点认不出 —— 只有美/英站拿得到条数", () => {
  const de = probe("96 Kunden erwähnen Wirksamkeit, 79 positiv, 17 negativ")!;
  assert.equal(de.positive, undefined);
  assert.equal(de.sentiment, "unknown");

  const jp = probe("96人のお客様が効果について言及、79件が好意的、17件が否定的")!;
  assert.equal(jp.positive, undefined);
  assert.equal(jp.sentiment, "unknown");
});

test("【已知缺口】标签名与句中写法不一致时对不上", () => {
  // 标签写「Heat up time」,句子写「heat-up time」—— 键对不上,那一项就没有条数
  const t = probe("24 customers mention heat-up time, 6 positive, 18 negative", "Heat up time (24)")!;
  assert.equal(t.positive, undefined, "对不上却硬安了一份数据");
  assert.equal(t.mentions, 24, "提及量来自标签本身,不受影响");
});

test("句子里的数字绝不会串到别的主题头上", () => {
  const { document } = parseHTML(`<html><body>
    <span id="acrCustomerReviewText">94,050 ratings</span>
    <a>Effectiveness (96)</a>
    <a>Leakage (13)</a>
    <span>96 customers mention effectiveness, 79 positive, 17 negative</span>
    <input type="hidden" id="ASIN" value="B0016HF5GK">
  </body></html>`);
  const topics = captureInsights(document as unknown as Document, URL_)!.topics;
  const leak = topics.find((t) => t.name === "Leakage")!;
  assert.equal(leak.positive, undefined, "Effectiveness 的数字被安到了 Leakage 头上");
  assert.equal(leak.sentiment, "unknown");
});

test("句式被改写就整体失效,但不产生错数", () => {
  for (const s of [
    "96 customers mentioned effectiveness: 79 were positive and 17 negative",
    "Effectiveness: 79 positive mentions, 17 negative mentions",
    "79 positive and 17 negative out of 96 mentions of effectiveness",
  ]) {
    const t = probe(s)!;
    assert.equal(t.positive, undefined, `句式「${s}」被误匹配`);
    assert.equal(t.sentiment, "unknown");
  }
});
