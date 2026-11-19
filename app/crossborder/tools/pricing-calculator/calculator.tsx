"use client";
import { SiteLink } from "../../../site-link";


/**
 * 定价决策模拟器。
 * 按目标（净利率 / ROI / 单件利润 / 保本）倒推售价，并给出售价变动的情景表与折扣空间。
 * 成本模型与利润计算器共用同一套积木，simProfit 与 computeAdjusted 同口径。
 *
 * 只给财务可行区间：需求、转化与竞品价格不在模型里，本工具不预测销量、不承诺「最优价」。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Info, Layers3, Plus, Tag } from "lucide-react";
import { ToolPageShell, NumberField, Assumption, ScenarioLadder, money, useToolImport } from "../tool-kit";
import { ModelPrefillBanner, useProductModelPrefill } from "../model-prefill";

import { BlockCard } from "../cost-blocks";
import {
  ResultActions, HistoryStrip, useToolHistory, useSharedInitial, type ToolValues,
} from "../tool-actions";
import {
  BLOCK_TYPES, COST_PRESETS, blockFromPreset, detectConflicts, type CostBlock,
} from "../../../../lib/crossborder/cost-model";
import {
  priceCoefficients, solvePrice, priceScenarios, scenarioBand, scenarioAt, maxDiscount,
  TARGET_LABELS, type SimTarget,
} from "../../../../lib/crossborder/pricing-sim";



type TargetKind = SimTarget["kind"];

const TARGET_META: Record<TargetKind, { suffix?: string; prefix?: string; hint: string; fallback: number }> = {
  margin: { suffix: "%", hint: "利润 ÷ 售价", fallback: 25 },
  roi: { suffix: "%", hint: "利润 ÷ 自垫成本（采购+物流+固定成本模块）", fallback: 40 },
  unitProfit: { prefix: "$", hint: "每卖一件要赚到的钱", fallback: 6 },
  breakeven: { hint: "利润为 0 的售价，不需要填目标值", fallback: 0 },
};

export function PricingCalculator() {
  const [cost, setCost] = useState(12);
  const [commission, setCommission] = useState(15);
  const [ads, setAds] = useState(10);
  const [refund, setRefund] = useState(2);
  /**
   * 销项税率 %。欧盟/英国的标价是含税价,其中一部分要上缴,不是你的收入。
   *
   * 这一页此前**整个没有这个概念**:引擎(pricing-sim)一直支持 vatRate,
   * 而页面手工拼 SimInput 时把它漏掉了。实测英国站 20% VAT:
   * 定价页给的保本价 10.47,真保本价 13.68 —— 照它定价每单实亏 3.21,
   * 而利润页对同一个商品是算对的。同一商品两个工具两个答案。
   */
  const [vatRate, setVatRate] = useState(0);
  /** 达人佣金 %(TikTok Shop)。与平台佣金同口径按售价计 —— 亚马逊填 0。 */
  const [affiliateRate, setAffiliateRate] = useState(0);
  const [targetKind, setTargetKind] = useState<TargetKind>("margin");
  const [targetValue, setTargetValue] = useState(25);
  const [blocks, setBlocks] = useState<CostBlock[]>([]);
  // 逐字段的示例默认值 —— 总标记只在全部相等时才亮,用户一改其中一项它就消失,
  // 而其余字段仍是我们预填的示例值,却渲染成一套看着像用户自己的数据。
  const DEFAULTS: Record<string, number> = { cost: 12, commission: 15, ads: 10, refund: 2, targetValue: 25, vatRate: 0, affiliateRate: 0 };
  const live: Record<string, number> = { cost, commission, ads, refund, targetValue, vatRate, affiliateRate };
  const src = (k: string) => imp.sourceOf(k, live[k] === DEFAULTS[k]);
  const isDemo = cost === 12 && commission === 15 && ads === 10 && refund === 2 && targetValue === 25;
  const clearParams = () => { setCost(0); setCommission(0); setAds(0); setRefund(0); setTargetValue(0); imp.markAllTouched(Object.keys(DEFAULTS)); };
  const imp = useToolImport({
    cost: setCost, commission: setCommission, ads: setAds, refund: setRefund,
    targetValue: setTargetValue, vatRate: setVatRate, affiliateRate: setAffiliateRate,
  }, "pricing");
  const prefill = useProductModelPrefill("pricing");
  const hist = useToolHistory("pricing");

  const coef = useMemo(
    () => priceCoefficients({ fixedCost: cost, commission, ads, refund, vatRate, affiliateRate, blocks }),
    [cost, commission, ads, refund, vatRate, affiliateRate, blocks],
  );
  const solved = useMemo(() => {
    const target: SimTarget = targetKind === "breakeven" ? { kind: "breakeven" } : { kind: targetKind, value: targetValue };
    return solvePrice(coef, target);
  }, [coef, targetKind, targetValue]);
  const price = solved.price;
  const rows = useMemo(() => (price ? priceScenarios(coef, scenarioBand(price)) : []), [coef, price]);
  const here = price ? scenarioAt(coef, price) : null;
  const room = price ? maxDiscount(coef, price) : null;

  const conflicts = blocks.length > 0 ? detectConflicts(blocks, { refund }) : [];
  const addedKeys = blocks.map((b) => b.id.split("-")[0]);
  const availablePresets = COST_PRESETS.filter((p) => p.key.startsWith("custom") || !addedKeys.includes(p.key));
  const hasBlocks = blocks.length > 0;

  function addPreset(preset: typeof COST_PRESETS[number]) { setBlocks((bs) => [...bs, blockFromPreset(preset)]); }
  function updateBlock(next: CostBlock) { setBlocks((bs) => bs.map((b) => (b.id === next.id ? next : b))); }
  function removeBlock(id: string) { setBlocks((bs) => bs.filter((b) => b.id !== id)); }

  // 积木参数一并交给 AI 读取，与利润页同一套做法。




  /** 快照必须与表单字段一一对应 —— 少一个,分享/回看时那一项就悄悄回到默认值。
   *  vatRate 此前漏在外面:含税站点存的记录一回看就按不含税倒推,售价定低一截。 */
  const values: ToolValues = {
    cost, commission, ads, refund, vatRate, affiliateRate, targetKind, targetValue, mv: 1, blocks: JSON.stringify(blocks),
  };
  function applyValues(v: ToolValues) {
    if (v.cost != null) setCost(Number(v.cost));
    if (v.commission != null) setCommission(Number(v.commission));
    if (v.ads != null) setAds(Number(v.ads));
    if (v.refund != null) setRefund(Number(v.refund));
    if (v.vatRate != null) setVatRate(Number(v.vatRate));
    if (v.affiliateRate != null) setAffiliateRate(Number(v.affiliateRate));
    if (typeof v.targetKind === "string" && v.targetKind in TARGET_META) setTargetKind(v.targetKind as TargetKind);
    if (v.targetValue != null) setTargetValue(Number(v.targetValue));
    // 旧分享链接用的是 margin 字段，仍要能还原。
    else if (v.margin != null) { setTargetKind("margin"); setTargetValue(Number(v.margin)); }
    if (typeof v.blocks === "string") {
      try {
        const arr = JSON.parse(v.blocks);
        if (Array.isArray(arr)) setBlocks(arr as CostBlock[]);
      } catch { /* 忽略损坏的快照 */ }
    }
  }
  useSharedInitial(applyValues);

  const label = price ? `${TARGET_LABELS[targetKind]} → $${money(price)}` : "无解";
  const resultText = () => {
    if (!price || !here) return `定价决策模拟器\n${solved.reason ?? "参数无法倒推出售价"}`;
    return `定价决策模拟器\n总成本 $${money(cost)} · 佣金 ${commission}% · 广告 ${ads}% · 退款 ${refund}%` +
      `${hasBlocks ? ` · ${blocks.length} 个成本模块` : ""}\n` +
      `${TARGET_LABELS[targetKind]}${targetKind === "breakeven" ? "" : ` ${targetValue}${targetKind === "unitProfit" ? "$" : "%"}`} → 售价 $${money(price)}\n` +
      `单件利润 $${money(here.profit)} · 净利率 ${here.margin.toFixed(1)}%` +
      `${here.roi !== null ? ` · ROI ${here.roi.toFixed(0)}%` : ""}\n` +
      `最大广告占比 ${here.maxAdShare.toFixed(1)}%（TACoS 口径）` +
      `${room?.discountPct != null ? ` · 最大折扣 ${room.discountPct.toFixed(1)}%（保本价 $${money(room.breakevenPrice!)}）` : ""}\n` +
      `情景表：\n${rows.map((r) => `· $${money(r.price)} → 利润 $${money(r.profit)}（${r.margin.toFixed(1)}%）`).join("\n")}`;
  };

  return (
    <>
      <ToolPageShell activeId="pricing">
        <section className="param-col">
          <ModelPrefillBanner prefill={prefill} onFill={(v, bs) => { imp.applyModel(v); setBlocks(bs); }} />

          <div className="section-heading"><span><Tag size={15} /> 定价目标</span><em>倒推售价</em></div>
          <div className="field-grid">
            <label className="number-field field-confirmed">
              <span>目标类型</span>
              <div>
                <select className="mt-select" value={targetKind}
                  onChange={(e) => setTargetKind(e.target.value as TargetKind)}>
                  {(Object.keys(TARGET_LABELS) as TargetKind[]).map((k) => (
                    <option key={k} value={k}>{TARGET_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <small className="field-hint">{TARGET_META[targetKind].hint}</small>
            </label>
            {targetKind !== "breakeven" && (
              <NumberField label="目标值" value={targetValue}
                prefix={TARGET_META[targetKind].prefix} suffix={TARGET_META[targetKind].suffix}
                source={src("targetValue")} onChange={(v) => imp.update("targetValue", v)} />
            )}
          </div>

          <div className="section-heading mt-gap"><span><Calculator size={15} /> 成本参数</span><em>{isDemo && <i className="demo-chip">示例数据</i>}<button type="button" className="ph-clear" onClick={clearParams}>清空参数</button>手动填写 · 实时计算</em></div>
          <div className="field-grid">
            <NumberField label="总成本" prefix="$" value={cost} source={src("cost")}
              onChange={(v) => imp.update("cost", v)} hint="采购 + 物流 + 履约合计" />
            <NumberField label="平台佣金" suffix="%" value={commission} source={src("commission")}
              onChange={(v) => imp.update("commission", v)} />
            <NumberField label="广告占比" suffix="%" value={ads} source={src("ads")}
              onChange={(v) => imp.update("ads", v)} hint="占售价，TACoS 口径" />
            <NumberField label="退款损耗" suffix="%" value={refund} source={src("refund")}
              onChange={(v) => imp.update("refund", v)} />
            {/* 欧盟/英国站必填:标价是含税价,这部分要上缴,不是你的收入。
                美国站保持 0,算出来与过去完全一致。 */}
            <NumberField label="销项税率" suffix="%" value={vatRate} source={src("vatRate")}
              onChange={(v) => imp.update("vatRate", v)} />
            {/* 达人佣金:TikTok Shop 等内容电商特有。与平台佣金同口径按售价计 ——
                漏了它倒推出的售价会偏低,而用户是照着这个价去定价的。亚马逊填 0。 */}
            <NumberField label="达人佣金" suffix="%" value={affiliateRate} source={src("affiliateRate")}
              onChange={(v) => imp.update("affiliateRate", v)}
              hint="TikTok Shop 的达人带货分佣,按类目和达人逐个议价;亚马逊没有这一项,填 0" />
          </div>
        </section>

        <section className="result-col">
          <ResultActions resultText={resultText} slug="pricing-calculator" toolId="pricing" shareValues={values}
            onSave={() => hist.save(values, label)} />
          <HistoryStrip items={hist.items} onRestore={applyValues} onClear={hist.clear} isCloud={hist.isCloud} productName={hist.productName}
            render={(v) => {
              let n = 0;
              try { const a = JSON.parse(String(v.blocks ?? "[]")); n = Array.isArray(a) ? a.length : 0; } catch { /* ignore */ }
              return `成本 $${v.cost} · ${TARGET_LABELS[(v.targetKind as TargetKind) ?? "margin"] ?? "目标"}${n ? ` · ${n} 模块` : ""}`;
            }} />

          {!price || !here ? (
            <div className="tool-error"><AlertTriangle size={16} /><span>{solved.reason ?? "参数无法倒推出售价。"}</span></div>
          ) : (
            <>
              <div className={`pv-verdict ${here.profit > 0 ? "pv-win" : "pv-ink"}`}>
                <div className="pv-hero">
                  <div className="pv-lab">倒推售价<em>= 满足目标的可行价</em></div>
                  <div className="pv-big">${money(price)}</div>
                  <span className="pv-chip">{targetKind === "breakeven"
                    ? "保本价 · 利润为 0"
                    : `✓ 满足${TARGET_LABELS[targetKind]} ${targetValue}${targetKind === "unitProfit" ? " 美元" : "%"}`}</span>
                </div>
                <div className="pv-facts">
                  <div className="pv-fact"><span>单件利润</span><b>${money(here.profit)}<em>净利率 {here.margin.toFixed(1)}%{here.roi !== null ? ` · ROI ${here.roi.toFixed(0)}%` : ""}</em></b></div>
                  <div className="pv-fact"><span>最大折扣空间</span><b>{room?.discountPct != null ? `${room.discountPct.toFixed(1)}%` : "—"}<em>{room?.breakevenPrice != null ? `保本价 $${money(room.breakevenPrice)}` : "无保本价"}</em></b></div>
                  <div className="pv-fact"><span>最大广告占比</span><b>{here.maxAdShare.toFixed(1)}%<em>TACoS 口径</em></b></div>
                </div>
              </div>

              <div className="scenario-card">
                <div className="card-title"><span>售价情景阶梯</span><small>把每个价摆到保本线两边看</small></div>
                <ScenarioLadder
                  heads={["净利率", "ROI", "广告≤"]}
                  rows={(() => {
                    const list = rows.map((r) => ({
                      key: String(r.price),
                      label: `$${money(r.price)}`,
                      bar: r.profit,
                      barLabel: `${r.profit >= 0 ? "+" : "−"}$${money(Math.abs(r.profit))}`,
                      stats: [`${r.margin.toFixed(1)}%`, r.roi !== null ? `${r.roi.toFixed(0)}%` : "—", `≤${r.maxAdShare.toFixed(0)}%`],
                      target: Math.abs(r.price - price) < 0.005,
                    }));
                    // 保本价压在地面(bar=0),自然落在红绿之间
                    if (room?.breakevenPrice != null) {
                      list.push({
                        key: "be", label: `$${money(room.breakevenPrice)}`, bar: 0, barLabel: "",
                        stats: ["0.0%", "0%", "≤—"], target: false,
                        sub: "保本价 · 不赔不赚", breakeven: true,
                      } as typeof list[number]);
                    }
                    return list.sort((a, b) => b.bar - a.bar);
                  })()}
                />
                <p className="scenario-note">
                  <Info size={12} />
                  阶梯只回答「这个价对应多少利润」，<b>不预测这个价能卖多少件</b>——需求、转化与竞品价格不在模型里，降价未必带来更多销量。
                </p>
              </div>

              <div className="cost-modules">
                {conflicts.map((c) => (
                  <div className={`conflict-item ${c.level}`} key={c.id}>
                    {c.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
                    <span>{c.text}</span>
                  </div>
                ))}
                {hasBlocks && (
                  <div className="added-blocks">
                    <div className="added-blocks-head"><Layers3 size={15} /> 已添加成本模块<em>{blocks.length}</em></div>
                    {blocks.map((b) => (
                      <BlockCard key={b.id} block={b} price={price}
                        onChange={updateBlock} onRemove={() => removeBlock(b.id)} />
                    ))}
                  </div>
                )}
                {availablePresets.length > 0 && (
                  <div className="add-modules">
                    <div className="add-modules-head"><Plus size={14} />
                      {hasBlocks ? "继续添加成本模块" : "本次尚未计入 · 点击添加更贴近真实经营的成本"}
                    </div>
                    <div className="add-chips">
                      {availablePresets.map((p) => (
                        <button className={`add-chip ${p.kind === "income" ? "income" : ""}`} key={p.key} onClick={() => addPreset(p)}>
                          ＋ {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <Assumption formula="利润 = 售价 × 留存比例 − 固定成本">
            <ul>
              <li><strong>留存比例</strong>= 1 − 佣金% − 广告% − 退款% − 按售价百分比计的成本模块。</li>
              <li><strong>固定成本</strong>= 总成本 + 其余成本模块折算到每件的金额;四种目标都由此解析倒推,与利润计算器<b>同一口径</b>。</li>
              <li><strong>ROI</strong>= 利润 ÷ 自垫成本(采购+物流+固定成本模块);按售价比例计的费用由平台从货款扣除,不计入自垫。</li>
              <li><strong>最大广告占比</strong>是占售价的 TACoS 口径,已扣掉退款与成本模块,比 <SiteLink href="/crossborder/tools/acos-break-even">ACoS 工具</SiteLink>的保本 ACoS 更严格。</li>
              <li>佣金按售价线性计,未含阶梯/最低佣金与优惠券手续费。<b>本工具只给财务可行区间,不承诺「最优价」。</b></li>
            </ul>
          </Assumption>
        </section>
      </ToolPageShell>
    </>
  );
}
