"use client";
import {sitePath} from "../../../../lib/site";
import { SiteLink } from "../../../site-link";


/**
 * 进口到岸成本估算器。
 * 三口径：现金到岸（掏多少钱）/ 经济到岸（扣掉可抵扣 VAT 后的真实成本）/ 单件到岸（可填进利润计算器）。
 *
 * 税率一律用户自填 —— HS 归类是判断题，猜一个编码再给税率等于给出精确的错误。
 * 本工具只给结构与算法，不代查税率、不承诺覆盖各国规则。
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, Globe2, Info, Plus, Trash2 } from "lucide-react";
import { ToolPageShell, NumberField, SelectField, Assumption, money, useToolImport } from "../tool-kit";
import { defaultModel, readProductModel, writeProductModel } from "../../../../lib/crossborder/product-model";
import {
  ResultActions, HistoryStrip, useToolHistory, useSharedInitial, type ToolValues,
} from "../tool-actions";
import {
  INCOTERMS, FEE_PRESETS, TARIFF_SOURCES, feeFromPreset, calculateLandedModel, targetPrice,
  compareLanded, detectLandedIssues, type Incoterm, type LandedFee, type LandedInput,
} from "../../../../lib/crossborder/landed-model";



const INCOTERM_KEYS = Object.keys(INCOTERMS) as Incoterm[];

function FeeRow({ fee, onChange, onRemove }: {
  fee: LandedFee; onChange: (f: LandedFee) => void; onRemove: () => void;
}) {
  return (
    <div className="fee-row">
      <input className="fee-name" value={fee.name} aria-label="费用名称"
        onChange={(e) => onChange({ ...fee, name: e.target.value })} />
      <input className="fee-amt" type="number" value={Number.isFinite(fee.amount) ? fee.amount : ""} aria-label="金额"
        onChange={(e) => onChange({ ...fee, amount: Number(e.target.value) })} />
      <select className="mt-select" value={fee.basis} aria-label="计费口径"
        onChange={(e) => onChange({ ...fee, basis: e.target.value as LandedFee["basis"] })}>
        <option value="batch">批次总额</option>
        <option value="per_unit">每件</option>
      </select>
      <label className="fee-dutiable" title="计入完税价的费用要为其缴纳关税与 VAT">
        <input type="checkbox" checked={fee.dutiable}
          onChange={(e) => onChange({ ...fee, dutiable: e.target.checked })} />
        <span>计入完税价</span>
      </label>
      <button onClick={onRemove} aria-label={`删除 ${fee.name}`}><Trash2 size={12} /></button>
    </div>
  );
}

export function LandedCalculator() {
  const [unitCost, setUnitCost] = useState(50);
  const [units, setUnits] = useState(500);
  const [fx, setFx] = useState(0.14);
  const [dutyRate, setDutyRate] = useState(5);
  const [vatRate, setVatRate] = useState(20);
  const [vatReclaimable, setVatReclaimable] = useState(false);
  const [incoterm, setIncoterm] = useState<Incoterm>("FOB");
  const [margin, setMargin] = useState(30);
  // 逐字段的示例默认值 —— 总标记只在全部相等时才亮,用户一改其中一项它就消失,
  // 而其余字段仍是我们预填的示例值,却渲染成一套看着像用户自己的数据。
  const DEFAULTS: Record<string, number> = { unitCost: 50, units: 500, fx: 0.14, dutyRate: 5, vatRate: 20, margin: 30 };
  const live: Record<string, number> = { unitCost, units, fx, dutyRate, vatRate, margin };
  const src = (k: string) => imp.sourceOf(k, live[k] === DEFAULTS[k]);
  const isDemo = unitCost === 50 && units === 500 && fx === 0.14 && dutyRate === 5 && vatRate === 20 && margin === 30;
  const clearParams = () => { setUnitCost(0); setUnits(0); setFx(0); setDutyRate(0); setVatRate(0); setMargin(0); imp.markAllTouched(Object.keys(DEFAULTS)); };
  const [fees, setFees] = useState<LandedFee[]>([
    { id: "freight-0-1", name: "国际运费", amount: 4000, basis: "batch", dutiable: true },
    { id: "customs-0-2", name: "清关 / 报关代理费", amount: 800, basis: "batch", dutiable: false },
  ]);

  // 情景 B（选填覆盖项）
  const [cmpOn, setCmpOn] = useState(false);
  const [bUnitCost, setBUnitCost] = useState(55);
  const [bDutyRate, setBDutyRate] = useState(0);
  const [bVatReclaimable, setBVatReclaimable] = useState(false);
  const [bIncoterm, setBIncoterm] = useState<Incoterm>("FOB");

  const imp = useToolImport({ unitCost: setUnitCost, units: setUnits, fx: setFx, dutyRate: setDutyRate, vatRate: setVatRate, margin: setMargin }, "landed");
  const hist = useToolHistory("landed");

  const input: LandedInput = useMemo(
    () => ({ unitCost, units, fees, fx, dutyRate, vatRate, vatReclaimable, incoterm }),
    [unitCost, units, fees, fx, dutyRate, vatRate, vatReclaimable, incoterm],
  );
  const r = useMemo(() => calculateLandedModel(input), [input]);
  const price = useMemo(() => targetPrice(r.perUnitLanded, margin), [r.perUnitLanded, margin]);
  const issues = useMemo(() => detectLandedIssues(input, r), [input, r]);
  const diff = useMemo(
    () => (cmpOn ? compareLanded(input, { ...input, unitCost: bUnitCost, dutyRate: bDutyRate, vatReclaimable: bVatReclaimable, incoterm: bIncoterm }) : null),
    [cmpOn, input, bUnitCost, bDutyRate, bVatReclaimable, bIncoterm],
  );

  const addFee = (key: string) => {
    const p = FEE_PRESETS.find((x) => x.key === key);
    if (p) setFees((fs) => [...fs, feeFromPreset(p)]);
  };
  const updateFee = (next: LandedFee) => setFees((fs) => fs.map((f) => (f.id === next.id ? next : f)));
  const removeFee = (id: string) => setFees((fs) => fs.filter((f) => f.id !== id));

  const values: ToolValues = {
    unitCost, units, fx, dutyRate, vatRate, vatReclaimable: vatReclaimable ? 1 : 0, incoterm, margin,
    mv: 2, fees: JSON.stringify(fees),
  };
  function applyValues(v: ToolValues) {
    // mv=2 是本版快照；旧链接是 {cost, head, fx, duty, vat, margin} 的单件口径，也要能还原。
    if (v.mv == null && v.cost != null) {
      setUnitCost(Number(v.cost));
      setUnits(1);
      setFees(v.head != null ? [{ id: "freight-legacy-1", name: "头程运费", amount: Number(v.head), basis: "batch", dutiable: true }] : []);
      if (v.duty != null) setDutyRate(Number(v.duty));
      if (v.vat != null) setVatRate(Number(v.vat));
      if (v.fx != null) setFx(Number(v.fx));
      if (v.margin != null) setMargin(Number(v.margin));
      return;
    }
    if (v.unitCost != null) setUnitCost(Number(v.unitCost));
    if (v.units != null) setUnits(Number(v.units));
    if (v.fx != null) setFx(Number(v.fx));
    if (v.dutyRate != null) setDutyRate(Number(v.dutyRate));
    if (v.vatRate != null) setVatRate(Number(v.vatRate));
    if (v.vatReclaimable != null) setVatReclaimable(Number(v.vatReclaimable) === 1);
    if (typeof v.incoterm === "string" && v.incoterm in INCOTERMS) setIncoterm(v.incoterm as Incoterm);
    if (v.margin != null) setMargin(Number(v.margin));
    if (typeof v.fees === "string") {
      try {
        const arr = JSON.parse(v.fees);
        if (Array.isArray(arr)) setFees(arr as LandedFee[]);
      } catch { /* 忽略损坏的快照 */ }
    }
  }
  useSharedInitial(applyValues);

  const label = `${units} 件 · 单件到岸 ${money(r.perUnitLanded)}`;
  const resultText = () =>
    `进口到岸成本估算\n${INCOTERMS[incoterm].label} · ${units} 件 × ${money(unitCost)}（本币）· 汇率 ${fx} · 关税 ${dutyRate}% · VAT ${vatRate}%${vatReclaimable ? "（可抵扣）" : ""}\n` +
    `完税价 ${money(r.customsValue)} · 关税 ${money(r.dutyAmount)} · VAT ${money(r.vatAmount)}\n` +
    `现金到岸 ${money(r.cashLanded)} · 经济到岸 ${money(r.economicLanded)} · 单件到岸 ${money(r.perUnitLanded)}\n` +
    `目标售价 ${price !== null ? money(price) : "—"}（留 ${margin}% 净利，未扣平台佣金与广告）`;

  return (
    <>
      <ToolPageShell activeId="landed">
        <section className="param-col">
          <div className="section-heading"><span><Globe2 size={15} /> 货物与批次</span><em>{isDemo && <i className="demo-chip">示例数据</i>}<button type="button" className="ph-clear" onClick={clearParams}>清空参数</button>手动填写 · 实时计算</em></div>
          <div className="field-grid">
            <NumberField label="单件采购价" value={unitCost} source={src("unitCost")} onChange={(v) => imp.update("unitCost", v)} hint="本币（如人民币）" />
            <NumberField label="批次件数" value={units} source={src("units")} onChange={(v) => imp.update("units", v)} hint="分摊依据" />
            <NumberField label="汇率" value={fx} source={src("fx")} onChange={(v) => imp.update("fx", v)} hint="1 本币 = ? 目标币" />
            <label className="number-field field-confirmed">
              <span>贸易术语</span>
              <div>
                <select className="mt-select" value={incoterm} onChange={(e) => setIncoterm(e.target.value as Incoterm)}>
                  {INCOTERM_KEYS.map((k) => <option key={k} value={k}>{INCOTERMS[k].label}</option>)}
                </select>
              </div>
              <small className="field-hint">决定谁付运保费与进口税</small>
            </label>
          </div>
          <div className="rule-note">
            <Info size={12} /><span>{INCOTERMS[incoterm].note}</span>
          </div>

          <div className="section-heading mt-gap"><span><Calculator size={15} /> 税率</span><em>自行填写 · 以海关为准</em></div>
          <div className="field-grid">
            <NumberField label="关税率" suffix="%" value={dutyRate} source={src("dutyRate")} onChange={(v) => imp.update("dutyRate", v)} />
            <NumberField label="VAT / GST" suffix="%" value={vatRate} source={src("vatRate")} onChange={(v) => imp.update("vatRate", v)} />
            <SelectField label="VAT 是否可抵扣" value={vatReclaimable ? 1 : 0} onChange={(v) => setVatReclaimable(v === 1)}
              hint="可抵扣则不计入经济成本" options={[{ value: 0, label: "不可抵扣" }, { value: 1, label: "可抵扣" }]} />
            <NumberField label="目标净利率" suffix="%" value={margin} source={src("margin")} onChange={(v) => imp.update("margin", v)} />
          </div>
          <div className="rule-note">
            <Info size={12} />
            <span>
              税率请自行查询填写，本工具不代查：
              {TARIFF_SOURCES.map((s, i) => (
                <span key={s.region}>{i > 0 && "、"}<SiteLink href={s.url} target="_blank" rel="noopener noreferrer">{s.region} {s.name}</SiteLink></span>
              ))}
              。<b>HS 归类是判断题</b>，同一商品按材质 / 用途可归到不同编码、税率差数倍，请以报关行与目的国海关裁定为准。
            </span>
          </div>

          <div className="section-heading mt-gap"><span><Plus size={15} /> 费用</span><em>勾选是否计入完税价</em></div>
          <div className="fee-table">
            {fees.map((f) => <FeeRow key={f.id} fee={f} onChange={updateFee} onRemove={() => removeFee(f.id)} />)}
            {fees.length === 0 && <div className="fee-empty">尚未添加费用 —— 保险、清关、港口、银行手续费都会进到岸成本。</div>}
          </div>
          <div className="add-chips">
            {FEE_PRESETS.map((p) => (
              <button className="add-chip" key={p.key} onClick={() => addFee(p.key)} title={p.hint}>＋ {p.name}</button>
            ))}
          </div>

          <div className="section-heading mt-gap"><span><Globe2 size={15} /> 情景对比</span>
            <em>
              <label className="cmp-toggle">
                <input type="checkbox" checked={cmpOn} onChange={(e) => setCmpOn(e.target.checked)} /> 启用
              </label>
            </em>
          </div>
          {cmpOn && (
            <div className="field-grid">
              <NumberField label="B 单件采购价" value={bUnitCost} onChange={setBUnitCost} hint="如换越南供应商" />
              <NumberField label="B 关税率" suffix="%" value={bDutyRate} onChange={setBDutyRate} />
              <SelectField label="B VAT 可抵扣" value={bVatReclaimable ? 1 : 0} onChange={(v) => setBVatReclaimable(v === 1)}
                options={[{ value: 0, label: "不可抵扣" }, { value: 1, label: "可抵扣" }]} />
              <label className="number-field field-confirmed">
                <span>B 贸易术语</span>
                <div>
                  <select className="mt-select" value={bIncoterm} onChange={(e) => setBIncoterm(e.target.value as Incoterm)}>
                    {INCOTERM_KEYS.map((k) => <option key={k} value={k}>{INCOTERMS[k].label}</option>)}
                  </select>
                </div>
              </label>
            </div>
          )}
        </section>

        <section className="result-col">
          <ResultActions resultText={resultText} slug="landed-cost" toolId="landed" shareValues={values}
            onSave={() => hist.save(values, label)} />
          <HistoryStrip items={hist.items} onRestore={applyValues} onClear={hist.clear} isCloud={hist.isCloud} productName={hist.productName}
            render={(v) => `${v.units ?? 1} 件 · 单价 ${v.unitCost ?? v.cost}`} />

          <div className="tool-caveat">
            <AlertTriangle size={15} />
            <span><b>基础估算</b>：税率与 HS 归类由你填写，本工具不代查、不承诺覆盖各国规则；反倾销/特别关税、配额、原产地规则与最低起征额均未建模。结果仅供估算，以海关与报关行为准。</span>
          </div>

          <div className="pv-verdict pv-ink">
            <div className="pv-hero">
              <div className="pv-lab">单件到岸成本<em>= 可填进利润计算器的「采购成本」</em></div>
              <div className="pv-big">{money(r.perUnitLanded)}</div>
              <span className="pv-chip">经济到岸 ÷ {units} 件 · 目标币</span>
            </div>
            <div className="pv-facts">
              <div className="pv-fact"><span>现金到岸 · 全批</span><b>{money(r.cashLanded)}<em>{units} 件要掏的钱</em></b></div>
              <div className="pv-fact"><span>经济到岸</span><b>{money(r.economicLanded)}<em>{r.vatReclaim > 0 ? `已扣可抵 VAT ${money(r.vatReclaim)}` : "VAT 不可抵 · 同现金"}</em></b></div>
              <div className="pv-fact"><span>目标售价 · 留 {margin}%</span><b>{price !== null ? money(price) : "—"}<em>{price !== null ? "未含佣金广告" : "净利率≥100% 无解"}</em></b></div>
            </div>
          </div>

          {(() => {
            // 签名件:成本堆叠瀑布 —— 从完税价一级级加到现金到岸,钱是怎么堆上去的一眼看完。
            const cash = r.cashLanded;
            if (!(cash > 0)) return null;
            const steps = [
              { label: "完税价", amount: r.customsValue },
              { label: r.sellerPaysImportTax ? "＋关税 · DDP 已含" : `＋关税 ${dutyRate}%`, amount: r.dutyAmount },
              { label: r.sellerPaysImportTax ? "＋VAT · DDP 已含" : `＋VAT ${vatRate}%`, amount: r.vatAmount },
              { label: "＋不计入完税价的费用", amount: r.otherFeesLocal * fx },
            ].filter((s) => s.amount > 0.005 || s.label === "完税价");
            let cum = 0;
            const rowsW = steps.map((s) => {
              const w = (s.amount / cash) * 100;
              const left = Math.min(cum, 100);
              cum += w;
              return { ...s, left, width: Math.min(w, Math.max(0, 100 - left)) };
            });
            const econPct = (r.economicLanded / cash) * 100;
            return (
              <div className="pfall">
                <div className="pfall-head"><b>钱是怎么堆上去的 · 到岸成本构成</b><span>目标币 · 批次 · 条形按占现金到岸比例</span></div>
                {rowsW.map((s) => (
                  <div className="pfall-row" key={s.label}>
                    <span className="pf-l">{s.label}</span>
                    <div className="pf-track">
                      <i className="pf-seg pf-cost" style={{ left: `${s.left}%`, width: `${s.width}%` }} />
                      <i className="pf-bridge" style={{ left: `${Math.min(s.left + s.width, 100)}%` }} />
                    </div>
                    <span className="pf-amt">{money(s.amount)}<small>{((s.amount / cash) * 100).toFixed(1)}%</small></span>
                  </div>
                ))}
                <div className="pfall-row pf-total">
                  <span className="pf-l">= 现金到岸</span>
                  <div className="pf-track"><i className="pf-seg pf-rev" style={{ left: 0, width: "100%" }} /></div>
                  <span className="pf-amt" style={{ color: "#16212c" }}>{money(cash)}<small>100%</small></span>
                </div>
                {r.vatReclaim > 0 && (
                  <>
                    <div className="pfall-row">
                      <span className="pf-l">−可抵扣 VAT 退回</span>
                      <div className="pf-track"><i className="pf-seg pf-win" style={{ left: `${Math.max(0, econPct)}%`, width: `${Math.min(100 - Math.max(0, econPct), (r.vatReclaim / cash) * 100)}%` }} /></div>
                      <span className="pf-amt" style={{ color: "var(--green)" }}>−{money(r.vatReclaim)}<small>{((r.vatReclaim / cash) * 100).toFixed(1)}%</small></span>
                    </div>
                    <div className="pfall-row pf-total">
                      <span className="pf-l">= 经济到岸</span>
                      <div className="pf-track"><i className="pf-seg pf-rev" style={{ left: 0, width: `${Math.max(0, Math.min(100, econPct))}%` }} /></div>
                      <span className="pf-amt" style={{ color: "#16212c" }}>{money(r.economicLanded)}<small>{econPct.toFixed(1)}%</small></span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          <div className="acos-card">
            <div className="acos-head">
              <span><Calculator size={14} /> 接下来</span>
              <button type="button" className="landed-fill" onClick={() => {
                // 回填链:单件到岸 → 当前商品的「采购成本」。到岸价已含运保与税,
                // 为防重复计费,同时清零利润页的国内运费与头程(尾程/FBA 是目的国费用,保留)。
                const perUnit = Number(r.perUnitLanded.toFixed(4));
                if (!Number.isFinite(perUnit) || perUnit <= 0) return;
                const ok = window.confirm(
                  `把单件到岸 ${money(r.perUnitLanded)} 填入当前商品的「采购成本」?\n\n` +
                  `注意口径:到岸价已含国际运保费与税,将同时把利润页的「国内运费」「头程运费」清零,避免重复计费;「尾程/FBA」保留。`);
                if (!ok) return;
                const m = readProductModel() ?? defaultModel();
                writeProductModel({ ...m, cost: perUnit, domestic: 0, head: 0, updatedAt: Date.now() });
                window.location.assign(sitePath("/crossborder/tools/profit-calculator/"));
              }}>
                填入利润计算器 →
              </button>
            </div>
            <div className="acos-row two">
              <div><small>单件到岸</small><strong>{money(r.perUnitLanded)}</strong></div>
              <div>
                <small>目标售价 · 留 {margin}% 净利</small>
                <strong className={price === null ? "neg" : ""}>{price !== null ? money(price) : "目标净利率 ≥ 100%，无解"}</strong>
              </div>
            </div>
            <p>
              <b>单件到岸 {money(r.perUnitLanded)} 就是可以填进利润计算器「采购成本」的那个数</b>（它已含运保费与税，填入后其余物流项请勿重复填写）。
              目标售价 = 单件到岸 ÷ (1 − 目标净利率)，<b>未扣平台佣金与广告</b>，适用于自有渠道 / 线下；
              平台售价请用 <SiteLink href="/crossborder/tools/pricing-calculator">定价决策模拟器</SiteLink>，两者口径不同。
            </p>
          </div>

          {diff && (
            <div className="scenario-card">
              <div className="card-title"><span>情景对比</span><small>A → B</small></div>
              <div className="scenario-table" role="table">
                <div className="scenario-row landed-row scenario-head" role="row">
                  <span>情景</span><span>贸易术语</span><span>关税</span><span>现金到岸</span><span>单件到岸</span>
                </div>
                <div className="scenario-row landed-row" role="row">
                  <span>A</span><span>{incoterm}</span><span>{dutyRate}%</span>
                  <span>{money(diff.a.cashLanded)}</span><b>{money(diff.a.perUnitLanded)}</b>
                </div>
                <div className="scenario-row landed-row is-target" role="row">
                  <span>B</span><span>{bIncoterm}</span><span>{bDutyRate}%</span>
                  <span>{money(diff.b.cashLanded)}</span>
                  <b className={diff.perUnitDelta < 0 ? "pos" : diff.perUnitDelta > 0 ? "neg" : ""}>{money(diff.b.perUnitLanded)}</b>
                </div>
              </div>
              <div className="pack-save">
                <div><small>单件到岸差额</small>
                  <strong className={diff.perUnitDelta < 0 ? "pos" : diff.perUnitDelta > 0 ? "neg" : ""}>
                    {diff.perUnitDelta > 0 ? "+" : ""}{money(diff.perUnitDelta)}
                  </strong>
                </div>
                <div><small>现金到岸差额</small>
                  <strong className={diff.cashDelta < 0 ? "pos" : diff.cashDelta > 0 ? "neg" : ""}>
                    {diff.cashDelta > 0 ? "+" : ""}{money(diff.cashDelta)}
                  </strong>
                </div>
                <div><small>全批 {units} 件影响</small>
                  <strong className={diff.perUnitDelta < 0 ? "pos" : ""}>{money(diff.perUnitDelta * units)}</strong>
                </div>
              </div>
              <p className="scenario-note">
                <Info size={12} />
                对比只算<b>到岸成本本身</b>：换产地还涉及品质、交期、起订量、认证与原产地证明，换贸易术语会改变责任与风险划分——这些不在模型里。
              </p>
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

          <Assumption formula="完税价 =(货值 + 计入完税价的费用)× 汇率   关税 = 完税价 × 关税率   VAT =(完税价 + 关税)× VAT 率">
            <ul>
              <li><strong>现金到岸</strong>= 完税价 + 关税 + VAT + 其余费用(你实际要掏的钱);<strong>经济到岸</strong>= 现金到岸 − 可抵扣 VAT;<strong>单件到岸</strong>= 经济到岸 ÷ 批次件数。</li>
              <li>VAT 可抵扣时只是垫付、不是成本,但<b>抵扣需要合规进项发票与当地税号,且现金被占用到退税为止</b>。</li>
              <li>费用是否计入完税价按目的国口径:欧盟等通常按 CIF(运保费计入),<b>美国通常按 FOB(国际运保费不计入)</b>——用每项费用的开关表达。</li>
              <li>DDP 下税费已含在采购价里,本工具不再另计,税单通常不在你名下、VAT 一般无法由你抵扣。</li>
              <li>税率与 HS 归类由你填写,<b>本工具不代查税率、不承诺覆盖各国规则</b>;反倾销/特别关税、配额、原产地规则与最低起征额均未建模。</li>
            </ul>
          </Assumption>

        </section>
      </ToolPageShell>
    </>
  );
}
