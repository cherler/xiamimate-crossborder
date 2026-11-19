"use client";
import { SiteLink } from "../../site-link";


/**
 * 跨境工具页的共享骨架与表单小组件。
 * 页头、面包屑、标题、相关工具、页脚由 ToolPageShell 统一提供；
 * 各计算器页只写「参数列 + 结果列」两块内容，计算全部来自 calculators 引擎。
 */

import { ProductSwitcher } from "./product-switcher";
import { type ReactNode, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import { CROSSBORDER_TOOLS } from "../../../lib/crossborder/registry";
import { takePendingImport } from "../../../lib/crossborder/pending-import";
import { MARKET_LABEL } from "../../../lib/crossborder/asin";

/** 字段当前值的来源：AI 智能读取，或利润计算器的商品模型。 */
export type FieldSource = "ai" | "model" | "default";

/**
 * 智能读取接线 hook：给定「字段 key → setState」映射，统一管理抽屉开关、
 * 字段来源标记，以及「手动改动即清除标记」。让各计算器页只写几行就接上智能读取。
 * 商品模型复用走同一套标记（applyModel），两种来源共用一条清除路径。
 */
export function useToolImport(setters: Record<string, (v: number) => void>, toolId?: string) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<Record<string, FieldSource>>({});
  /**
   * 用户亲手改过的字段。
   *
   * 各工具页原本只有一个「示例数据」总标记 —— 全部字段等于示例值时才亮。
   * 用户一改售价它就消失了,而其余字段仍是我们预填的示例值,却渲染成一整套
   * 看着像他自己账户数据的面板(ACoS 页最典型:广告花费 300 / 归因销售额 1200 /
   * 点击 500 / 订单 40 全是我们的)。数字越精确,越没人去质疑它的前提。
   */
  const [touched, setTouched] = useState<Set<string>>(new Set());

  // 挂载时接收工具中心智能路由暂存的预填：填入表单并标为 AI 来源，随即清空暂存。
  useEffect(() => {
    if (!toolId) return;
    const pending = takePendingImport(toolId);
    if (!pending) return;
    for (const f of pending.fields) setters[f.key]?.(f.value);
    setMarks(Object.fromEntries(pending.fields.map((f) => [f.key, "ai" as FieldSource])));
    // 仅在挂载时接收一次；setters 每次渲染重建，不入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId]);

  const clearMark = (key: string) => {
    setMarks((cur) => {
      if (!(key in cur)) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  };

  const update = (key: string, value: number) => {
    setters[key]?.(value);
    setTouched((cur) => (cur.has(key) ? cur : new Set(cur).add(key)));
    clearMark(key);
  };

  const markAll = (keys: string[], source: FieldSource) =>
    setMarks(Object.fromEntries(keys.map((k) => [k, source])));

  const applyImport = (fields: Array<{ key: string; value: number }>) => {
    for (const f of fields) setters[f.key]?.(f.value);
    markAll(fields.map((f) => f.key), "ai");
    setOpen(false);
  };

  /** 用户确认后，把商品模型的值填入表单。 */
  const applyModel = (values: Record<string, number>) => {
    const keys = Object.keys(values);
    for (const k of keys) setters[k]?.(values[k]);
    markAll(keys, "model");
  };

  /**
   * 字段来源标记。stillDefault = 调用方判断「当前值仍等于示例默认值」。
   * 用户动过的字段即便碰巧改回默认值也不再标 —— 那是他的选择,不是我们的预设。
   */
  const sourceOf = (key: string, stillDefault?: boolean): FieldSource | undefined =>
    marks[key] ?? (stillDefault && !touched.has(key) ? "default" : undefined);

  /** 清空参数是用户的明确动作,之后不该再算「默认值」。 */
  const markAllTouched = (keys: string[]) => setTouched(new Set(keys));

  return {
    open, setOpen, update, applyImport, applyModel, sourceOf, markAllTouched,
    // 兼容既有调用方（landed-cost / dimensional-weight 只关心 AI 来源）
    aiFilled: new Set(Object.keys(marks).filter((k) => marks[k] === "ai")),
  };
}

export function money(v: number, digits = 2): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const SOURCE_TAG: Record<FieldSource, { text: string; title: string; cls: string }> = {
  ai: { text: "智能读取", title: "来自 AI 智能读取，可直接修改", cls: "field-ai" },
  model: { text: "商品模型", title: "来自利润计算器的商品模型，可直接修改", cls: "field-model" },
  default: { text: "默认值", title: "这项还是示例默认值，你没有改过 —— 请按自己的实际情况核对", cls: "field-default" },
};

export function NumberField({ label, value, prefix, suffix, hint, ai, source, onChange }: {
  label: string; value: number; prefix?: string; suffix?: string; hint?: string;
  ai?: boolean; source?: FieldSource; onChange: (v: number) => void;
}) {
  const id = `tk-${label.replace(/[^\w一-龥]/g, "-")}`;
  const src = source ?? (ai ? "ai" : undefined);
  const tag = src ? SOURCE_TAG[src] : undefined;
  return (
    <label className={`number-field ${tag ? tag.cls : "field-confirmed"}`} htmlFor={id}>
      <span>{label}{tag && <span className="source-tag" title={tag.title}>{tag.text}</span>}</span>
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

export function SelectField({ label, value, options, hint, onChange }: {
  label: string; value: number; options: Array<{ value: number; label: string }>; hint?: string; onChange: (v: number) => void;
}) {
  return (
    <label className="number-field field-confirmed">
      <span>{label}</span>
      <div>
        <select className="mt-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function Metric({ label, value, suffix, note, tone = "blue" }: {
  label: string; value: string; suffix?: string; note: string; tone?: "green" | "blue" | "orange";
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}{suffix && <small>{suffix}</small>}</strong>
      <em>{note}</em>
    </div>
  );
}

/**
 * 情景阶梯(#84)—— 把「售价/CPC 情景表」做成保本线阶梯:每档一条从保本线发散的
 * 利润条,盈利向右(绿)、亏损向左(红),目标档抬起、保本档压在地面。定价页与广告页共用。
 * 传进来的 rows 已排好序(通常按 bar 从大到小 = 经济最优在上);breakeven 档 bar=0 自然落在红绿之间。
 */
export type LadderRow = {
  key: string;
  label: string;          // 左侧主标(如 "$25.00")
  sub?: string;           // 主标下的小字(如 "保本价 · 不赔不赚")
  bar: number;            // 发散指标(单件利润 / 广告后每单利润),符号决定左右
  barLabel: string;       // 条尾金额(如 "+$6.25" / "−$1.42");bar≈0 时留空
  stats: string[];        // 右侧统计单元格(已格式化)
  target?: boolean;
  breakeven?: boolean;
};

export function ScenarioLadder({ heads, rows, leftZone = "亏损区", rightZone = "盈利区" }: {
  heads: string[];
  rows: LadderRow[];
  leftZone?: string;
  rightZone?: string;
}) {
  const bars = rows.map((r) => r.bar);
  const maxPos = Math.max(0.01, ...bars.filter((x) => x > 0), 0.01);
  const hasNeg = bars.some((x) => x < 0);
  const maxNeg = Math.max(0.01, ...bars.filter((x) => x < 0).map((x) => -x), 0.01);
  const zx = hasNeg ? Math.max(18, Math.min(42, (maxNeg / (maxNeg + maxPos)) * 100)) : 10;
  const cols = `repeat(${heads.length}, 1fr)`;
  return (
    <div className="lad" style={{ ["--zx" as string]: `${zx}%` }}>
      <div className="lad-zonebar">
        <span>售价 / 档位</span>
        <span className="lad-zones"><b className="zL">← {leftZone}</b><b className="zM">保本线</b><b className="zR">{rightZone} →</b></span>
        <span className="lad-heads" style={{ gridTemplateColumns: cols }}>{heads.map((h) => <i key={h}>{h}</i>)}</span>
      </div>
      {rows.map((r) => {
        const cls = ["lad-rung", r.target && "is-target", r.breakeven && "is-be", r.bar < -0.005 && "is-loss"].filter(Boolean).join(" ");
        let bar = null;
        if (Math.abs(r.bar) >= 0.005) {
          if (r.bar > 0) {
            const w = (r.bar / maxPos) * (100 - zx) * 0.72;   // 留足条尾金额标签的空间,不贴统计列
            bar = <div className="lad-bar pos" style={{ width: `${w}%` }}><span className="lad-val">{r.barLabel}</span></div>;
          } else {
            const w = (-r.bar / maxNeg) * zx;
            bar = <div className="lad-bar neg" style={{ left: `calc(${zx}% - ${w}%)`, width: `${w}%` }}><span className="lad-val">{r.barLabel}</span></div>;
          }
        }
        return (
          <div className={cls} key={r.key}>
            <div className="lad-price">{r.label}
              {r.target && <span className="lad-flag">你的目标价</span>}
              {r.sub && <small>{r.sub}</small>}
            </div>
            <div className="lad-track"><span className="lad-spine" />{bar}</div>
            <div className="lad-stats" style={{ gridTemplateColumns: cols }}>{r.stats.map((s, i) => <b key={i}>{s}</b>)}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 「结果如何得出」说明块。原来是一坨挤在一起的小字,重排成:
 * 标题 → 主公式(等宽突出)→ 分条口径(每条一行,留白)。
 * `formula` 传主公式;`children` 传若干 <li>(口径逐条),或旧式散文(兜底)。
 */
export function Assumption({ formula, children }: { formula?: ReactNode; children: ReactNode }) {
  return (
    <div className="assumption">
      <div className="asm-head"><ShieldCheckIcon /> <strong>结果如何得出</strong></div>
      {formula && <div className="asm-formula">{formula}</div>}
      <div className="asm-body">{children}</div>
    </div>
  );
}

// 内联 ShieldCheck，避免各页重复引入
function ShieldCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function ToolPageShell({ activeId, headerAction, children }: {
  activeId: string; headerAction?: ReactNode; children: ReactNode;
}) {
  const tool = CROSSBORDER_TOOLS.find((t) => t.id === activeId);
  if (!tool) return null;
  const Icon = tool.icon;
  // 只推已上线的工具。早期入口自己都还没站稳，不该被推荐出去。
  const others = CROSSBORDER_TOOLS
    .filter((t) => t.id !== activeId && t.status === "available")
    .slice(0, 5);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />

      <section className="tool-page">
        <SiteLink className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</SiteLink>
        <div className="tool-page-head">
          <div className="tool-page-title">
            <span className="tool-page-icon"><Icon size={22} /></span>
            <div><span>CROSS-BORDER / {tool.category}</span><h1>{tool.name}</h1></div>
          </div>
          {headerAction}
        </div>

        <div className="tool-belt"><ProductSwitcher /></div>

        <div className="tool-cols">{children}</div>

        <div className="tool-more">
          <span>其他工具</span>
          {others.map((t) => (
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


/**
 * 站点选择器 —— 把商品挂到哪个平台。
 *
 * 加它是因为交付时踩了个坑:平台预设(达人佣金提示、字段改名、保本 ROAS)
 * 全都挂在商品的 marketplace 上,而这个字段**只能由扩展采集或 AI 读取写入**,
 * 界面上没有任何地方让用户自己设。新建商品的 marketplace 是空串,
 * 于是那些按钮对绝大多数用户根本不可达 —— 功能做了,但够不着。
 *
 * 未设站点时一切按现状(亚马逊口径),不强迫用户先选。
 */
export function MarketField({ value, onChange }: {
  value: string; onChange: (v: string) => void;
}) {
  const groups: Array<[string, string[]]> = [
    ["亚马逊", Object.keys(MARKET_LABEL).filter((k) => k.startsWith("amazon"))],
    ["TikTok Shop", Object.keys(MARKET_LABEL).filter((k) => k.startsWith("tiktok"))],
  ];
  return (
    <label className="number-field field-confirmed">
      <span>销售站点<span className="source-tag" title="决定佣金口径、字段说法与该算哪几块成本">影响算法口径</span></span>
      <div>
        <select className="mt-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">未设置(按亚马逊口径)</option>
          {groups.map(([label, keys]) => (
            <optgroup key={label} label={label}>
              {keys.map((k) => <option key={k} value={k}>{MARKET_LABEL[k]}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <small className="field-hint">选 TikTok Shop 会提示你补上达人佣金与寄样成本 —— 那两块亚马逊没有。</small>
    </label>
  );
}
