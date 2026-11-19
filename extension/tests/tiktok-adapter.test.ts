/**
 * TikTok Shop 适配器 —— 用真实页面夹具验证。
 *
 * 这份适配器的第一版是**盲写的**(开发时拿不到真实页面:TikTok 对非浏览器客户端
 * 只返回 5.6KB 壳页)。拿到真实页面后一跑,URL 正则、JSON 路径、容器类型三处全错 ——
 * 而错的方式都是「静默返回空」,不是报错。所以这份夹具测试不是锦上添花,
 * 它是这个适配器唯一的真实性来源。
 *
 * 夹具:tests/fixtures/tiktok-us.html(2026-08-02 保存的真实商品页)
 *   商品 1729385107321885580 · $10.99 · 4.5★ · 71548 条评价 · 已售 672572
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

import { tiktokAdapter, tiktokProductId, marketOf, productInfoFromDoc } from "../src/adapters/tiktok";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE_URL = new URL(
  "https://shop.tiktok.com/us/pdp/edge-control-gel-by-bask-and-lather-strong-hold-thick-edges/1729385107321885580?source=ecommerce_mall&enter_method=feed_list");

function doc() {
  const html = readFileSync(join(here, "fixtures/tiktok-us.html"), "utf8");
  return parseHTML(html).document as unknown as Document;
}

/* ── URL 识别 ── */

test("认得真实的商品页 URL 形态", () => {
  // 实测形态是 /us/pdp/<slug>/<id> —— 盲写时猜的 /shop/pdp/ 根本不存在
  assert.equal(tiktokProductId(PAGE_URL), "1729385107321885580");
  assert.equal(marketOf(PAGE_URL), "tiktok-us");
  assert.equal(tiktokAdapter.matches(PAGE_URL), true);
});

test("区域段在路径第一位,不同市场分得开", () => {
  assert.equal(marketOf(new URL("https://shop.tiktok.com/gb/pdp/x/1234567890")), "tiktok-uk");
  assert.equal(marketOf(new URL("https://shop.tiktok.com/id/pdp/x/1234567890")), "tiktok-id");
  assert.equal(marketOf(new URL("https://shop.tiktok.com/th/pdp/x/1234567890")), "tiktok-sea");
});

test("非商品页不认领 —— 认领了却抓不到东西比不认领更糟", () => {
  for (const u of ["https://www.tiktok.com/@someone",
                   "https://shop.tiktok.com/us/category/beauty",
                   "https://www.amazon.com/dp/B0XXXXXXXX"]) {
    assert.equal(tiktokAdapter.matches(new URL(u)), false, `${u} 被错误认领`);
  }
});

/* ── 真实页面提取 ── */

test("真实页面:六个字段全部抠得出来", () => {
  const cap = tiktokAdapter.extract(doc(), PAGE_URL)!;
  assert.ok(cap, "整页没认出来");
  assert.equal(cap.platform, "tiktok");
  assert.equal(cap.marketplace, "tiktok-us");
  assert.equal(cap.externalId, "1729385107321885580");

  const f = cap.fields;
  assert.match(String(f.title), /STRONG HOLD/);
  assert.equal(f.price, 10.99, "价格取的是 sale_price_decimal,不是格式化字符串");
  assert.equal(f.currency, "USD");
  assert.equal(f.rating, 4.5);
  assert.equal(f.reviewCount, 71548, "评价数实测是**字符串** \"71548\",必须转成数字");
  assert.equal(f.sellerName, "Bask and Lather Co");
  assert.match(String(f.mainImage), /^https:\/\//);

  assert.deepEqual(cap.missingFields, [], `还有字段没抠到:${cap.missingFields.join(",")}`);
});

test("已售数量要带回来 —— 亚马逊没有公开销量,这是 TikTok 选品的强信号", () => {
  const cap = tiktokAdapter.extract(doc(), PAGE_URL)!;
  /*
   * 曾经它只能塞进 bulletPoints 当一句中文备注(白名单里没有这个字段),
   * 而商品详情页与待确认列表**都不渲染 bulletPoints** —— 采回来了却没人看得见。
   * 现在是一等字段,断言也跟着从「备注里有这几个字」改成「值对不对」。
   */
  assert.equal(cap.fields.soldCount, 672572,
    "sold_count 没带回来。它实测是字符串 \"672572\"");
  /*
   * 必须是 JSON 里的精确值,不是页面上显示的缩写「672.6K」。
   * 缩写是四舍五入过的,而这个数字的全部价值就在于它是个确切的量级判断依据 ——
   * 若哪天有人改成读页面文本,数字照样显示、照样"看起来对",精度悄悄没了。
   */
  assert.notEqual(cap.fields.soldCount, 672600, "读成了页面上的缩写,不是 JSON 精确值");
});

/* ── 结构变了要说出来,不能静默返回空壳 ── */

test("找不到商品 JSON 时如实上报,而不是交回一堆空字段", () => {
  const empty = parseHTML("<html><body><div>404</div></body></html>").document as unknown as Document;
  const cap = tiktokAdapter.extract(empty, PAGE_URL)!;
  assert.ok(cap, "应当仍返回结构(带 ID 与链接),便于下游知道这次采集是空的");
  assert.deepEqual(cap.fields, {});
  assert.ok(cap.missingFields.includes("__no_product_json__"),
    "页面结构变了却没有任何信号 —— 那就只能等用户发现档案里是空的");
});

test("components_map 是数组:容器类型判断不能把数组排除掉", () => {
  // 盲写版用 isBag(排除数组)当判据,于是整页被跳过、所有字段静默为空。
  // 这条钉住它:真实页面能取到 product_info。
  assert.ok(productInfoFromDoc(doc()), "取不到 product_info —— 容器类型判断又收紧了");
});

test("适配器版本号必须随解析改动递增", () => {
  // 导入记录里存着它:某天档案里出现一批脏数据时,靠它定位是哪一版解析器产的
  assert.match(tiktokAdapter.version, /^tiktok@/);
  assert.equal(tiktokAdapter.version, "tiktok@2", "解析逻辑变了就要升版本号");
});
