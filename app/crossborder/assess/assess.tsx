"use client";
import { SiteLink } from "../../site-link";


/**
 * 综合测算(#62)—— 跨工具编排的第一形态。
 *
 * 不新造公式:到岸/利润/广告/定价四个环节全部调各工具的同一套引擎,
 * 吃同一份商品档案,在一页里串着算,最后给一个「能不能拍板」的综合判决。
 * 每一行都能跳去对应工具改参数 —— 这页是驾驶舱,不是又一个计算器。
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CircleDashed, Gauge,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import { ProductSwitcher } from "../tools/product-switcher";
import { calculateProfit, round1, round2, worstCase, type ProfitValues } from "../../../lib/crossborder/calculators/profit";
import { calculateAcos } from "../../../lib/crossborder/calculators/acos";
import {
  maxDiscount, priceCoefficients, simInputFromProfit, simProfit, solvePrice,
} from "../../../lib/crossborder/pricing-sim";
import { baseCost, readProductModel, toProfitValues } from "../../../lib/crossborder/product-model";
import { currentProduct, recordsOf } from "../../../lib/crossborder/products";

type Verdict = "go" | "edge" | "stop";

// 悲观档口径统一在引擎层(worstCase),不再各页各写一份

export function AssessPanel() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <main className="app-shell"><SiteHeader active="crossborder" />
        <section className="tool-page deepr-page"><div className="fact-empty">加载中…</div></section>
        <SiteFooter />
      </main>
    );
  }

  const model = readProductModel();
  const p = currentProduct();
  const values = model ? toProfitValues(model) : null;
  const target = model?.target ?? 20;
  const hasModel = !!model && model.updatedAt > 0;
  const landedDone = p ? recordsOf(p.id, "landed").length > 0 : false;

  /**
   * 判定必须用**含成本积木**的口径。
   *
   * 原来这里是 calculateProfit(values) —— 它不认识成本积木,而同一屏下面的
   * 「定价空间」行用的是含积木的 coef。于是出现算术上互相矛盾的一屏:
   * 上面写「单件利润 $6.03 · 20.2%,三条线都过了你设的标准」,
   * 下面写「保目标价 $37.39」——如果 $29.90 已经有 20.2%,何须涨到 $37.39?
   * 用户自己填的成本积木被判定完全无视,一个真实利润率只有 8.5% 的商品被开绿灯。
   */
  const blocks = model?.blocks ?? [];
  const adj = (v: typeof values) => {
    if (!v) return null;
    const base = calculateProfit(v);
    if (!blocks.length) return base;
    const c = priceCoefficients(simInputFromProfit(v, blocks));
    const profit = simProfit(c, v.price);
    return { ...base, profit: round2(profit), margin: round1((profit / v.price) * 100) };
  };
  let result: ReturnType<typeof calculateProfit> | null = null;
  let worst: ReturnType<typeof calculateProfit> | null = null;
  try { result = adj(values); } catch { result = null; }
  try { worst = values ? adj(worstCase(values)) : null; } catch { worst = null; }

  // vatRate 必须带上 —— 少了它,同一屏上「利润」算的是含税口径、
  // 「广告红线」算的是不含税口径,英国站两者会差十几个百分点。
  const acos = values ? calculateAcos({ price: values.price, cost: baseCost(values), commission: values.commission,
      refund: values.refund, margin: target, vatRate: values.vatRate }) : null;
  const coef = values && model ? priceCoefficients(simInputFromProfit(values, model.blocks)) : null;
  const suggested = coef ? solvePrice(coef, { kind: "margin", value: target }) : null;
  const discount = coef && values ? maxDiscount(coef, values.price) : null;

  // 硬线核对:三条可核对的事实线 —— 基准达标与否、悲观正负、目标 ACoS 有无解。
  // 只陈述每条线过没过,不下「能不能做」的结论 —— 结论永远是用户的。
  let verdict: Verdict = "stop";
  let passed = 0;
  let verdictText = "还没有可核对的账 —— 先把利润参数填了。";
  if (result && worst && acos) {
    const okMargin = result.margin >= target;
    const okWorst = worst.margin >= 0;
    const okAcos = acos.targetFeasible;
    passed = [okMargin, okWorst, okAcos].filter(Boolean).length;
    if (result.margin < 0) {
      verdict = "stop";
      verdictText = `基准口径净利率 ${result.margin.toFixed(1)}%,当前售价未覆盖总成本 —— 差距在利润计算器里逐项可见。`;
    } else if (passed === 3) {
      verdict = "go";
      verdictText = "三条线都过了你设的标准。";
    } else {
      verdict = "edge";
      const why = [
        !okMargin && `净利率 ${result.margin.toFixed(1)}% 未到目标 ${target.toFixed(0)}%`,
        !okWorst && `悲观档为负(${worst.margin.toFixed(1)}%)`,
        !okAcos && "目标 ACoS 无解",
      ].filter(Boolean).join(";");
      verdictText = `未过的线:${why}。已过与未过的数字都在下方环节里。`;
    }
  }

  const rows = values && result ? [
    {
      key: "cost", name: "成本底盘", done: landedDone,
      num: `$${baseCost(values).toFixed(2)} /件`,
      note: landedDone ? "到岸成本已算过,采购+物流按档案取值" : "到岸成本还没算过 —— 关税杂费可能被低估",
      href: "/crossborder/tools/landed-cost", link: landedDone ? "复核到岸" : "去算到岸",
    },
    {
      key: "profit", name: "单件利润", done: result.margin >= target,
      num: `$${result.profit.toFixed(2)} · ${result.margin.toFixed(1)}%`,
      note: result.margin >= target ? `达到目标 ${target.toFixed(0)}%;悲观档 ${worst ? worst.margin.toFixed(1) : "—"}%` : `距目标 ${target.toFixed(0)}% 还差 ${(target - result.margin).toFixed(1)}pt`,
      href: "/crossborder/tools/profit-calculator", link: "调参数",
    },
    {
      key: "ads", name: "广告红线", done: !!acos?.targetFeasible,
      num: acos ? `保本 ${acos.breakevenAcos.toFixed(1)}%${acos.targetFeasible ? ` · 目标 ${acos.targetAcos.toFixed(1)}%` : ""}` : "—",
      note: acos?.targetFeasible ? "投放控制在目标 ACoS 内即可保住目标净利" : "毛利吃不下目标净利 —— 目标 ACoS 无解",
      href: "/crossborder/tools/acos-break-even", link: "完整测算",
    },
    {
      key: "price", name: "定价空间",
      done: !!suggested?.price && discount?.discountPct != null && discount.discountPct > 0,
      num: suggested?.price ? `保目标价 $${suggested.price.toFixed(2)}` : "—",
      note: discount?.discountPct != null && discount.discountPct > 0 && discount.breakevenPrice != null
        ? `现价最多让 ${discount.discountPct.toFixed(0)}% 仍不亏(至 $${discount.breakevenPrice.toFixed(2)})`
        : "现价已没有让价空间",
      href: "/crossborder/tools/pricing-calculator", link: "模拟定价",
    },
  ] : [];

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page deepr-page">
        <SiteLink className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</SiteLink>
        <div className="tool-page-head">
          <div className="tool-page-title">
            <span className="tool-page-icon"><Gauge size={22} /></span>
            <div><span>CROSS-BORDER / 驾驶舱</span><h1>综合测算</h1></div>
          </div>
        </div>
        <div className="tool-belt"><ProductSwitcher /></div>

        {!hasModel || !values || !result ? (
          <div className="my-empty">
            <b>这个商品还没有可判的账</b>
            <p>先去利润计算器把基础参数填了 —— 综合测算吃的是同一份商品档案。</p>
            <SiteLink className="primary-cta" href="/crossborder/tools/profit-calculator">去填参数</SiteLink>
          </div>
        ) : (
          <>
            <div className="hl">
              <div className="hl-head">
                <span className="hl-lab"><b>硬线核对</b>三条你自己设的线,我们只对数字</span>
                <span className="hl-big"><b>{passed}/3</b><span>条硬线通过</span></span>
              </div>
              <div className="hl-row">
                <span className={`hl-st ${result.margin >= target ? "pass" : "miss"}`}>{result.margin >= target ? "过线" : "未过"}</span>
                <span className="hl-f">基准净利率 ≥ 目标 {target.toFixed(0)}%</span>
                <span className="hl-n">{result.margin.toFixed(1)}%</span>
              </div>
              <div className="hl-row">
                <span className={`hl-st ${worst && worst.margin >= 0 ? "pass" : "miss"}`}>{worst && worst.margin >= 0 ? "过线" : "未过"}</span>
                <span className="hl-f">悲观档净利率为正(售价−7% · 广告+3pt · 退款+1pt)</span>
                <span className="hl-n">{worst ? `${worst.margin.toFixed(1)}%` : "—"}</span>
              </div>
              <div className="hl-row">
                <span className={`hl-st ${acos?.targetFeasible ? "pass" : "miss"}`}>{acos?.targetFeasible ? "过线" : "未过"}</span>
                <span className="hl-f">目标 ACoS 有解(保本 {acos ? acos.breakevenAcos.toFixed(1) : "—"}%)</span>
                <span className="hl-n">{acos?.targetFeasible ? `${acos.targetAcos.toFixed(1)}%` : "无解"}</span>
              </div>
              <div className="hl-foot">{verdictText}<b> 做不做的结论我们不下、也下不了</b> —— 数字都在上面,你看着定。</div>
            </div>

            <div className="ass-list">
              {rows.map((r) => (
                <div key={r.key} className={`ass-row ${r.done ? "is-ok" : "is-todo"}`}>
                  {r.done ? <CheckCircle2 size={15} /> : <CircleDashed size={15} />}
                  <div className="ass-copy"><b>{r.name}</b><span>{r.note}</span></div>
                  <span className="ass-num">{r.num}</span>
                  <SiteLink className="ass-go" href={r.href}>{r.link} <ArrowRight size={12} /></SiteLink>
                </div>
              ))}
            </div>

            <p className="fact-note" style={{ marginTop: 12 }}>
              <AlertTriangle size={12} style={{ verticalAlign: "-2px" }} /> 四个环节用的都是对应工具的同一套公式与同一份商品档案 ——
              这页没有任何独立口径;改参数请进对应工具,回来这页会跟着变。三条硬线只核对数字过没过你设的线,
              <b>做不做的结论我们不下、也下不了</b>。成本模块只影响利润页的调整后口径,不参与核对。
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
