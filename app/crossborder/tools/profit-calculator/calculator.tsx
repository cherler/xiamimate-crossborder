"use client";
import { SiteLink } from "../../../site-link";


/**
 * 利润计算器独立工具页。
 * 手动表单是主干：修改参数即时重算，结果全部来自 lib 里唯一的 calculateProfit。
 * AI「智能读取」是辅助录入：读取资料 → 展示识别结果与缺口 → 用户确认后才填入表单，
 * 不静默覆盖、不代替计算。
 */

import { ProductSwitcher } from "../product-switcher";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, CircleDollarSign, Download, Info, Layers3, Plus, RotateCcw, Save, ShieldCheck, TrendingUp } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import {
  calculateProfit, DEFAULT_PROFIT_VALUES, worstCase, type ProfitValues,
} from "../../../../lib/crossborder-tools";
import {
  BLOCK_TYPES, COST_PRESETS, blockFromPreset, computeAdjusted, detectConflicts, detectVatIssues, type CostBlock,
} from "../../../../lib/crossborder/cost-model";
import { calculateAcos } from "../../../../lib/crossborder/calculators/acos";
import { currentProduct, updateProduct, isCloudEnabled, schedulePush } from "../../../../lib/crossborder/products";
// 保本价必须走认识成本积木的那个解算器 —— 见 breakevenWithBlocks 的说明
import { priceCoefficients, simInputFromProfit, solvePrice } from "../../../../lib/crossborder/pricing-sim";
import { money2 } from "../../../../lib/format";
import {
  readProductModel, writeProductModel, clearProductModel, modelFromProfit, toProfitValues, baseCost,
} from "../../../../lib/crossborder/product-model";
import { CROSSBORDER_TOOLS } from "../../../../lib/crossborder/registry";
import { takePendingImport } from "../../../../lib/crossborder/pending-import";

import { BlockCard } from "../cost-blocks";
import { CostTemplateRow } from "../cost-template-row";
import type { TemplateRates } from "../../../../lib/crossborder/cost-templates";
// 与 ACoS 工具共用同一个金额格式化，避免同一商品在两页显示出 $10.21 / $10.22 这种差异。
import { money, MarketField} from "../tool-kit";
import { labelFor, presetFor } from "../../../../lib/crossborder/platform-preset";
import { rich } from "../../../../lib/crossborder/rich-text";
import {
  ResultActions, HistoryStrip, useToolHistory, useSharedInitial, type ToolValues,
} from "../tool-actions";

type ProfitKey = keyof ProfitValues;

/**
 * ③ 情景三档:同一套公式,压力测试三组假设。
 * 悲观 = 售价 −7%、广告 +3pt、退款 +1pt(促销让价 + 竞价上涨 + 退货抬头,常见的坏一年);
 * 乐观 = 售价 +5%、广告 −2pt(站稳后的提价与自然流量占比上升)。
 * 假设写在明面上 —— 这是压力测试,不是预测。
 */
const SCENARIOS: Array<{ key: string; label: string; note: string; adjust: (v: ProfitValues) => ProfitValues }> = [
  { key: "worst", label: "悲观", note: "售价−7% · 广告+3pt · 退款+1pt",
    adjust: worstCase },
  { key: "base", label: "基准", note: "当前参数", adjust: (v) => v },
  { key: "best", label: "乐观", note: "售价+5% · 广告−2pt",
    adjust: (v) => ({ ...v, price: v.price * 1.05, ads: Math.max(0, v.ads - 2) }) },
];

function ScenarioBand({ values, target, productName }: { values: ProfitValues; target: number; productName: string }) {
  const cells = SCENARIOS.map((s) => {
    try {
      const r = calculateProfit(s.adjust(values));
      return { ...s, r };
    } catch { return { ...s, r: null }; }
  });
  if (cells.every((c) => !c.r)) return null;
  return (
    <div className="scn">
      <div className="scn-head">
        <b>情景三档 · 同一套公式压力测试</b>
        <button type="button" className="scn-export" onClick={() => exportCsv(values, target, productName)}>
          <Download size={12} /> 导出 CSV
        </button>
      </div>
      <div className="scn-grid">
        {cells.map((c) => (
          <div key={c.key} className={`scn-cell is-${c.key} ${c.r && c.r.profit < 0 ? "is-loss" : ""}`}>
            <span className="scn-lab">{c.label}</span>
            {c.r ? (
              <>
                <b className="scn-big">{c.r.profit < 0 ? "−" : ""}${money2(Math.abs(c.r.profit))}</b>
                <span className={`scn-margin ${c.r.margin >= target ? "ok" : c.r.margin < 0 ? "neg" : ""}`}>
                  净利率 {c.r.margin.toFixed(1)}%
                </span>
              </>
            ) : <b className="scn-big">—</b>}
            <em>{c.note}</em>
          </div>
        ))}
      </div>
      <p className="scn-note">悲观档仍为正,这个价才扛得住促销和竞价波动;成本模块不参与情景(口径同标准贡献利润)。</p>
    </div>
  );
}

/** 导出 CSV:参数 + 结果明细 + 情景三档,一件损益单进表格软件继续摆弄。 */
function exportCsv(values: ProfitValues, target: number, productName: string) {
  let r: ReturnType<typeof calculateProfit>;
  try { r = calculateProfit(values); } catch { return; }
  const rows: string[][] = [
    ["利润计算器 · 损益单", productName || "未命名商品"],
    [],
    ["参数", "值"],
    ...FIELDS.map((f) => [f.label, String(values[f.key])]),
    ["目标净利率 %", String(target)],
    [],
    ["结果", "金额 $"],
    ["固定成本(采购+物流)", r.fixedCost.toFixed(2)],
    ["平台佣金", r.commissionCost.toFixed(2)],
    ["广告成本", r.adCost.toFixed(2)],
    ["退款损耗", r.refundLoss.toFixed(2)],
    ["总成本", r.totalCost.toFixed(2)],
    ["单件净利润", r.profit.toFixed(2)],
    ["净利润率 %", r.margin.toFixed(1)],
    ["保本售价", r.breakeven.toFixed(2)],
    [],
    ["情景", "假设", "单件净利 $", "净利率 %"],
    ...SCENARIOS.map((s) => {
      try {
        const sr = calculateProfit(s.adjust(values));
        return [s.label, s.note, sr.profit.toFixed(2), sr.margin.toFixed(1)];
      } catch { return [s.label, s.note, "—", "—"]; }
    }),
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const d = new Date();
  a.download = `利润测算-${(productName || "未命名").slice(0, 20)}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}



const FIELDS: Array<{ key: ProfitKey; label: string; prefix?: string; suffix?: string }> = [
  { key: "price", label: "售价", prefix: "$" },
  { key: "cost", label: "采购成本", prefix: "$" },
  { key: "domestic", label: "国内运费", prefix: "$" },
  { key: "head", label: "头程运费", prefix: "$" },
  { key: "lastMile", label: "尾程 / FBA", prefix: "$" },
  { key: "commission", label: "平台佣金", suffix: "%" },
  // 达人佣金:TikTok Shop 等内容电商特有,亚马逊没有这个概念,默认 0。
  // 做成一等字段而不是可选积木 —— 积木不参与跨工具复用,
  // 而定价倒推和 ACoS 保本线恰恰最需要它。
  { key: "affiliateRate", label: "达人佣金", suffix: "%" },
  { key: "refund", label: "退款损耗", suffix: "%" },
  { key: "ads", label: "广告成本", suffix: "%" },
  // 销项税:欧盟/英国平台标价含税,那部分是替税务局代收的,不是你的收入。
  // 默认 0 —— 美国站不涉及,填了才生效。
  { key: "vatRate", label: "销项税率", suffix: "%" },
];

/** 版本对比(B+):同一商品的两次测算并排 —— 参数差 + 固定公式重算的结果差。 */
function VersionCompare({ items }: { items: Array<{ id?: string; ts: number; label: string; values: ToolValues }> }) {
  const [on, setOn] = useState(false);
  const [aId, setAId] = useState<string | number>("");
  const [bId, setBId] = useState<string | number>("");
  if (items.length < 2) return null;

  const keyOf = (it: { id?: string; ts: number }) => it.id ?? it.ts;
  const a = items.find((i) => String(keyOf(i)) === String(aId)) ?? items[1];
  const b = items.find((i) => String(keyOf(i)) === String(bId)) ?? items[0];

  const parse = (v: ToolValues) => {
    const pv = { ...DEFAULT_PROFIT_VALUES };
    for (const k of Object.keys(pv) as ProfitKey[]) if (v[k] != null) pv[k] = Number(v[k]);
    const target = v.target != null ? Number(v.target) : 20;
    let nBlocks = 0;
    try { const arr = JSON.parse(String(v.blocks ?? "[]")); nBlocks = Array.isArray(arr) ? arr.length : 0; } catch { /* ignore */ }
    let result: ReturnType<typeof calculateProfit> | null = null;
    try { result = calculateProfit(pv); } catch { result = null; }
    return { pv, target, nBlocks, result };
  };
  const A = parse(a.values);
  const B = parse(b.values);

  const fmt = (n: number, isMoney = true) => (isMoney ? `$${money2(n)}` : `${n.toFixed(1)}%`);
  const rows: Array<{ label: string; a: string; b: string; delta: number | null; money: boolean }> = [
    ...FIELDS.map((f) => ({
      label: f.label,
      a: `${f.prefix ?? ""}${A.pv[f.key] ?? 0}${f.suffix ?? ""}`,
      b: `${f.prefix ?? ""}${B.pv[f.key] ?? 0}${f.suffix ?? ""}`,
      delta: (B.pv[f.key] ?? 0) - (A.pv[f.key] ?? 0),
      money: f.prefix === "$",
    })),
    { label: "目标净利率", a: `${A.target}%`, b: `${B.target}%`, delta: B.target - A.target, money: false },
  ];
  const results = A.result && B.result ? [
    { label: "单件净利润", a: fmt(A.result.profit), b: fmt(B.result.profit), delta: B.result.profit - A.result.profit, money: true },
    { label: "净利润率", a: fmt(A.result.margin, false), b: fmt(B.result.margin, false), delta: B.result.margin - A.result.margin, money: false },
    { label: "保本售价", a: fmt(A.result.breakeven), b: fmt(B.result.breakeven), delta: B.result.breakeven - A.result.breakeven, money: true },
  ] : [];

  const when = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="vcmp">
      <div className="vcmp-bar">
        <button type="button" className={`vcmp-toggle${on ? " on" : ""}`} onClick={() => setOn((v) => !v)}>
          {on ? "收起对比" : "对比两次测算"}
        </button>
        {on && (
          <>
            <select value={String(keyOf(a))} onChange={(e) => setAId(e.target.value)} aria-label="版本 A">
              {items.map((it) => <option key={String(keyOf(it))} value={String(keyOf(it))}>{when(it.ts)} · {it.label}</option>)}
            </select>
            <span className="vcmp-vs">vs</span>
            <select value={String(keyOf(b))} onChange={(e) => setBId(e.target.value)} aria-label="版本 B">
              {items.map((it) => <option key={String(keyOf(it))} value={String(keyOf(it))}>{when(it.ts)} · {it.label}</option>)}
            </select>
          </>
        )}
      </div>
      {on && (
        <div className="vcmp-panel">
          <div className="vcmp-row vcmp-head"><span>参数</span><b>A · {when(a.ts)}</b><b>B · {when(b.ts)}</b><b>B − A</b></div>
          {rows.map((r0) => (
            <div className={`vcmp-row${r0.delta ? " is-diff" : ""}`} key={r0.label}>
              <span>{r0.label}</span><b>{r0.a}</b><b>{r0.b}</b>
              <b className={r0.delta ? (r0.delta > 0 ? "pos" : "neg") : ""}>
                {r0.delta ? `${r0.delta > 0 ? "+" : "−"}${money2(Math.abs(r0.delta)).replace(/\.00$/, "")}` : "—"}
              </b>
            </div>
          ))}
          {results.length > 0 && (
            <>
              <div className="vcmp-row vcmp-sec"><span>结果(固定公式重算)</span><b /><b /><b /></div>
              {results.map((r1) => (
                <div className="vcmp-row is-result" key={r1.label}>
                  <span>{r1.label}</span><b>{r1.a}</b><b>{r1.b}</b>
                  <b className={r1.delta ? (r1.delta > 0 ? "pos" : "neg") : ""}>
                    {r1.delta ? `${r1.delta > 0 ? "+" : "−"}${r1.money ? "$" + money2(Math.abs(r1.delta)) : Math.abs(r1.delta).toFixed(2) + " pt"}` : "—"}
                  </b>
                </div>
              ))}
            </>
          )}
          {(A.nBlocks !== B.nBlocks) && (
            <p className="vcmp-note">两个版本的成本模块数量不同(A:{A.nBlocks} / B:{B.nBlocks}),上表结果为标准口径,未含模块影响。</p>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, prefix, suffix, ai, defaulted, hint, onChange }: {
  label: string; value: number; prefix?: string; suffix?: string;
  ai?: boolean;
  /** 平台差异的一行小字(见 platform-preset.hints)。亚马逊没有,那一栏就不出现。 */
  hint?: string;
  /**
   * 这一项还是我们的默认值,用户从没动过。
   *
   * 顶上那个「示例数据」标记只有在**八个字段全等于默认值**时才出现 ——
   * 用户一改售价和成本它就消失了,而佣金 15%、广告 12%、退款 2% 仍是我们替他填的。
   * 于是算出来的利润看着像他自己的数,其实八项里有三项不是。
   * 这是「精确的错误」:数字越精确,越没人去质疑它的前提。
   */
  defaulted?: boolean;
  onChange: (v: number) => void;
}) {
  const id = `pf-${label.replace(/[^\w一-龥]/g, "-")}`;
  const cls = ai ? "field-ai" : defaulted ? "field-default" : "field-confirmed";
  return (
    <label className={`number-field ${cls}`} htmlFor={id}>
      <span>{label}
        {ai && <span className="source-tag" title="来自 AI 智能读取，可直接修改">智能读取</span>}
        {!ai && defaulted && (
          <span className="source-tag" title="这项还是默认值，你没有改过 —— 请按自己的实际情况核对">默认值</span>
        )}</span>
      <div>
        {prefix && <i aria-hidden="true">{prefix}</i>}
        <input id={id} type="number" value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <i>{suffix}</i>}
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function ProfitCalculator() {
  const [values, setValues] = useState<ProfitValues>(DEFAULT_PROFIT_VALUES);
  // 用户亲手改过的字段。没改过、又恰好等于默认值的,在界面上标出来。
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(20);

  const [aiFilled, setAiFilled] = useState<Set<ProfitKey>>(new Set());
  const [blocks, setBlocks] = useState<CostBlock[]>([]);
  /**
   * 平台预设 —— 跟着当前商品的 marketplace 走。
   * 只换说法与默认值,引擎一行不动:达人佣金/寄样成本本来就能用成本积木表达,
   * 缺的只是「有人告诉他该加这两块」。
   */
  const [hydrated, setHydrated] = useState(false);
  const [market, setMarketState] = useState("");
  useEffect(() => { setMarketState(currentProduct()?.marketplace || ""); }, [hydrated]);
  /** 改站点即写回商品档案 —— 它是商品的属性,不是这一次测算的参数。 */
  function setMarket(v: string) {
    setMarketState(v);
    const cur = currentProduct();
    if (cur) {
      updateProduct(cur.id, (p) => ({ ...p, marketplace: v }));
      if (isCloudEnabled()) schedulePush();
    }
  }
  /** 平台预设 —— 跟着站点走。只换说法与默认值,引擎一行不动。 */
  const preset = presetFor(market);

  const [fromShare, setFromShare] = useState(false);
  const hist = useToolHistory("profit");

  // 共享商品模型：挂载时载入，之后每次改动自动保存，供定价 / ACoS 复用。
  // 分享链接是别人的快照，既不读本地模型、也不写回：否则光是打开同事的链接，
  // 自己的模型就被静默替换了。要收下得点「另存为我的商品模型」。
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("s")) {
      setFromShare(true);
      setHydrated(true);
      return;
    }
    const m = readProductModel();
    if (m) { setValues(toProfitValues(m)); setTarget(m.target); setBlocks(m.blocks); }
    // 智能路由预填：覆盖模型里的对应字段并标为 AI 来源。随后的自动保存会把
    // 这份读进来的报价写回商品模型，定价 / ACoS 也就能复用了。
    const pending = takePendingImport("profit");
    if (pending) {
      const applied = pending.fields.filter((f) => f.key in DEFAULT_PROFIT_VALUES);
      if (applied.length) {
        setValues((cur) => {
          const next = { ...cur };
          for (const f of applied) next[f.key as keyof ProfitValues] = f.value;
          return next;
        });
        setAiFilled(new Set(applied.map((f) => f.key as ProfitKey)));
      }
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated || fromShare) return;
    writeProductModel(modelFromProfit(values, target, blocks));
  }, [hydrated, fromShare, values, target, blocks]);

  /** 把分享链接里的参数收为己用：解除写入封印，下一轮 effect 即落盘。 */
  function adoptSharedModel() { setFromShare(false); }

  function resetModel() {
    clearProductModel();
    setValues(DEFAULT_PROFIT_VALUES);
    setTarget(20);
    setBlocks([]);
    setAiFilled(new Set());
  }

  // 示例态识别 + 一键清空(清空只动参数,不动目标/成本块)
  const isDemo = JSON.stringify(values) === JSON.stringify(DEFAULT_PROFIT_VALUES);
  function clearParams() {
    setValues(Object.fromEntries(Object.keys(DEFAULT_PROFIT_VALUES).map((k) => [k, 0])) as unknown as ProfitValues);
    setAiFilled(new Set());
    setTouched(new Set(Object.keys(DEFAULT_PROFIT_VALUES)));   // 清空是用户的明确动作,不再算默认
  }
  const state = useMemo(() => {
    try {
      return { ok: true as const, result: calculateProfit(values) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "参数无法计算" };
    }
  }, [values]);

  /**
   * 含成本积木的保本售价。
   *
   * 页面上的「保本售价」一直取自 calculateProfit —— 而那个引擎**不认识成本积木**。
   * 于是同一张卡片里,上面的结论用调整后口径、下面的保本价用标准口径:
   * 加了「月度仓储 1200÷600」和「优惠券 5%」后,页面写保本 $21.41「现价高 $8.49」,
   * 真值是 $23.03。用户照它定价,每一单都在亏。
   * 保本价是用户唯一不能定错的数,而正确的解算器(solvePrice)本来就在仓库里。
   */
  const breakevenWithBlocks = useMemo(() => {
    if (!blocks.length) return null;
    try {
      return solvePrice(priceCoefficients(simInputFromProfit(values, blocks)), { kind: "breakeven" }).price;
    } catch { return null; }
  }, [values, blocks]);

  const adjusted = useMemo(() => {
    try { return computeAdjusted(values, blocks); } catch { return null; }
  }, [values, blocks]);

  // 广告红线：与独立 ACoS 工具走同一个引擎和同一个 baseCost，同一商品必得同一组数字。
  const acos = useMemo(
    /*
     * vatRate 必须带上,否则同一屏自相矛盾:上半屏说「利润只剩 $1.04(广告已占 12%)」,
     * 下半屏的广告红线却说「可以花到售价的 32% 还保本」—— 差的正是那笔销项税。
     */
    () => calculateAcos({ price: values.price, cost: baseCost(values), commission: values.commission,
                    refund: values.refund, margin: target, vatRate: values.vatRate }),
    [values, target],
  );
  const hasBlocks = blocks.length > 0;
  // 站点含税但销项税率填 0 —— 默认 0 意味着不知情的人根本不会去动这个字段,
  // 只提供输入框等于没做,必须主动告诉他后果与高估幅度。
  const conflicts = [
    ...detectVatIssues(currentProduct()?.marketplace, values),
    ...(hasBlocks ? detectConflicts(blocks, { refund: values.refund }) : []),
  ];
  const addedKeys = blocks.map((b) => b.id.split("-")[0]);
  /**
   * 可添加的成本模块 = 通用清单 + **本平台特有的那几块**。
   *
   * 平台特有的排在最前:达人佣金对 TikTok 卖家是定义性成本(常比平台佣金还重),
   * 而亚马逊完全没有这个概念 —— 界面上不主动摆出来,他就不会想到去加,
   * 算出来的利润会系统性偏高。
   */
  const availablePresets = [...preset.suggestedBlocks, ...COST_PRESETS]
    .filter((p) => p.key.startsWith("custom") || !addedKeys.includes(p.key));
  /** 本平台该加却还没加的 —— 用一条提示顶到眼前,而不是等他自己在下拉里翻。 */
  const missingPlatformBlocks = preset.suggestedBlocks.filter((p) => !addedKeys.includes(p.key));

  function addPreset(preset: typeof COST_PRESETS[number]) { setBlocks((bs) => [...bs, blockFromPreset(preset)]); }
  function updateBlock(next: CostBlock) { setBlocks((bs) => bs.map((b) => (b.id === next.id ? next : b))); }
  function removeBlock(id: string) { setBlocks((bs) => bs.filter((b) => b.id !== id)); }

  function update(key: ProfitKey, value: number) {
    setValues((cur) => ({ ...cur, [key]: value }));
    setTouched((cur) => (cur.has(key) ? cur : new Set(cur).add(key)));
    setAiFilled((cur) => {
      if (!cur.has(key)) return cur;
      const next = new Set(cur);
      next.delete(key);
      return next;
    });
  }

  // 当前已添加积木的参数，作为动态字段一起交给 AI 读取。




  // 快照包含成本模型与版本号，保证分享链接 / 历史记录可复现（risk #4）。
  const shareValues: ToolValues = { ...values, target, mv: 1, blocks: JSON.stringify(blocks) };
  function applyValues(v: ToolValues) {
    setValues((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(cur) as ProfitKey[]) if (v[k] != null) next[k] = Number(v[k]);
      return next;
    });
    if (v.target != null) setTarget(Number(v.target));
    if (typeof v.blocks === "string") {
      try {
        const arr = JSON.parse(v.blocks);
        if (Array.isArray(arr)) setBlocks(arr as CostBlock[]);
      } catch { /* ignore malformed snapshot */ }
    }
    setAiFilled(new Set());
  }
  useSharedInitial(applyValues);
  const resultText = () => {
    if (!state.ok) return `利润计算器\n${state.message}`;
    const head = `利润计算器\n售价 $${values.price} · 采购 $${values.cost} · 物流 $${(values.domestic + values.head + values.lastMile).toFixed(2)} · 佣金 ${values.commission}% · 退款 ${values.refund}% · 广告 ${values.ads}%\n`;
    if (!hasBlocks || !adjusted) {
      return head + `单件净利润 $${state.result.profit.toFixed(2)} · 净利润率 ${state.result.margin.toFixed(1)}% · 保本售价 $${(breakevenWithBlocks ?? state.result.breakeven).toFixed(2)}`;
    }
    return head +
      `标准贡献利润 $${adjusted.standard.profit.toFixed(2)}（${adjusted.standard.margin.toFixed(1)}%）\n` +
      `调整后估算利润 $${adjusted.adjustedProfit.toFixed(2)}（${adjusted.adjustedMargin.toFixed(1)}%）\n` +
      `新增成本影响：\n${adjusted.impacts.map((im) => `· ${im.name} ${im.amount < 0 ? "-" : "+"}$${Math.abs(im.amount).toFixed(2)}`).join("\n")}`;
  };

  const logistics = values.domestic + values.head + values.lastMile;
  const pct = (v: number) => (values.price > 0 ? Math.min(100, Math.max(0, (v / values.price) * 100)) : 0);
  const otherTools = CROSSBORDER_TOOLS.filter((t) => t.id !== "profit").slice(0, 5);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />

      <section className="tool-page">
        <SiteLink className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</SiteLink>

        <div className="tool-page-head">
          <div className="tool-page-title">
            <span className="tool-page-icon"><CircleDollarSign size={22} /></span>
            <div><span>CROSS-BORDER / 利润与定价</span><h1>利润计算器</h1></div>
          </div>
        </div>

        <div className="tool-belt"><ProductSwitcher /></div>

        <div className="tool-cols">
          <section className="param-col">
            <div className="section-heading"><span><TrendingUp size={15} /> 计算参数</span><em>{isDemo && <i className="demo-chip">示例数据</i>}<button type="button" className="ph-clear" onClick={clearParams}>清空参数</button>手动填写 · 实时计算</em></div>
            {/*
              平台特有成本的提示 —— 顶到眼前,而不是等他自己在下拉里翻。
              达人佣金对 TikTok 卖家常比平台佣金还重,而亚马逊没有这个概念:
              不主动说,他算出来的利润会系统性偏高,而且看不出哪里错了。
            */}
            {missingPlatformBlocks.length > 0 && (
              <div className="plat-hint" role="note">
                <b>{preset.name} 还有这几块成本没算进来:</b>
                <span>
                  {missingPlatformBlocks.map((b) => (
                    <button key={b.key} type="button" onClick={() => addPreset(b)}>+ {b.name}</button>
                  ))}
                </span>
                <em>{rich(preset.rateNote)}(口径更新于 {preset.asOf})</em>
              </div>
            )}
            <div className="field-grid">
              {/* 站点决定佣金口径、字段说法与该算哪几块成本 —— 摆在参数第一位。
                  此前它只能由扩展采集/AI 读取写入,界面上无处可设,
                  于是平台预设对绝大多数用户不可达。 */}
              <MarketField value={market} onChange={setMarket} />
              {FIELDS.map((f) => (
                <NumberField key={f.key} label={labelFor(preset, f.key, f.label)}
                  value={values[f.key] ?? 0} prefix={f.prefix} suffix={f.suffix}
                  ai={aiFilled.has(f.key)}
                  defaulted={!isDemo && !touched.has(f.key) && !aiFilled.has(f.key)
                             && values[f.key] === DEFAULT_PROFIT_VALUES[f.key]}
                  hint={preset.hints[f.key]}
                  onChange={(v) => update(f.key, v)} />
              ))}
              <NumberField label="目标净利率" value={target} suffix="%" onChange={setTarget} />
            </div>
            <CostTemplateRow values={values}
              onApply={(rates: TemplateRates) => setValues((cur) => ({ ...cur, ...rates }))} />
            <div className="model-sync">
              {fromShare ? (
                <>
                  <span><Layers3 size={12} /> 来自分享链接 · 未写入你的商品模型</span>
                  <button onClick={adoptSharedModel}><Save size={12} /> 另存为我的商品模型</button>
                </>
              ) : (
                <>
                  <span><Layers3 size={12} /> 已保存为商品模型，定价 / ACoS 可复用{hasBlocks ? "（成本模块不参与复用）" : ""}</span>
                  <button onClick={resetModel}><RotateCcw size={12} /> 重置为默认</button>
                </>
              )}
            </div>
          </section>

          <section className="result-col">
            <ResultActions resultText={resultText} slug="profit-calculator" toolId="profit" shareValues={shareValues}
              onSave={() => hist.save(shareValues, state.ok
                ? `${hasBlocks && adjusted ? `调整后 $${adjusted.adjustedProfit.toFixed(2)}` : `利润 $${state.result.profit.toFixed(2)}`}${hasBlocks ? ` · ${blocks.length} 模块` : ` · ${state.result.margin.toFixed(1)}%`}`
                : "无效参数")} />
            <HistoryStrip items={hist.items} onRestore={applyValues} onClear={hist.clear} isCloud={hist.isCloud} productName={hist.productName}
              render={(v) => {
                let n = 0;
                try { const a = JSON.parse(String(v.blocks ?? "[]")); n = Array.isArray(a) ? a.length : 0; } catch { /* ignore */ }
                return `售价 $${v.price} · 采购 $${v.cost}${n ? ` · ${n} 模块` : ""}`;
              }} />
            <VersionCompare items={hist.items} />
            {!state.ok ? (
              <div className="tool-error"><ShieldCheck size={16} /><span>{state.message}</span></div>
            ) : (
              <>
                {(() => {
                  // ① 判决带:一个大数 + 三条小事实。有成本模块时判决用「调整后」口径。
                  const profit = hasBlocks && adjusted ? adjusted.adjustedProfit : state.result.profit;
                  const margin = hasBlocks && adjusted ? adjusted.adjustedMargin : state.result.margin;
                  const tone = profit < 0 ? "loss" : margin >= target ? "win" : "near";
                  const verdictText = profit < 0
                    ? `净利率 ${margin.toFixed(1)}% · 当前售价无法覆盖成本`
                    : margin >= target
                      ? `净利率 ${margin.toFixed(1)}% · 达到你的 ${target.toFixed(0)}% 目标`
                      : `净利率 ${margin.toFixed(1)}% · 差目标 ${(target - margin).toFixed(1)} 个百分点`;
                  return (
                    <div className={`pv-verdict pv-${tone}`}>
                      <div className="pv-hero">
                        <div className="pv-lab">{hasBlocks ? "调整后单件净利" : "单件净利润"}<em>= 这个商品一件到手</em></div>
                        <div className="pv-big">{profit < 0 ? "−" : ""}${Math.abs(profit).toFixed(2)}<small> /件</small></div>
                        <span className="pv-chip">{profit < 0 ? "✕" : margin >= target ? "✓" : "!"} {verdictText}</span>
                      </div>
                      <div className="pv-facts">
                        {hasBlocks && adjusted ? (
                          <div className="pv-fact"><span>标准贡献利润</span><b>${adjusted.standard.profit.toFixed(2)}<em>{adjusted.standard.margin.toFixed(1)}%</em></b></div>
                        ) : (
                          <div className={`pv-fact ${margin >= target ? "ok" : ""}`}><span>净利润率</span><b>{margin.toFixed(1)}%<em>目标 {target.toFixed(0)}%</em></b></div>
                        )}
                        {(() => {
                          const be = breakevenWithBlocks ?? state.result.breakeven;
                          return (
                            <div className="pv-fact">
                              <span>保本售价{breakevenWithBlocks !== null && <i className="pv-scope">含成本积木</i>}</span>
                              <b>${be.toFixed(2)}<em>{values.price >= be
                                ? `现价高 $${(values.price - be).toFixed(2)}`
                                : `现价低 $${(be - values.price).toFixed(2)}`}</em></b>
                            </div>
                          );
                        })()}
                        <div className="pv-fact"><span>单件广告上限</span><b>${money(Math.max(0, acos.grossPerUnit))}<em>再多就亏</em></b></div>
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  // ② 签名件:利润瀑布 —— 从售价一级级扣到净利,钱去哪了一眼看完。
                  const profit = hasBlocks && adjusted ? adjusted.adjustedProfit : state.result.profit;
                  const steps: Array<{ label: string; amount: number }> = [
                    { label: "− 采购成本", amount: values.cost },
                    { label: "− 物流与履约", amount: logistics },
                    { label: "− 平台佣金", amount: state.result.commissionCost },
                    { label: "− 广告与退款", amount: state.result.adCost + state.result.refundLoss },
                  ];
                  if (hasBlocks && adjusted && adjusted.netDelta !== 0) {
                    steps.push({ label: adjusted.netDelta < 0 ? "− 已加成本模块" : "＋ 已加收入模块", amount: Math.abs(adjusted.netDelta) });
                  }
                  let cum = 0;
                  const rows = steps.map((s) => {
                    const w = pct(s.amount);
                    const left = Math.min(cum, 100);
                    cum += w;
                    return { ...s, left, width: Math.min(w, Math.max(0, 100 - left)) };
                  });
                  const profitPct = values.price > 0 ? (profit / values.price) * 100 : 0;
                  return (
                    <div className="pfall">
                      <div className="pfall-head"><b>钱花在了哪 · 从售价到净利</b><span>条形按占售价比例</span></div>
                      <div className="pfall-row">
                        <span className="pf-l">售价</span>
                        <div className="pf-track"><i className="pf-seg pf-rev" style={{ left: 0, width: "100%" }} /></div>
                        <span className="pf-amt pf-strong">${values.price.toFixed(2)}<small>100%</small></span>
                      </div>
                      {rows.map((r) => (
                        <div className="pfall-row" key={r.label}>
                          <span className="pf-l">{r.label}</span>
                          <div className="pf-track">
                            <i className="pf-seg pf-cost" style={{ left: `${r.left}%`, width: `${r.width}%` }} />
                            <i className="pf-bridge" style={{ left: `${Math.min(r.left + r.width, 100)}%` }} />
                          </div>
                          <span className="pf-amt">${r.amount.toFixed(2)}<small>{pct(r.amount).toFixed(1)}%</small></span>
                        </div>
                      ))}
                      <div className={`pfall-row pf-total ${profit < 0 ? "pf-loss" : ""}`}>
                        <span className="pf-l">= 单件净利</span>
                        <div className="pf-track">
                          {profit >= 0
                            ? <i className="pf-seg pf-win" style={{ left: `${Math.min(cum, 100)}%`, width: `${Math.max(0, Math.min(profitPct, 100 - Math.min(cum, 100)))}%` }} />
                            : <i className="pf-seg pf-red" style={{ right: 0, width: `${Math.min(Math.abs(profitPct), 100)}%` }} />}
                        </div>
                        <span className="pf-amt">{profit < 0 ? "−" : ""}${Math.abs(profit).toFixed(2)}<small>{profitPct.toFixed(1)}%</small></span>
                      </div>
                      {profit < 0 && <p className="pfall-note">成本合计已超过售价,超出部分即亏损。</p>}
                    </div>
                  );
                })()}

                <ScenarioBand values={values} target={target} productName={hist.productName} />

                <div className="pv-duo">
                  <div className="acos-card">
                    <div className="acos-head">
                      <span><BarChart3 size={14} /> 广告盈亏红线</span>
                      <SiteLink href="/crossborder/tools/acos-break-even">完整测算 →</SiteLink>
                    </div>
                    <div className="acos-row">
                      <div>
                        <small>保本 ACoS</small>
                        <strong>{acos.breakevenAcos.toFixed(1)}%</strong>
                      </div>
                      <div>
                        <small>目标 ACoS · 保 {target.toFixed(0)}%</small>
                        <strong className={acos.targetFeasible ? "" : "neg"}>
                          {acos.targetFeasible ? `${acos.targetAcos.toFixed(1)}%` : "—"}
                        </strong>
                      </div>
                      <div>
                        <small>单件广告上限</small>
                        <strong>${money(Math.max(0, acos.grossPerUnit))}</strong>
                      </div>
                    </div>
                    <p>
                      按 售价 −（采购 + 物流）− 佣金 计算，与 ACoS 工具同口径；
                      <b>未含退款损耗{hasBlocks ? "，也未含已添加的成本模块" : ""}</b>。
                      ACoS 的分母是广告归因销售额，与左侧「广告成本 {values.ads}%」（TACoS 口径）不是同一个指标，不能直接对比。
                      {!acos.targetFeasible && "当前毛利已无法同时满足目标净利，目标 ACoS 无解。"}
                    </p>
                  </div>
                  {availablePresets.length > 0 && (
                    <div className="add-modules">
                      <div className="add-modules-head"><Plus size={14} />
                        {hasBlocks ? "继续添加成本模块" : "还没算进去的"}
                      </div>
                      <p className="add-modules-sub">算得越全，越接近真话。</p>
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
                        <BlockCard key={b.id} block={b} price={values.price}
                          onChange={updateBlock} onRemove={() => removeBlock(b.id)} />
                      ))}
                    </div>
                  )}
                  {hasBlocks && adjusted && (
                    <div className="impact-card">
                      <div className="impact-head"><span>新增成本影响</span>
                        <strong className={adjusted.netDelta < 0 ? "neg" : "pos"}>{adjusted.netDelta < 0 ? "-" : "+"}${Math.abs(adjusted.netDelta).toFixed(2)}</strong>
                      </div>
                      {adjusted.impacts.map((im) => (
                        <div className="impact-row" key={im.id}>
                          <span>{im.name}</span>
                          <b className={im.amount < 0 ? "neg" : "pos"}>{im.amount < 0 ? "-" : "+"}${Math.abs(im.amount).toFixed(2)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="assumption">
                  <div className="asm-head"><ShieldCheck size={15} /> <strong>怎么算的</strong></div>
                  <div className="asm-formula">单件净利润 = 售价 − 固定成本 − 平台佣金 − 退款损耗 − 广告成本</div>
                  <div className="asm-body">
                    <p>固定成本 = 采购 + 国内运费 + 头程 + 尾程/FBA;佣金、退款、广告均按售价百分比计。未调用外部数据,所有参数可在左侧修改。</p>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <div className="tool-more">
          <span>其他工具</span>
          {otherTools.map((t) => (
            t.status === "available"
              ? <SiteLink key={t.id} className="tool-pill" href={`/crossborder/tools/${t.slug}`}>{t.name}</SiteLink>
              : <span key={t.id} className="tool-pill is-locked">{t.name} · 迁移中</span>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
