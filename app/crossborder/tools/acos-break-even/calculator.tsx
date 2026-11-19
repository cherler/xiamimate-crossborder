"use client";
import { SiteLink } from "../../../site-link";


/**
 * 广告盈亏规划器。
 * 上半段是财务红线（保本 / 目标 ACoS，直接取自 calculators/acos.ts，与利润页广告卡片同一组数字）；
 * 下半段接入广告后台实测数据，回答「CPC 出到多少还不亏」。
 *
 * 广告数据为选填：不填也能当纯粹的 ACoS 红线计算器用。
 * 本工具只给财务红线，不下广告策略结论。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Calculator, Info, MousePointerClick } from "lucide-react";
import { ToolPageShell, NumberField, Assumption, money, useToolImport, ScenarioLadder } from "../tool-kit";
import { ModelPrefillBanner, useProductModelPrefill } from "../model-prefill";
import {
  ResultActions, HistoryStrip, useToolHistory, useSharedInitial, type ToolValues,
} from "../tool-actions";
import {
  adMetrics, planAds, cpcScenarios, cpcBand, detectAdIssues,
} from "../../../../lib/crossborder/ad-planner";



export function AcosCalculator() {
  const [price, setPrice] = useState(29.9);
  const [cost, setCost] = useState(14.2);
  const [commission, setCommission] = useState(15);
  const [margin, setMargin] = useState(15);
  // 退款损耗:与佣金一样是按售价百分比计的必然成本。此前整个页面没有这一项,
  // 保本 ACoS 因此恰好高出退款率那么多个点 —— 实测 33% 的卖家被告知「线内」,
  // 而他每单在亏。利润计算器一直是含它的,两个工具对同一商品给出不同的保本线。
  const [refund, setRefund] = useState(2);
  /** 销项税率 %。欧盟/英国的含税标价里有一部分要上缴,不是你的收入 —— 见 acos.ts 的说明。 */
  const [vatRate, setVatRate] = useState(0);
  /** 达人佣金 %(TikTok Shop)。与平台佣金同口径按售价计 —— 亚马逊填 0。 */
  const [affiliateRate, setAffiliateRate] = useState(0);
  // 广告实测（选填）
  const [spend, setSpend] = useState(300);
  const [adSales, setAdSales] = useState(1200);
  const [clicks, setClicks] = useState(500);
  const [orders, setOrders] = useState(40);
  const [adShare, setAdShare] = useState(60);
  // 逐字段的示例默认值 —— 用来标注「这项你没动过」。
  // 总标记 isDemo 只在全部相等时才亮:用户一改售价它就消失,而广告花费 300 /
  // 归因销售额 1200 / 点击 500 / 订单 40 仍是我们的,却渲染成一整套
  // 「实测 CPC $0.60 · CVR 8.0% · ACoS 25.0%」的面板,看着就像他自己的账户数据。
  const DEFAULTS: Record<string, number> = {
    price: 29.9, cost: 14.2, commission: 15, refund: 2, margin: 15, vatRate: 0, affiliateRate: 0,
    spend: 300, adSales: 1200, clicks: 500, orders: 40,
  };
  const live: Record<string, number> = { price, cost, commission, refund, margin, vatRate, affiliateRate, spend, adSales, clicks, orders };
  const src = (k: string) => imp.sourceOf(k, live[k] === DEFAULTS[k]);
  const isDemo = price === 29.9 && cost === 14.2 && commission === 15 && margin === 15 && refund === 2 && spend === 300 && adSales === 1200 && clicks === 500 && orders === 40 && adShare === 60;
  const clearParams = () => { setPrice(0); setCost(0); setCommission(0); setMargin(0); setRefund(0); setSpend(0); setAdSales(0); setClicks(0); setOrders(0); setAdShare(0); imp.markAllTouched(Object.keys(DEFAULTS)); };

  const imp = useToolImport({
    price: setPrice, cost: setCost, commission: setCommission, margin: setMargin, refund: setRefund,
    vatRate: setVatRate, affiliateRate: setAffiliateRate,
    spend: setSpend, adSales: setAdSales, clicks: setClicks, orders: setOrders,
  }, "acos");
  const prefill = useProductModelPrefill("acos");
  const hist = useToolHistory("acos");

  const product = useMemo(() => ({ price, cost, commission, refund, margin, vatRate, affiliateRate }),
    [price, cost, commission, refund, margin, vatRate, affiliateRate]);
  const actuals = useMemo(() => ({ spend, adSales, clicks, orders }), [spend, adSales, clicks, orders]);

  const plan = useMemo(() => planAds(product, actuals, adShare), [product, actuals, adShare]);
  const m = useMemo(() => adMetrics(actuals), [actuals]);
  const issues = useMemo(() => detectAdIssues(product, actuals, plan), [product, actuals, plan]);
  const rows = useMemo(
    () => (m.cpc && m.cvr ? cpcScenarios(product, m.cvr, cpcBand(m.cpc)) : []),
    [product, m.cpc, m.cvr],
  );

  const r = plan.acos;
  const negative = !r.targetFeasible;
  const hasAdData = m.cpc !== null && m.cvr !== null;

  /**
   * 分享链接与历史记录的快照。**必须与表单字段一一对应** ——
   * 这里少一个字段,分享出去/自己回看时那一项就悄悄回到默认值。
   *
   * refund 与 vatRate 此前都不在这里:UK 卖家把销项税率填成 20% 存一笔记录,
   * 点回看时它变回 0,保本 ACoS 从 41.5% 跳到 58.1% —— 正是加 vatRate 要修的那个
   * 16.6 个点,被存取这条路又放了回来。而利润页不会犯这个错,因为它是
   * `{...values}` 整份带走、`Object.keys(cur)` 整份还原,加字段自动跟上。
   */
  const values: ToolValues = { price, cost, commission, refund, margin, vatRate, affiliateRate, spend, adSales, clicks, orders, adShare };
  function applyValues(v: ToolValues) {
    if (v.price != null) setPrice(Number(v.price));
    if (v.cost != null) setCost(Number(v.cost));
    if (v.commission != null) setCommission(Number(v.commission));
    if (v.refund != null) setRefund(Number(v.refund));
    if (v.margin != null) setMargin(Number(v.margin));
    if (v.vatRate != null) setVatRate(Number(v.vatRate));
    if (v.affiliateRate != null) setAffiliateRate(Number(v.affiliateRate));
    if (v.spend != null) setSpend(Number(v.spend));
    if (v.adSales != null) setAdSales(Number(v.adSales));
    if (v.clicks != null) setClicks(Number(v.clicks));
    if (v.orders != null) setOrders(Number(v.orders));
    if (v.adShare != null) setAdShare(Number(v.adShare));
  }
  useSharedInitial(applyValues);

  const label = `售价 $${money(price)} · 保本 ACoS ${r.breakevenAcos.toFixed(1)}%`;
  const resultText = () =>
    `广告盈亏规划器\n售价 $${money(price)} · 单件成本 $${money(cost)} · 佣金 ${commission}% · 目标净利 ${margin}%\n` +
    `保本 ACoS ${r.breakevenAcos.toFixed(1)}% · 目标 ACoS ${negative ? "—" : `${r.targetAcos.toFixed(1)}%`} · 每单可承受广告费 $${money(Math.max(0, r.grossPerUnit))}\n` +
    (hasAdData
      ? `实测 CPC $${money(m.cpc!)} · CVR ${m.cvr!.toFixed(1)}% · ACoS ${m.acos!.toFixed(1)}%\n` +
        `保本 CPC 上限 $${money(plan.maxCpc!)} · 目标 CPC $${plan.targetCpc !== null ? money(plan.targetCpc) : "—"}` +
        `${plan.tacos !== null ? ` · TACoS ${plan.tacos.toFixed(1)}%` : ""}`
      : "未填写广告实测数据，仅给出财务红线。");

  return (
    <>
      <ToolPageShell activeId="acos">
        <section className="param-col">
          <ModelPrefillBanner prefill={prefill} onFill={(v) => imp.applyModel(v)} />

          <div className="section-heading"><span><Calculator size={15} /> 商品参数</span><em>{isDemo && <i className="demo-chip">示例数据</i>}<button type="button" className="ph-clear" onClick={clearParams}>清空参数</button>手动填写 · 实时计算</em></div>
          <div className="field-grid">
            <NumberField label="售价" prefix="$" value={price} source={src("price")} onChange={(v) => imp.update("price", v)} />
            <NumberField label="单件成本" prefix="$" value={cost} source={src("cost")} onChange={(v) => imp.update("cost", v)} hint="采购 + 物流，不含广告" />
            <NumberField label="平台佣金" suffix="%" value={commission} source={src("commission")} onChange={(v) => imp.update("commission", v)} />
            <NumberField label="退款损耗" suffix="%" value={refund} source={src("refund")} onChange={(v) => imp.update("refund", v)} hint="退货/退款占售价的比例，与佣金一样吃掉每一单" />
            <NumberField label="销项税率" suffix="%" value={vatRate} source={src("vatRate")} onChange={(v) => imp.update("vatRate", v)} hint="欧盟/英国的标价含税，这部分要上缴，不是你的收入；美国站填 0" />
            {/* 达人佣金:与平台佣金一样吃掉每一单。漏了它保本 ACoS 会偏高,
                照着这条红线投广告,每单都在亏 —— 与 refund 是同一个坑。 */}
            <NumberField label="达人佣金" suffix="%" value={affiliateRate} source={src("affiliateRate")} onChange={(v) => imp.update("affiliateRate", v)} hint="TikTok Shop 的达人带货分佣，与平台佣金一样按售价抽成；亚马逊没有这一项，填 0" />
            <NumberField label="目标净利率" suffix="%" value={margin} source={src("margin")} onChange={(v) => imp.update("margin", v)} />
          </div>

          <div className="section-heading mt-gap">
            <span><MousePointerClick size={15} /> 广告实测数据</span><em>选填 · 用于算 CPC 上限</em>
          </div>
          <div className="field-grid">
            <NumberField label="广告花费" prefix="$" value={spend} source={src("spend")} onChange={(v) => imp.update("spend", v)} />
            <NumberField label="归因销售额" prefix="$" value={adSales} source={src("adSales")} onChange={(v) => imp.update("adSales", v)} hint="广告带来的销售额" />
            <NumberField label="点击数" value={clicks} source={src("clicks")} onChange={(v) => imp.update("clicks", v)} />
            <NumberField label="归因订单数" value={orders} source={src("orders")} onChange={(v) => imp.update("orders", v)} />
            <NumberField label="广告销售占比" suffix="%" value={adShare} onChange={setAdShare} hint="广告销售 ÷ 总销售，用于折算 TACoS" />
          </div>
        </section>

        <section className="result-col">
          <ResultActions resultText={resultText} slug="acos-break-even" toolId="acos" shareValues={values}
            onSave={() => hist.save(values, label)} />
          <HistoryStrip items={hist.items} onRestore={applyValues} onClear={hist.clear} isCloud={hist.isCloud} productName={hist.productName}
            render={(v) => `售价 $${v.price} · 净利 ${v.margin}%`} />

          <div className={`pv-verdict ${negative ? "pv-near" : "pv-ink"}`}>
            <div className="pv-hero">
              <div className="pv-lab">保本 ACoS<em>= 广告投产的盈亏红线</em></div>
              <div className="pv-big">{r.breakevenAcos.toFixed(1)}<small> %</small></div>
              {/*
                同一条红线的另一种说法。ACoS 是亚马逊的口径,TikTok Shop 卖家
                日常说的是 ROAS(成交额 ÷ 广告花费)—— 数学上 ROAS = 100/ACoS,
                但「保本 ACoS 35%」和「保本 ROAS 2.9」对他不是一句话。
                两个都摆出来,谁看谁的都行,不用心算。
              */}
              {r.breakevenAcos > 0 && (
                <div className="pv-alt">≈ 保本 ROAS <b>{(100 / r.breakevenAcos).toFixed(2)}</b>
                  <em>成交额 ÷ 广告花费,TikTok / 信息流投放常用这个口径</em></div>
              )}
              <span className="pv-chip">{negative
                ? "! 当前毛利无法同时满足目标净利"
                : `✓ 控在 ${r.targetAcos.toFixed(1)}% 内,可保住 ${margin}% 净利`}</span>
            </div>
            <div className="pv-facts">
              <div className="pv-fact"><span>目标 ACoS · 保 {margin}%</span><b>{negative ? "—" : `${r.targetAcos.toFixed(1)}%`}<em>{negative ? "无解" : "投放上限"}</em></b></div>
              <div className="pv-fact"><span>每单可承受广告费</span><b>${money(Math.max(0, r.grossPerUnit))}<em>保本口径</em></b></div>
              <div className="pv-fact"><span>实测 ACoS</span><b>{hasAdData ? `${m.acos!.toFixed(1)}%` : "—"}<em>{hasAdData ? (m.acos! > r.breakevenAcos ? "已越线" : "线内") : "填广告数据后显示"}</em></b></div>
            </div>
          </div>

          {(() => {
            // 签名件:红线标尺 —— 绿区(保住目标) / 黄区(还不亏) / 红区(亏),实测落点一眼定位。
            if (!(r.breakevenAcos > 0)) return null;
            const actual = hasAdData ? m.acos! : null;
            const scaleMax = Math.max(r.breakevenAcos * 1.25, (actual ?? 0) * 1.12);
            const x = (v: number) => Math.min(100, Math.max(0, (v / scaleMax) * 100));
            const tgt = negative ? null : r.targetAcos;
            return (
              <div className="rline">
                <div className="rline-head"><b>这条红线怎么读</b><span>ACoS 越高,广告吃掉的利润越多</span></div>
                <div className="rline-track">
                  {tgt !== null && <div className="rline-zone ok" style={{ left: 0, width: `${x(tgt)}%` }} />}
                  <div className="rline-zone warn" style={{ left: `${tgt !== null ? x(tgt) : 0}%`, width: `${x(r.breakevenAcos) - (tgt !== null ? x(tgt) : 0)}%` }} />
                  {tgt !== null && (
                    <div className="rline-mark" style={{ left: `${x(tgt)}%` }}><span>目标 {tgt.toFixed(1)}%</span></div>
                  )}
                  <div className="rline-mark" style={{ left: `${x(r.breakevenAcos)}%` }}><span>保本 {r.breakevenAcos.toFixed(1)}%</span></div>
                  {actual !== null && (
                    <div className={`rline-dot${actual > r.breakevenAcos ? " over" : ""}`} style={{ left: `${x(actual)}%` }}>
                      <span>实测 {actual.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="rline-legend">
                  {tgt !== null && <span><i className="ok" />保住 {margin}% 净利</span>}
                  <span><i className="warn" />不亏,但目标失守</span>
                  <span><i className="bad" />越过保本线 · 亏</span>
                </div>
              </div>
            );
          })()}

          {hasAdData ? (
            <>
              <div className="cpc-card">
                <div className="acos-head">
                  <span><BarChart3 size={14} /> CPC 上限</span>
                  <em>实测 CPC ${money(m.cpc!)} · CVR {m.cvr!.toFixed(1)}% · ACoS {m.acos!.toFixed(1)}%</em>
                </div>
                <div className="acos-row">
                  <div>
                    <small>保本 CPC 上限</small>
                    <strong className={m.cpc! > plan.maxCpc! ? "neg" : ""}>${money(plan.maxCpc!)}</strong>
                  </div>
                  <div>
                    <small>目标 CPC · 保住 {margin}%</small>
                    <strong className={plan.targetCpc !== null && m.cpc! > plan.targetCpc ? "neg" : ""}>
                      {plan.targetCpc !== null ? `$${money(plan.targetCpc)}` : "—"}
                    </strong>
                  </div>
                  <div>
                    <small>TACoS · 占总销售</small>
                    <strong>{plan.tacos !== null ? `${plan.tacos.toFixed(1)}%` : "—"}</strong>
                  </div>
                </div>
                <p>
                  每单广告费 = CPC ÷ CVR，所以 CPC 上限 = 每单可承受广告费 × CVR（当前 CVR {m.cvr!.toFixed(1)}%）。
                  <b>TACoS {plan.tacos !== null ? `${plan.tacos.toFixed(1)}%` : "—"} 就是利润计算器里「广告成本 %」那个字段</b>，
                  可直接填回去；ACoS 的分母是广告归因销售额，两者别混用。
                </p>
              </div>

              <div className="scenario-card">
                <div className="card-title"><span>CPC 情景阶梯</span><small>出价越高越吃利润 · CVR 固定 {m.cvr!.toFixed(1)}%</small></div>
                <ScenarioLadder
                  heads={["每单广告费", "ACoS"]}
                  leftZone="亏损区" rightZone="盈利区"
                  rows={(() => {
                    const list = rows.map((row) => ({
                      key: String(row.cpc),
                      label: `$${money(row.cpc)}`,
                      bar: row.profitPerOrder,
                      barLabel: `${row.profitPerOrder >= 0 ? "+" : "−"}$${money(Math.abs(row.profitPerOrder))}`,
                      stats: [`$${money(row.adCostPerOrder)}`, `${row.acos.toFixed(1)}%`],
                      target: Math.abs(row.cpc - m.cpc!) < 0.005,
                    }));
                    // 保本 CPC 上限压在地面(bar=0):越过它就亏
                    if (plan.maxCpc != null) {
                      list.push({
                        key: "be", label: `$${money(plan.maxCpc)}`, sub: "保本 CPC · 不赔不赚",
                        bar: 0, barLabel: "", stats: ["—", "—"], target: false, breakeven: true,
                      } as typeof list[number]);
                    }
                    return list.sort((a, b) => b.bar - a.bar);
                  })()}
                />
                <p className="scenario-note">
                  <Info size={12} />
                  阶梯<b>假设 CVR 不随出价变化</b>——实际提高出价往往拿到更靠前的位置，CVR 与点击量都会变。它只回答「这个 CPC 对应多少利润」，不预测能拿到多少单。
                </p>
              </div>
            </>
          ) : (
            <div className="cpc-card empty">
              <Info size={14} />
              <span>填入广告花费、点击与归因订单数后，可测算保本 / 目标 <b>CPC 上限</b>与 TACoS。不填也不影响上面的财务红线。</span>
            </div>
          )}

          {issues.length > 0 && (
            <div className="cost-modules">
              {issues.map((c) => (
                <div className={`conflict-item ${c.level}`} key={c.id}>
                  {c.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
                  <span>{c.text}</span>
                </div>
              ))}
            </div>
          )}

          <Assumption formula="保本 ACoS = 单件毛利 ÷ 售价    (单件毛利 = 售价 − 单件成本 − 平台佣金 − 退款损耗)">
            <ul>
              <li><strong>目标 ACoS</strong>= (单件毛利 − 售价 × 目标净利率) ÷ 售价;红线与<SiteLink href="/crossborder/tools/profit-calculator">利润计算器</SiteLink>广告卡片同一口径。</li>
              <li><strong>CPC 上限</strong>= 每单可承受广告费 × CVR(每单广告费 = CPC ÷ CVR)。</li>
              <li><b>ACoS 没有统一的「好坏」:</b>新品拉新、清库存与稳定盈利的合理区间不同,低 ACoS 也可能只是曝光不足。</li>
              <li><strong>实测口径要当心:</strong>归因时间窗(7 天 / 14 天不同)、SP/SB/SD 类型口径不一、多件订单会让归因客单价偏离售价、新品期目标与成熟期不同。</li>
              <li><b>本工具只给财务红线,不构成「该加价 / 该暂停广告」的策略结论。</b></li>
            </ul>
          </Assumption>

        </section>
      </ToolPageShell>
    </>
  );
}
