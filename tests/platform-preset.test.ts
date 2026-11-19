/**
 * 平台预设 —— 同一套引擎,换一套说法和默认值。
 *
 * 五个计算器此前一个平台概念都没有,字段名与默认值全是亚马逊心智。
 * 而 TikTok Shop 的成本结构差一块**达人佣金** —— 亚马逊完全没有这个概念,
 * 界面上不主动摆出来,卖家就不会想到去算,利润会系统性偏高而且看不出哪里错。
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import {
  PLATFORM_PRESETS, TIKTOK_BLOCKS, labelFor, platformOf, presetFor,
} from "../lib/crossborder/platform-preset";
import { BLOCK_TYPES } from "../lib/crossborder/cost-model";
import { calculateProfit } from "../lib/crossborder/calculators/profit";
import { calculateAcos } from "../lib/crossborder/calculators/acos";
import { priceCoefficients } from "../lib/crossborder/pricing-sim";
import { WIKI_GROUPS } from "../lib/crossborder/wiki";
import { GUIDE_PARTS } from "../lib/crossborder/guide";

test("按 marketplace 认平台,认不出按亚马逊(那是现状,不是猜测)", () => {
  for (const m of ["tiktok-us", "tiktok-uk", "TikTok-ID", "tiktok-sea"]) {
    assert.equal(platformOf(m), "tiktok", `${m} 没认成 TikTok`);
  }
  for (const m of ["amazon-us", "amazon-jp", "", null, undefined, "shopify"]) {
    assert.equal(platformOf(m), "amazon", `${m} 不该被认成 TikTok`);
  }
});

test("亚马逊预设必须是空的 —— 现有行为一字不改", () => {
  const a = PLATFORM_PRESETS.amazon;
  assert.deepEqual(a.labels, {}, "给亚马逊也改了名,等于悄悄动了现有用户的界面");
  assert.deepEqual(a.defaults, {}, "给亚马逊塞了默认值,会覆盖用户已有的习惯");
  assert.equal(a.suggestedBlocks.length, 0);
});

test("达人佣金必须是一等字段,不能只当可选积木", () => {
  const t = presetFor("tiktok-us");
  assert.ok((t.defaults as Record<string, number>).affiliateRate! > 0,
    "TikTok 预设没给达人佣金起点值");
  // 它不能同时存在于积木里 —— 两份口径会重复计费,而且用户看不出来
  assert.ok(!t.suggestedBlocks.some((b) => b.key === "affiliate_commission"),
    "达人佣金既是字段又是积木 —— 会重复计费");
  assert.ok(t.suggestedBlocks.some((b) => b.key === "sample_cost"),
    "寄样成本仍应是积木(它按批次分摊,不是售价百分比)");
});

test("达人佣金要进三个引擎 —— 只在利润页算等于两套口径", () => {
  const base = { price: 30, cost: 12, commission: 8, refund: 5, ads: 0,
                 domestic: 0, head: 0, lastMile: 0, vatRate: 0 };
  // 利润
  const p0 = calculateProfit({ ...base } as never);
  const p1 = calculateProfit({ ...base, affiliateRate: 15 } as never);
  assert.ok(p1.profit < p0.profit - 4, "利润引擎没扣达人佣金");
  // ACoS 保本线
  const a0 = calculateAcos({ price: 30, cost: 12, commission: 8, refund: 5, margin: 10 });
  const a1 = calculateAcos({ price: 30, cost: 12, commission: 8, refund: 5, margin: 10, affiliateRate: 15 });
  assert.ok(a1.breakevenAcos < a0.breakevenAcos - 10,
    `ACoS 保本线没扣达人佣金(${a0.breakevenAcos.toFixed(1)}% → ${a1.breakevenAcos.toFixed(1)}%)—— ` +
    "照着偏高的红线投广告,每单都在亏");
  // 定价倒推
  const c0 = priceCoefficients({ fixedCost: 12, commission: 8, ads: 0, refund: 5, blocks: [] } as never);
  const c1 = priceCoefficients({ fixedCost: 12, commission: 8, ads: 0, refund: 5, blocks: [], affiliateRate: 15 } as never);
  assert.ok(c1.retention < c0.retention - 0.1, "定价倒推没扣达人佣金,倒推出的售价会偏低");
});

test("不传达人佣金时行为与从前一字不变 —— 亚马逊用户不受影响", () => {
  const base = { price: 30, cost: 12, commission: 8, refund: 5, ads: 0,
                 domestic: 0, head: 0, lastMile: 0, vatRate: 0 };
  const withZero = calculateProfit({ ...base, affiliateRate: 0 } as never);
  const without = calculateProfit({ ...base } as never);
  assert.equal(without.profit, withZero.profit, "可选字段缺省时改变了老行为");
  assert.equal(without.margin, withZero.margin);
});

test("TikTok 特有成本用现成的积木类型表达 —— 引擎不该为此改动", () => {
  for (const b of TIKTOK_BLOCKS) {
    assert.ok(BLOCK_TYPES[b.type], `${b.name} 用了不存在的积木类型 ${b.type}`);
    // 参数必须齐:缺一个字段,积木算出来就是 0,而界面上看不出来
    for (const f of BLOCK_TYPES[b.type].fields) {
      assert.ok(b.params[f.key] !== undefined, `${b.name} 缺参数 ${f.key}`);
    }
  }
  assert.equal(TIKTOK_BLOCKS.find((b) => b.key === "sample_cost")!.type, "batch_alloc");
});

test("费率必须标成占位值,不能装成行情", () => {
  const t = PLATFORM_PRESETS.tiktok;
  assert.ok(t.asOf, "没有口径更新日期 —— TikTok 佣金两年调了三次,不标日期等于骗人");
  assert.match(t.rateNote, /起点|占位/, "没说清这是占位值");
  assert.match(t.rateNote, /以你后台|实际谈/, "没告诉用户该以什么为准");
  // 达人佣金给了默认值,就必须点明它是逐个议价的
  assert.match(String(t.hints.affiliateRate), /议价/,
    "达人佣金给了个数却没说它按类目和达人逐个谈 —— 用户会以为那是行情");
});

test("字段改名只改该改的 —— 没覆盖的保持原样", () => {
  const t = presetFor("tiktok-us");
  assert.equal(labelFor(t, "lastMile", "尾程 / FBA"), "尾程运费", "FBA 是亚马逊说法,TikTok 以自发货为主");
  assert.equal(labelFor(t, "price", "售价"), "售价", "不该改的被改了");
  const a = presetFor("amazon-us");
  assert.equal(labelFor(a, "lastMile", "尾程 / FBA"), "尾程 / FBA", "亚马逊的说法被动了");
});

/* ── 跨境基础:名词与教程的 TikTok 覆盖 ── */

test("名词库要有 TikTok 专属组 —— 此前 0 条覆盖", () => {
  const g = WIKI_GROUPS.find((x) => x.key === "tiktok");
  assert.ok(g, "名词库没有 TikTok 分组");
  const slugs = g!.entries.map((e) => e.slug);
  for (const must of ["affiliate-commission", "roas", "gpm", "sampling-cost"]) {
    assert.ok(slugs.includes(must), `缺词条:${must}`);
  }
  // 每条都要有实义正文,不能只有一句话占位
  for (const e of g!.entries) {
    assert.ok(e.body.length > 60, `${e.term} 的正文太短,像占位`);
    assert.ok(e.one.length > 8, `${e.term} 缺一句话解释`);
  }
});

test("达人佣金词条必须点明它是亚马逊没有的那一块", () => {
  const g = WIKI_GROUPS.find((x) => x.key === "tiktok")!;
  const aff = g.entries.find((e) => e.slug === "affiliate-commission")!;
  assert.match(aff.body, /亚马逊/, "没有对照亚马逊 —— 用户的心智基线就是亚马逊,不对照他感觉不到差异");
  assert.match(aff.body, /\d+%/, "没给出量级,用户不知道这块有多重");
});

test("新手教程要有 TikTok 专章,且讲的是差异不是通用内容", () => {
  const ch = GUIDE_PARTS.flatMap((p) => p.chapters).find((c) => c.slug === "tiktok-shop");
  assert.ok(ch, "教程里没有 TikTok 章节");
  const text = JSON.stringify(ch);
  for (const must of ["达人佣金", "自发货", "退货", "体验分"]) {
    assert.ok(text.includes(must), `TikTok 章节没讲到「${must}」`);
  }
  assert.ok(text.includes("亚马逊"), "没有与亚马逊对照 —— 那这一章就只是又一篇通用介绍");
});

test("界面要主动提示平台特有成本,而不是等用户自己去下拉里翻", () => {
  const src = readFileSync(
    new URL("../app/crossborder/tools/profit-calculator/calculator.tsx", import.meta.url), "utf8");
  assert.match(src, /missingPlatformBlocks/,
    "没有「该加却还没加」的提示 —— 达人佣金摆在下拉菜单里等于没有,用户根本想不到去找它");
  assert.match(src, /preset\.rateNote/, "没把「这是占位值不是行情」摆出来");
});

test("字段说明必须接上界面,而且要短", () => {
  /*
   * 这一条防的是两件事,都发生过:
   *
   * 一、**写了没接上。** hints 上一轮就写好了,却没有任何界面读它 ——
   *    编译过、测试绿、用户永远看不到。同一族的还有 hasReviewsFor(写好了但
   *    popup 仍调旧函数)、/reviews/all(后端接口没有前端调用方)。
   *    症状都是「某个东西不出现」,不报任何错。所以这里直接查调用点。
   *
   * 二、**写太长。** 第一版每条三四十字,是按文档的长度写的;放进输入框下面、
   *    五个字段挨在一起就是一堵废话墙,比没有更累。用户是来填数的。
   */
  const calc = readFileSync(
    new URL("../app/crossborder/tools/profit-calculator/calculator.tsx", import.meta.url), "utf8");
  assert.match(calc, /hint=\{preset\.hints\[/,
    "hints 没有接进计算器 —— 写了没人读,等于没写");
  assert.match(calc, /\{hint && <small className="field-hint">/,
    "NumberField 收了 hint 却没渲染");

  const tiktok = PLATFORM_PRESETS.tiktok;
  const entries = Object.entries(tiktok.hints);
  assert.ok(entries.length > 0, "TikTok 一条字段说明都没有");
  for (const [k, v] of entries) {
    assert.ok((v ?? "").length <= 24,
      `hints.${k} 有 ${v?.length} 字 —— 上限 24。更长的口径解释放 rateNote,那里只出现一次。`);
  }
  // 亚马逊那边一条都不能有,否则现有界面会平白多出一行小字
  assert.deepEqual(PLATFORM_PRESETS.amazon.hints, {}, "亚马逊界面必须一字不改");
});
