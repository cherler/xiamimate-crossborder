"use client";

/**
 * 计费重与包装优化器。
 * 承运商规则（除数 / 尺寸取整 / 重量进位 / 最低计费重）决定真实计费重，
 * 引擎把每一步多算的 kg 单独归因，回答「为什么账单比我算的高」。
 * 包装方案 A/B 对比给出省下的计费重与运费。
 *
 * 预设规则是常见档位、不是实时资费，全部可手动覆盖；以承运商当期资费为准。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Box, Calculator, Info } from "lucide-react";
import { ToolPageShell, NumberField, SelectField, Assumption, money, useToolImport } from "../tool-kit";
import {
  ResultActions, HistoryStrip, useToolHistory, useSharedInitial, type ToolValues,
} from "../tool-actions";
import {
  CARRIER_RULES, ruleByKey, billsBySizeTier, chargeableWeight, comparePacking, detectPackIssues,
  type RoundMode,
} from "../../../../lib/crossborder/dim-weight-rules";



const ROUND_LABEL: Record<RoundMode, string> = { none: "不取整", up: "向上取整", nearest: "四舍五入" };

export function DimWeightCalculator() {
  const [length, setLength] = useState(30);
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(15);
  const [actual, setActual] = useState(1.2);
  const [carrier, setCarrier] = useState("express_5000");
  /**
   * 输入单位。
   *
   * 字段一直标着 cm / kg,而承运商预设里就有「Amazon FBA 美国」——
   * 亚马逊后台给的是**英寸和磅**。用户照抄 12×8×6 in 填进 cm 字段,
   * 算出计费重 1.5 kg;换算成 30.5×20.3×15.2 cm 的真值是 2.0 kg,低估 25%,
   * 而页面不会给任何提示。这是最容易踩、也最不容易发现的一种错。
   */
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const toCm = (v: number) => (unit === "imperial" ? v * 2.54 : v);
  const toKg = (v: number) => (unit === "imperial" ? v * 0.45359237 : v);
  const dimUnit = unit === "imperial" ? "in" : "cm";
  const wtUnit = unit === "imperial" ? "lb" : "kg";

  // 规则可手动覆盖：预设只是起点。
  const preset = ruleByKey(carrier);
  const [divisor, setDivisor] = useState(preset.divisor);
  const [weightStep, setWeightStep] = useState(preset.weightStep);
  const [minChargeable, setMinChargeable] = useState(preset.minChargeable);
  const [dimRound, setDimRound] = useState<RoundMode>(preset.dimRound);

  // 包装方案 B（选填）
  const [bLength, setBLength] = useState(30);
  const [bWidth, setBWidth] = useState(20);
  const [bHeight, setBHeight] = useState(11);
  const [rate, setRate] = useState(5);
  const [monthlyUnits, setMonthlyUnits] = useState(1000);
  // 逐字段的示例默认值 —— 总标记只在全部相等时才亮,用户一改其中一项它就消失,
  // 而其余字段仍是我们预填的示例值,却渲染成一套看着像用户自己的数据。
  const DEFAULTS: Record<string, number> = { length: 30, width: 20, height: 15, actual: 1.2, bLength: 30, bWidth: 20, bHeight: 11, rate: 5, monthlyUnits: 1000 };
  const live: Record<string, number> = { length, width, height, actual, bLength, bWidth, bHeight, rate, monthlyUnits };
  const src = (k: string) => imp.sourceOf(k, live[k] === DEFAULTS[k]);
  const isDemo = length === 30 && width === 20 && height === 15 && actual === 1.2 && bLength === 30 && bWidth === 20 && bHeight === 11 && rate === 5 && monthlyUnits === 1000;
  const clearParams = () => { setLength(0); setWidth(0); setHeight(0); setActual(0); setBLength(0); setBWidth(0); setBHeight(0); setRate(0); setMonthlyUnits(0); imp.markAllTouched(Object.keys(DEFAULTS)); };

  const imp = useToolImport({ length: setLength, width: setWidth, height: setHeight, actual: setActual, rate: setRate }, "dimweight");
  const hist = useToolHistory("dimweight");

  function pickCarrier(key: string) {
    const r = ruleByKey(key);
    setCarrier(key);
    setDivisor(r.divisor);
    setWeightStep(r.weightStep);
    setMinChargeable(r.minChargeable);
    setDimRound(r.dimRound);
  }

  const rule = useMemo(
    () => ({ ...ruleByKey(carrier), divisor, weightStep, minChargeable, dimRound }),
    [carrier, divisor, weightStep, minChargeable, dimRound],
  );
  // 引擎一律吃公制:换算在进入引擎前一次做完,规则表与测试都不必知道单位这回事。
  const packA = useMemo(() => ({ length: toCm(length), width: toCm(width), height: toCm(height), actual: toKg(actual) }),
    [length, width, height, actual, unit]);
  const packB = useMemo(() => ({ length: toCm(bLength), width: toCm(bWidth), height: toCm(bHeight), actual: toKg(actual) }),
    [bLength, bWidth, bHeight, actual, unit]);

  const r = useMemo(() => chargeableWeight(packA, rule), [packA, rule]);
  const changed = bLength !== length || bWidth !== width || bHeight !== height;
  const cmp = useMemo(
    () => (changed ? comparePacking(packA, packB, rule, rate, monthlyUnits) : null),
    [changed, packA, packB, rule, rate, monthlyUnits],
  );
  // 传原始输入(用户填的那组数)去做单位似真性判断 —— packA 已经换算成公制了
  const issues = useMemo(
    () => detectPackIssues(rule, r, cmp,
      unit === "metric" ? { length, width, height, actual } : undefined),
    [rule, r, cmp, unit, length, width, height, actual]);
  const byTier = billsBySizeTier(rule);

  const values: ToolValues = {
    length, width, height, actual, carrier, divisor, weightStep, minChargeable, dimRound,
    bLength, bWidth, bHeight, rate, monthlyUnits,
  };
  function applyValues(v: ToolValues) {
    if (v.length != null) setLength(Number(v.length));
    if (v.width != null) setWidth(Number(v.width));
    if (v.height != null) setHeight(Number(v.height));
    if (v.actual != null) setActual(Number(v.actual));
    if (typeof v.carrier === "string") setCarrier(v.carrier);
    // 规则值可能被手动改过，直接还原快照里的值，不要用预设覆盖。
    if (v.divisor != null) setDivisor(Number(v.divisor));
    if (v.weightStep != null) setWeightStep(Number(v.weightStep));
    if (v.minChargeable != null) setMinChargeable(Number(v.minChargeable));
    if (typeof v.dimRound === "string" && v.dimRound in ROUND_LABEL) setDimRound(v.dimRound as RoundMode);
    if (v.bLength != null) setBLength(Number(v.bLength));
    if (v.bWidth != null) setBWidth(Number(v.bWidth));
    if (v.bHeight != null) setBHeight(Number(v.bHeight));
    if (v.rate != null) setRate(Number(v.rate));
    if (v.monthlyUnits != null) setMonthlyUnits(Number(v.monthlyUnits));
  }
  useSharedInitial(applyValues);

  const label = `${length}×${width}×${height} · 计费重 ${money(r.chargeable)}kg`;
  const resultText = () =>
    `计费重与包装优化器\n${rule.name} · 除数 ${divisor} · ${ROUND_LABEL[dimRound]} · 进位 ${weightStep}kg · 最低 ${minChargeable}kg\n` +
    `尺寸 ${length}×${width}×${height} cm · 实重 ${money(actual)} kg\n` +
    `体积重 ${money(r.volumetric)} kg · 计费重 ${money(r.chargeable)} kg（${r.useVolumetric ? "抛货" : "重货"}）` +
    `${r.bumpedByStep > 0.001 ? ` · 进位多算 ${r.bumpedByStep.toFixed(3)}kg` : ""}` +
    `${r.bumpedByMin > 0.001 ? ` · 最低计费重多算 ${r.bumpedByMin.toFixed(3)}kg` : ""}\n` +
    (cmp
      ? `方案 B ${bLength}×${bWidth}×${bHeight} → 计费重 ${money(cmp.b.chargeable)} kg，省 ${money(cmp.savedKg)} kg` +
        `${cmp.savedPerUnit !== null ? `，每箱省 $${money(cmp.savedPerUnit)}，月省 $${money(cmp.savedPerMonth!)}` : "（分档计费，不折算金额）"}`
      : "未设置对比包装方案。");

  return (
    <>
      <ToolPageShell activeId="dimweight">
        <section className="param-col">
          <div className="section-heading"><span><Box size={15} /> 包装与承运商</span><em>{isDemo && <i className="demo-chip">示例数据</i>}<button type="button" className="ph-clear" onClick={clearParams}>清空参数</button>手动填写 · 实时计算</em></div>
          <div className="field-grid">
            <label className="number-field field-confirmed">
              <span>输入单位</span>
              <div>
                <select className="mt-select" value={unit}
                  onChange={(e) => setUnit(e.target.value as "metric" | "imperial")}>
                  <option value="metric">厘米 / 千克(cm · kg)</option>
                  <option value="imperial">英寸 / 磅(in · lb) —— 亚马逊后台口径</option>
                </select>
              </div>
            </label>
            <NumberField label="长 L" suffix={dimUnit} value={length} source={src("length")} onChange={(v) => imp.update("length", v)} />
            <NumberField label="宽 W" suffix={dimUnit} value={width} source={src("width")} onChange={(v) => imp.update("width", v)} />
            <NumberField label="高 H" suffix={dimUnit} value={height} source={src("height")} onChange={(v) => imp.update("height", v)} />
            <NumberField label="实重" suffix={wtUnit} value={actual} source={src("actual")} onChange={(v) => imp.update("actual", v)} />
            <label className="number-field field-confirmed">
              <span>承运商规则</span>
              <div>
                <select className="mt-select" value={carrier} onChange={(e) => pickCarrier(e.target.value)}>
                  {CARRIER_RULES.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </div>
              <small className="field-hint">常见档位 · 可逐项改</small>
            </label>
          </div>

          <div className="rule-note">
            <Info size={12} />
            <span>{rule.note}<br /><b>{rule.source}</b>（本表录入 {rule.updated}）</span>
          </div>

          <div className="section-heading mt-gap"><span><Calculator size={15} /> 计费规则</span><em>以承运商资费为准</em></div>
          <div className="field-grid">
            <NumberField label="体积重除数" value={divisor} onChange={setDivisor} hint="L×W×H ÷ 除数" />
            <SelectField label="尺寸取整" value={dimRound === "none" ? 0 : dimRound === "up" ? 1 : 2}
              onChange={(v) => setDimRound(v === 0 ? "none" : v === 1 ? "up" : "nearest")}
              options={[{ value: 0, label: "不取整" }, { value: 1, label: "向上取整" }, { value: 2, label: "四舍五入" }]} />
            <NumberField label="重量进位" suffix="kg" value={weightStep} onChange={setWeightStep} hint="0 = 不进位" />
            <NumberField label="最低计费重" suffix="kg" value={minChargeable} onChange={setMinChargeable} />
          </div>

          <div className="section-heading mt-gap"><span><Box size={15} /> 包装方案 B</span><em>选填 · 对比省多少</em></div>
          <div className="field-grid">
            <NumberField label="B 长" suffix="cm" value={bLength} onChange={setBLength} />
            <NumberField label="B 宽" suffix="cm" value={bWidth} onChange={setBWidth} />
            <NumberField label="B 高" suffix="cm" value={bHeight} onChange={setBHeight} />
            <NumberField label="运费单价" prefix="$" value={rate} source={src("rate")}
              onChange={(v) => imp.update("rate", v)} hint="每 kg" />
            <NumberField label="月发货量" value={monthlyUnits} onChange={setMonthlyUnits} hint="箱 / 月" />
          </div>
        </section>

        <section className="result-col">
          <ResultActions resultText={resultText} slug="dimensional-weight" toolId="dimweight" shareValues={values}
            onSave={() => hist.save(values, label)} />
          <HistoryStrip items={hist.items} onRestore={applyValues} onClear={hist.clear} isCloud={hist.isCloud} productName={hist.productName}
            render={(v) => `${v.length}×${v.width}×${v.height} · ${v.actual}kg`} />

          <div className="tool-caveat">
            <AlertTriangle size={15} />
            <span>预设为<b>常见档位，不是实时资费</b>；各承运商对尺寸取整、超长/超围、偏远附加费的处理不同，平台也可能以自己复测的尺寸重量为准。以你的<b>承运商当期资费 / 代理合同价</b>为准，规则可逐项改。</span>
          </div>

          <div className="pv-verdict pv-ink">
            <div className="pv-hero">
              <div className="pv-lab">计费重<em>= 承运商按这个数收钱</em></div>
              <div className="pv-big">{money(r.chargeable)}<small> kg</small></div>
              <span className="pv-chip">{r.useVolumetric ? "按体积重计费 · 抛货" : "按实重计费 · 重货"}</span>
            </div>
            <div className="pv-facts">
              <div className="pv-fact"><span>体积重</span><b>{money(r.volumetric)} kg<em>{r.dims.length}×{r.dims.width}×{r.dims.height} ÷ {divisor}</em></b></div>
              <div className="pv-fact"><span>实重</span><b>{money(actual)} kg<em>包裹称重</em></b></div>
              <div className="pv-fact"><span>取大者</span><b>{money(r.rawChargeable)} kg<em>进位 / 最低计费前</em></b></div>
            </div>
          </div>

          {(() => {
            // 签名件:取大对比 —— 体积重 vs 实重两根条,谁大按谁计费,抛货/重货一眼见。
            const maxW = Math.max(r.volumetric, actual, 0.001);
            const bar = (v: number) => `${Math.max(3, (v / maxW) * 100)}%`;
            return (
              <div className="duel">
                <div className="duel-head"><b>谁说了算 · 体积重 vs 实重</b><span>承运商取较大者计费</span></div>
                <div className={`duel-row${r.useVolumetric ? " win" : ""}`}>
                  <span className="dl">体积重</span>
                  <div className="dtrack"><i className="dseg" style={{ width: bar(r.volumetric) }} /></div>
                  <span className="damt">{money(r.volumetric)} kg{r.useVolumetric && <span className="dtag">计费基准</span>}</span>
                </div>
                <div className={`duel-row${!r.useVolumetric ? " win" : ""}`}>
                  <span className="dl">实重</span>
                  <div className="dtrack"><i className="dseg" style={{ width: bar(actual) }} /></div>
                  <span className="damt">{money(actual)} kg{!r.useVolumetric && <span className="dtag">计费基准</span>}</span>
                </div>
                <p className="duel-note">
                  体积重 = {r.dims.length}×{r.dims.width}×{r.dims.height} ÷ {divisor} = {money(r.volumetric)} kg。
                  {r.useVolumetric
                    ? "体积重更大,是「抛货」—— 压缩包装尺寸可直接省运费。"
                    : "实重更大,是「重货」—— 减重比缩尺寸更有用。"}
                </p>
              </div>
            );
          })()}

          {(r.bumpedByStep > 0.001 || r.bumpedByMin > 0.001) && (
            <div className="bump-card">
              <div className="card-title"><span>账单为什么比算出来的高</span><small>逐步归因</small></div>
              <div className="impact-row"><span>取大者（实重 vs 体积重）</span><b>{money(r.rawChargeable)} kg</b></div>
              {r.bumpedByStep > 0.001 && (
                <div className="impact-row"><span>{weightStep}kg 进位</span><b className="neg">+{r.bumpedByStep.toFixed(3)} kg</b></div>
              )}
              {r.bumpedByMin > 0.001 && (
                <div className="impact-row"><span>最低计费重 {minChargeable}kg</span><b className="neg">+{r.bumpedByMin.toFixed(3)} kg</b></div>
              )}
              <div className="impact-row total"><span>最终计费重</span><b>{money(r.chargeable)} kg</b></div>
            </div>
          )}

          {cmp && (
            <div className="scenario-card">
              <div className="card-title"><span>包装方案对比</span><small>A → B</small></div>
              <div className="scenario-table" role="table">
                <div className="scenario-row pack-row scenario-head" role="row">
                  <span>方案</span><span>尺寸</span><span>体积重</span><span>计费重</span>
                </div>
                <div className="scenario-row pack-row" role="row">
                  <span>A</span><span>{length}×{width}×{height}</span>
                  <span>{money(cmp.a.volumetric)} kg</span><b>{money(cmp.a.chargeable)} kg</b>
                </div>
                <div className="scenario-row pack-row is-target" role="row">
                  <span>B</span><span>{bLength}×{bWidth}×{bHeight}</span>
                  <span>{money(cmp.b.volumetric)} kg</span>
                  <b className={cmp.savedKg > 0 ? "pos" : cmp.savedKg < 0 ? "neg" : ""}>{money(cmp.b.chargeable)} kg</b>
                </div>
              </div>
              <div className="pack-save">
                <div><small>每箱省计费重</small><strong className={cmp.savedKg > 0 ? "pos" : cmp.savedKg < 0 ? "neg" : ""}>{money(cmp.savedKg)} kg</strong></div>
                <div><small>每箱省运费</small><strong>{cmp.savedPerUnit !== null ? `$${money(cmp.savedPerUnit)}` : "—"}</strong></div>
                <div><small>月省（{monthlyUnits} 箱）</small><strong>{cmp.savedPerMonth !== null ? `$${money(cmp.savedPerMonth)}` : "—"}</strong></div>
              </div>
              {byTier && (
                <p className="scenario-note">
                  <Info size={12} />
                  {rule.name} <b>按尺寸分档收费</b>，省下的重量不会线性变成省下的钱，故不折算金额——降一档才省钱。
                </p>
              )}
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

          <Assumption formula="体积重 = 长 × 宽 × 高 ÷ 除数(cm → kg)   计费重 = max(体积重, 实重),按步长进位">
            <ul>
              <li>承运商按体积重与实重中的<strong>较大者</strong>计费,再按步长进位、并不低于最低计费重。</li>
              <li>体积重更大说明是「抛货」,压缩包装可省运费;<b>三步中每一步多算了多少,上方逐条列出</b>。</li>
              <li>预设规则为行业常见档位、<b>非从各承运商资费表实时同步</b>;资费会变、合同价口径也不同,每项都可手动覆盖。</li>
              <li>Amazon FBA <b>按尺寸分档收固定档位费,不是「计费重 × 单价」</b>;此时计费重只用于判断档位,本工具不替它折算金额。</li>
              <li>压缩包装的破损率、退货率与换包材投入不在模型内。</li>
            </ul>
          </Assumption>

        </section>
      </ToolPageShell>
    </>
  );
}
