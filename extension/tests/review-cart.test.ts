/**
 * 评论采集篮。
 *
 * 核心是**样本量的诚实**:去重不对,样本量就虚高;而样本量直接决定报告里
 * 「这个结论可信吗」的表述。500 条里有 200 条是重复的,报告不会知道。
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

let store: Record<string, unknown> = {};
(globalThis as Record<string, unknown>).chrome = {
  storage: {
    local: {
      async get(k: string) { return { [k]: store[k] }; },
      async set(o: Record<string, unknown>) { Object.assign(store, o); },
      async remove(k: string) { delete store[k]; },
    },
  },
};

const { addToCart, readCart, clearCart, toPayload, MAX_CART_REVIEWS } = await import("../src/lib/review-cart");
type Sample = Parameters<typeof addToCart>[0];

beforeEach(() => { store = {}; });

function review(id: string, over: Record<string, unknown> = {}) {
  return { id, rating: 3, date: "March 3, 2024", variant: "", title: "t",
           text: `正文 ${id}`, verified: true, helpful: 0, ...over };
}

function sample(ids: string[], over: Partial<Sample> = {}, prov: Record<string, unknown> = {}): Sample {
  return {
    platform: "amazon", marketplace: "amazon-us", externalId: "B0016HF5GK",
    adapterVersion: "amazon-reviews@1",
    reviews: ids.map((i) => review(i)),
    provenance: {
      sampleType: "list", pageNumber: 1, starFilter: "", sortBy: "recent",
      reviewerType: "", totalReviews: 94050, capturedAt: "2026-07-29T00:00:00Z",
      sourceUrl: "https://www.amazon.com/product-reviews/B0016HF5GK?pageNumber=1",
      ...prov,
    },
    ...over,
  } as Sample;
}

test("多页累积", async () => {
  await addToCart(sample(["R1", "R2"]));
  const r = await addToCart(sample(["R3", "R4"], {}, {
    pageNumber: 2, sourceUrl: "https://www.amazon.com/product-reviews/B0016HF5GK?pageNumber=2" }));
  assert.equal(r.added, 2);
  assert.equal(r.cart.reviews.length, 4);
  assert.equal(r.cart.pages.length, 2, "两页的溯源都要留 —— 报告要说明这些评论怎么来的");
});

test("跨页重复不计入样本量", async () => {
  await addToCart(sample(["R1", "R2"]));
  const r = await addToCart(sample(["R2", "R3"], {}, {
    pageNumber: 2, sourceUrl: "…page2" }));
  assert.equal(r.added, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.cart.reviews.length, 3, "重复评论让样本量虚高 —— 报告的置信度会跟着虚高");
});

test("同一页重复点采集,溯源不记两遍", async () => {
  await addToCart(sample(["R1"]));
  const r = await addToCart(sample(["R1"]));
  assert.equal(r.cart.pages.length, 1);
  assert.equal(r.added, 0);
});

test("换商品换篮子,并如实告知旧的没了", async () => {
  await addToCart(sample(["R1", "R2"]));
  const r = await addToCart(sample(["R9"], { externalId: "B0OTHER001" }));
  assert.equal(r.switched, true, "没告诉用户旧篮子被清了 —— 他可能刚翻完十页");
  assert.equal(r.cart.externalId, "B0OTHER001");
  assert.equal(r.cart.reviews.length, 1, "两个商品的评论混进了同一份样本");
});

test("掺了详情页精选,整批就不能算全量", async () => {
  await addToCart(sample(["R1"], {}, { sampleType: "list" }));
  await addToCart(sample(["R2"], {}, {
    sampleType: "featured", sourceUrl: "https://www.amazon.com/dp/B0016HF5GK" }));
  const p = toPayload((await readCart())!);
  assert.equal(p.provenance.sampleType, "featured",
    "掺了精选评论却标成 list —— 偏样本伪装成了全样本");
});

test("溯源合账:页码、筛选、排序都不丢", async () => {
  await addToCart(sample(["R1"], {}, { pageNumber: 1, starFilter: "one_star" }));
  await addToCart(sample(["R2"], {}, {
    pageNumber: 2, starFilter: "one_star", sourceUrl: "…p2" }));
  const p = toPayload((await readCart())!);
  assert.deepEqual(p.provenance.pageNumbers, [1, 2]);
  assert.equal(p.provenance.starFilter, "one_star", "只看了一星却没记 —— 报告会当成全样本");
  assert.equal(p.provenance.pageCount, 2);
  assert.equal(p.provenance.totalReviews, 94050);
});

test("清空", async () => {
  await addToCart(sample(["R1"]));
  await clearCart();
  assert.equal(await readCart(), null);
});

test("上限不能双计 —— 一次能填满剩余空间,不是一半", () => {
  // 原来是 `if (length + added >= MAX)`,而 push 已经让 length +1,added 又 +1,
  // 于是单次最多只填掉剩余空间的一半:空篮子塞 600 条只进 250。
  const many = Array.from({ length: 600 }, (_, i) => `R${i}`);
  return addToCart(sample(many)).then((r) => {
    assert.equal(r.cart.reviews.length, MAX_CART_REVIEWS, "单次填不满上限 —— 条件双计了");
    assert.equal(r.added, MAX_CART_REVIEWS);
    assert.equal(r.overflow, 600 - MAX_CART_REVIEWS, "超出的条数没报出来,用户以为都采到了");
  });
});

test("到上限时溢出条数要如实报,不能静默丢弃", async () => {
  await addToCart(sample(Array.from({ length: MAX_CART_REVIEWS }, (_, i) => `R${i}`)));
  const r = await addToCart(sample(["NEW1", "NEW2", "NEW3"], {}, { pageNumber: 2, sourceUrl: "…p2" }));
  assert.equal(r.added, 0);
  assert.equal(r.overflow, 3, "满了之后新来的 3 条被静默丢弃");
});
