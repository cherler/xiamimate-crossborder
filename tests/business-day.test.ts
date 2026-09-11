/**
 * 前端的「今天」必须钉在产品时区上 —— 每日领积分的跨天探测靠它。
 *
 * 原来用的是 `new Date().toLocaleDateString("en-CA")`(浏览器本地时区),
 * 而服务端是按 Asia/Shanghai 发的。海外卖家因此会看到「页面开着一整天,
 * 积分没到账」:悉尼差 21 小时,欧洲差 7 小时。
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PRODUCT_TZ, productDay } from "../lib/business-day";

/** 把某个时区的墙钟时间换算成真实时刻,用来模拟「用户在当地看到的是几点」。 */
function atProductTime(y: number, m: number, d: number, hh: number, mm = 0): Date {
  // 先按 UTC 造,再用产品时区偏移回推(Asia/Shanghai 无夏令时,固定 +8)
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm));
}

test("产品时区与后端一致", () => {
  assert.equal(PRODUCT_TZ, "Asia/Shanghai");
});

test("北京 00:30 已经算新的一天 —— 而 UTC 那时还是昨天", () => {
  const t = atProductTime(2026, 8, 2, 0, 30);
  assert.equal(productDay(t), "2026-08-02");
  assert.equal(t.toISOString().slice(0, 10), "2026-08-01",
    "构造的样例没落在两个时区分歧的那 8 小时里,这条测试就测不到东西");
});

test("北京 23:30 还是当天", () => {
  assert.equal(productDay(atProductTime(2026, 8, 1, 23, 30)), "2026-08-01");
});

test("同一时刻在任何浏览器时区下都得到同一个「今天」", () => {
  // 这是整条修复的要点:结果只由时刻决定,不由运行环境决定。
  // 悉尼(+11)本地已是 8/2 的那一刻,产品时区还在 8/1 —— 不能因为用户在悉尼就提前翻篇。
  const t = atProductTime(2026, 8, 1, 21, 30);   // 悉尼当地 8/2 00:30
  assert.equal(productDay(t), "2026-08-01",
    "悉尼用户的本地午夜把「今天」提前翻了篇 —— 之后 21 小时都探不到服务端真正的跨天");
});

test("跨天判定:服务端翻篇的那一刻,前端也必须翻篇", () => {
  const before = productDay(atProductTime(2026, 8, 1, 23, 59));
  const after = productDay(atProductTime(2026, 8, 2, 0, 1));
  assert.notEqual(before, after, "北京零点前后拿到同一个日期,跨天探测永远不会触发");
});
