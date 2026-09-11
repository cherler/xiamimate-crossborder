"use client";

/**
 * 研究报告页(T13/T14)。?id=res_xxx 单份报告;无 id 列「我的研究报告」。
 *
 * 运行中:阶段进度轨(展示计划与处理状态,不是模型思维过程)+ 3s 轮询;
 * paused_insufficient / failed:续跑入口,「已完成段不重复扣费」明写在界面上;
 * done:按样例页(rr-*)同一版式渲染真实数据 —— 元信息头、四张结论卡、
 * 左目录右正文、结论级证据展开、研究过程(二次规划决策)可追溯、来源附录。
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowUpCircle, Check, CheckCircle2, ChevronDown, CircleDashed, Download,
  FileText, GitCompareArrows, Globe2, Link2, Loader2, Package, PauseCircle, Pin, PinOff, Printer,
  RefreshCw, Share2, Target, Telescope, Trash2, X,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import { useAuth } from "../../../../lib/auth";
import { MARKET_LABEL } from "../../../../lib/crossborder/asin";
import {
  EXAMPLE_RESEARCH_HREF, EXAMPLE_RESEARCH_SCOPE, hasExampleProduct, isExampleReportParam,
} from "../../../../lib/crossborder/example-reports";
import { findOrCreateProduct, subscribeProducts } from "../../../../lib/crossborder/products";
import { candidateModules } from "../../../../lib/crossborder/research/modules";
import type { ResearchRelation } from "../../../../lib/crossborder/research/types";
import {
  bindResearchProduct, createShare, deleteResearch, getResearch, getShare, listResearch, pinResearch, previewDeriveQuote,
  rerunSection, resumeResearch, revokeShare, setResearchSchedule, shareUrl, startResearch, type ShareInfo,
} from "../../../../lib/crossborder/research/api";
import {
  EVIDENCE_KIND_LABEL, EVIDENCE_LEVEL_LABEL, GOAL_LABEL, LEGACY_INTENTS, RELATION_LABEL,
  RESEARCH_STAGE_LABEL, TIER_LABEL, scopeGoal,
  type ResearchCategory, type ResearchIntent, type ResearchRun, type ResearchRunListItem, type ResearchScope,
} from "../../../../lib/crossborder/research/types";
import { BindProductMenu } from "../../bind-product-menu";
import { downloadMarkdown, downloadWord, goalLine, toMarkdown } from "./report-export";
import { ReportBody } from "./report-body";
import { ExampleProductResearchReport } from "./example-product-report";
import { ExampleReportBadge } from "../../example-report-ui";
import { AigcBadge, withAigcMark } from "../../aigc";

const STATUS_LABEL: Record<ResearchRun["status"], string> = {
  running: "研究中",
  paused_insufficient: "余额不足 · 已暂停",
  failed: "研究失败",
  done: "已完成",
};

/**
 * 档位(intent)展示名 —— 报告头 / 版本链 / 升级目标处用。
 * market_entry 是「需求洞察」档,不是「新品进入验证」(那是研究目标 goal,已解耦)。
 * 映射统一到 types.ts 的 TIER_LABEL(单一真源),此别名保留给本文件既有引用。
 */
const REPORT_INTENT = TIER_LABEL;


/**
 * 档位 · 目标 组合展示句(#2026-07-21 目标/档位解耦)。老报告 intent 直接是
/** 报告标题:商品名 @ 市场(与报告页头一致);缺市场则只显示名。 */
function withMarket(name: string | null | undefined, marketplace: string | null | undefined): string {
  const n = (name || "").trim() || "未命名研究";
  return marketplace ? `${n} @ ${MARKET_LABEL[marketplace] ?? marketplace}` : n;
}

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StageRail({ run }: { run: ResearchRun }) {
  return (
    <div className="deepr-rail">
      {run.stages.map((s) => (
        <div key={s.name} className={`deepr-stage is-${s.status}`}>
          {s.status === "done" ? <CheckCircle2 size={14} />
            : s.status === "skipped" ? <CircleDashed size={14} />
            : run.status === "running" ? <RefreshCw size={14} className="spin" />
            : <PauseCircle size={14} />}
          <span>{RESEARCH_STAGE_LABEL[s.name]}</span>
          <em>{s.status === "done" ? (s.charged ? `消耗 ${s.charged.toLocaleString()} 积分` : "免费")
            : s.status === "skipped" ? "跳过"
            : `预估 ≤ ${s.estimate.toLocaleString()}`}</em>
        </div>
      ))}
    </div>
  );
}


/** 报告分享弹窗(#P1-3):生成/复制/关闭只读公开链接。 */
function ShareModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined); // undefined=加载中
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { getShare(runId).then(setShare).catch(() => setShare(null)); }, [runId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const url = share ? shareUrl(share.token) : "";
  async function gen() { setBusy(true); try { setShare(await createShare(runId)); } catch { /* ignore */ } finally { setBusy(false); } }
  async function revoke() {
    if (!window.confirm("关闭后这个链接立即失效,已打开的人也看不了。确定?")) return;
    setBusy(true); try { await revokeShare(runId); setShare(null); } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } }

  return (
    <>
      <button className="drawer-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="share-modal" role="dialog" aria-modal="true" aria-label="分享报告">
        <button className="pay-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <h3 className="share-title"><Share2 size={17} /> 分享这份报告</h3>
        <p className="share-sub">生成一个只读公开链接:任何人打开都能看这份报告(隐去你填的私有补充资料),30 天后自动失效,可随时关闭。</p>
        {share === undefined ? (
          <div className="share-load"><Loader2 size={18} className="my-spin" /> 加载中…</div>
        ) : share ? (
          <>
            <div className="share-link">
              <Link2 size={14} />
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button className="ac-btn primary" onClick={copy}>{copied ? <><Check size={14} /> 已复制</> : "复制"}</button>
            </div>
            <div className="share-meta">
              <span>已被打开 {share.viewCount} 次</span>
              <span>{share.expiresAt ? `${fmtTime(share.expiresAt).slice(0, 10)} 到期` : ""}</span>
            </div>
            <button className="share-revoke" disabled={busy} onClick={revoke}>关闭分享(链接立即失效)</button>
          </>
        ) : (
          <button className="ac-btn primary share-gen" disabled={busy} onClick={gen}>
            {busy ? <><Loader2 size={14} className="my-spin" /> 生成中…</> : "生成分享链接"}
          </button>
        )}
      </div>
    </>
  );
}

function parseRivalsInput(text: string): string[] {
  return text.split(/[,,、;;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
}

type DeriveMode = "supplement" | "scope" | "upgrade" | "goal";
const OPEN_MARKETS = Object.keys(MARKET_LABEL);
/** 操作行下拉:把同类操作收成一个「▾」菜单,减少一行按钮数。点内部项即关闭。 */
function ActionMenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="rr-menu-wrap" ref={ref}>
      <button className={open ? "is-open" : ""} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon} {label} <ChevronDown size={12} />
      </button>
      {open && <div className="rr-menu" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

/** 各档位可升级到的更高档(洞察可升竞品/综合;竞品可升综合;综合已到顶)。 */
const UPGRADE_TARGETS: Record<string, string[]> = {
  market_entry: ["rival_compare", "full"],
  product_optimization: ["rival_compare", "full"],   // 优化现有商品归入需求洞察档,同样可升竞品/综合
  rival_compare: ["full"],
  full: [],
};
const DRAWER_META: Record<DeriveMode, { relation: ResearchRelation; title: string; reuse: boolean }> = {
  supplement: { relation: "rerun_supplement", title: "补充资料续跑", reuse: true },
  scope: { relation: "rerun_scope", title: "换范围重跑", reuse: false },
  upgrade: { relation: "upgrade_tier", title: "升级研究", reuse: true },
  goal: { relation: "rerun_goal", title: "换研究目标", reuse: true },
};

/** 当前报告的研究目标(兼容老报告:历史 intent=product_optimization 视作 optimize)。 */
function currentGoal(scope: ResearchScope): "new_entry" | "optimize" {
  return scopeGoal(scope);
}

/**
 * 派生抽屉(生命周期 P1/P2):基于当前报告派生一份新版本。三种模式:
 *  - supplement 补资料/补竞品(复用旧证据,只查新增);
 *  - scope 换平台/市场(全新采集,不复用,但同属一条版本链);
 *  - upgrade 洞察→竞品对比/综合(复用需求口碑证据,只补竞品那部分)。
 */
function DeriveDrawer({ run, mode, onClose }: { run: ResearchRun; mode: DeriveMode; onClose: () => void }) {
  const scope = run.scope;
  const meta = DRAWER_META[mode];
  const [rivalsText, setRivalsText] = useState("");
  const [notes, setNotes] = useState("");
  const [marketplace, setMarketplace] = useState(scope.marketplace);
  const [tier, setTier] = useState<string>((UPGRADE_TARGETS[scope.intent] || [])[0] || "");
  // 换研究目标:默认切到「另一个」目标(新品↔优化)。
  const curGoal = currentGoal(scope);
  const [newGoal, setNewGoal] = useState<"new_entry" | "optimize">(curGoal === "optimize" ? "new_entry" : "optimize");
  const [preview, setPreview] = useState<{ quote: number; fullQuote: number; reusedEvidence: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const newRivals = parseRivalsInput(rivalsText);
  // 目标 intent:升级取选中的档;其它保持原 intent。
  // 老档位(product_optimization/quality_diagnosis)归一到「需求洞察」档 —— 那是
  // 「档位即目标」年代的值,其目标语义由下面的 goal 承接,否则派生后仍走 legacy 分支。
  const baseIntent = LEGACY_INTENTS.has(scope.intent) ? "market_entry" : scope.intent;
  const targetIntent = mode === "upgrade" ? (tier || baseIntent) : baseIntent;
  // 目标要在模块清单之前定下来 —— 「优化现有商品」有专属章(改进优先级)。
  const derivedGoal = mode === "goal" ? newGoal : currentGoal(scope);

  /**
   * 派生的拟分析模块。
   *
   * 曾经是「原样继承父报告的章节」,于是升档花了积分却拿不到新档位该有的章节 ——
   * plan 阶段的动作只有 keep/merge/demote/drop(**只能删不能加**),继承进去缺什么就
   * 永远缺什么。最典型的是升到「综合研究」却没有它的招牌章「一页决策摘要」
   * (decision_summary 的 intents 是 ["full"],只有重新取候选才会进来)。
   *
   * 现改为:按**目标档位**重新取候选(与启动页同一个 candidateModules),再并上父报告
   * 已有的章节 —— 既补齐新档位的章,也不丢用户上一版已经看到的内容。
   */
  const parentModules = (run.report?.sections || [])
    .map((s) => s.module).filter((m): m is string => !!m && m !== "sources_appendix");
  const modules = (() => {
    const category = (scope.category || "generic") as ResearchCategory;
    const fresh = candidateModules(targetIntent as ResearchIntent, category, derivedGoal)
      .filter((m) => m !== "sources_appendix" && m !== "external_events");
    return [...new Set([...fresh, ...parentModules])];
  })();
  const needsRivals = targetIntent === "rival_compare" || targetIntent === "full";
  const mergedRivals = [...(scope.rivals || []), ...newRivals].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  const derivedScope: ResearchScope = {
    ...scope,
    intent: targetIntent as ResearchScope["intent"],
    // 非「换目标」模式必须显式继承当前目标:直接用 scope.goal 会在老报告/升档时丢成 undefined。
    goal: derivedGoal,
    // 商品绑定随派生版本继承,否则新版本不再挂在原商品档案下。
    productRef: run.productRef || scope.productRef,
    marketplace: mode === "scope" ? marketplace : scope.marketplace,
    rivals: needsRivals ? mergedRivals : (scope.rivals || []),
    notes: notes.trim() || undefined,
  };

  // 各模式的"可提交"条件
  const valid =
    mode === "supplement" ? ((needsRivals && newRivals.length > 0) || notes.trim().length > 0)
    : mode === "scope" ? (marketplace !== scope.marketplace || notes.trim().length > 0)
    : mode === "goal" ? (newGoal !== curGoal)
    : /* upgrade */ (!!tier && (targetIntent !== "rival_compare" || mergedRivals.length >= 2));

  useEffect(() => {
    let alive = true;
    if (!valid) { setPreview(null); return; }
    const t = setTimeout(async () => {
      try {
        const p = await previewDeriveQuote(derivedScope, modules, { originRunId: run.runId, relation: meta.relation });
        if (alive) setPreview(p);
      } catch { /* 预览失败静默,不挡派生 */ }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [rivalsText, notes, marketplace, tier, newGoal, valid]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true); setErr("");
    try {
      /**
       * 换市场 = 换研究对象,不是同一报告的新版本。
       *
       * 商品档案的组合唯一键是「名 + 市场」—— 同名不同市场本就是两个档案。若把换市场
       * 做成同链新版本,会出现:链头被最新版的市场覆盖(把旧版本也说成新市场)、整条链
       * 绑在同一个档案上(其中一半绑错)、「版本对比」拿两个市场对比却当成版本演进。
       * 所以市场变了就另起一条链,并按新市场找/建商品档案绑定。
       */
      const marketChanged = derivedScope.marketplace !== scope.marketplace;
      const target = marketChanged
        ? findOrCreateProduct({
            name: derivedScope.productName, marketplace: derivedScope.marketplace, asin: derivedScope.asin,
          })
        : null;
      const submitScope = target ? { ...derivedScope, productRef: target.stableId } : derivedScope;
      const run2 = await startResearch(
        submitScope, modules,
        // 换市场:不传 originRunId —— 后端据此开新 lineage_root,自成一条链。
        marketChanged ? undefined : { originRunId: run.runId, relation: meta.relation },
      );
      window.location.href = `/crossborder/research/report/?id=${encodeURIComponent(run2.runId)}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "派生失败,请稍后再试。");
      setSubmitting(false);
    }
  }

  const intro = mode === "supplement"
    ? <>基于当前报告派生一份新版本:<b>已抓的 {preview?.reusedEvidence ?? run.report?.sources.length ?? 0} 条证据直接复用</b>,只为新增内容补查 —— 省时间也省积分。</>
    : mode === "upgrade"
    ? <>把这份研究<b>升到更高档</b>:需求与口碑证据全部复用,只补新档位需要的竞品那部分 —— 比重新研究省得多。</>
    : mode === "goal"
    ? <>换个研究目标(新品进入验证 ↔ 优化现有商品)重出结论:<b>已抓证据全部复用</b>,只把决策摘要与各章倾向按新目标重写 —— 最省的一档派生。</>
    : <>换平台 / 市场重新研究:换了数据源旧证据大多失效,走<b>全新采集</b>;但与本报告<b>同属一条版本链</b>,方便对照。</>;

  return (
    <>
      <button className="drawer-backdrop" aria-label="关闭" onClick={onClose} />
      <div className="share-modal deepr-supp" role="dialog" aria-modal="true" aria-label={meta.title}>
        <button className="pay-close" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        <h3 className="share-title"><RefreshCw size={16} /> {meta.title}</h3>
        <p className="share-sub">{intro}</p>

        {mode === "upgrade" && (
          <label className="deepr-supp-field">
            <span>升级到</span>
            <div className="deepr-tier-opts">
              {(UPGRADE_TARGETS[scope.intent] || []).map((it) => (
                <button key={it} type="button" className={tier === it ? "on" : ""} onClick={() => setTier(it)}>
                  {REPORT_INTENT[it] ?? it}
                </button>
              ))}
            </div>
          </label>
        )}

        {mode === "scope" && (
          <>
            <label className="deepr-supp-field">
              <span>换平台 / 市场</span>
              <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                {OPEN_MARKETS.map((k) => <option key={k} value={k}>{MARKET_LABEL[k]}</option>)}
              </select>
            </label>
            {marketplace !== scope.marketplace && (
              <p className="fact-note">
                换了市场就是<b>另一个研究对象</b> —— 结果会另存为<b>一份独立报告</b>(不是本报告的新版本),
                并归入「{derivedScope.productName} @ {MARKET_LABEL[marketplace] ?? marketplace}」的商品档案。
                同名不同市场本就是两个档案。
              </p>
            )}
          </>
        )}

        {mode === "goal" && (
          <label className="deepr-supp-field">
            <span>新的研究目标</span>
            <div className="deepr-tier-opts">
              {(["new_entry", "optimize"] as const).map((g) => (
                <button key={g} type="button" className={newGoal === g ? "on" : ""} onClick={() => setNewGoal(g)}>
                  {GOAL_LABEL[g]}{g === curGoal ? "(当前)" : ""}
                </button>
              ))}
            </div>
          </label>
        )}

        {needsRivals && mode !== "scope" && (
          <label className="deepr-supp-field">
            <span>{mode === "upgrade" ? "竞品(升到竞品对比至少 2 个)" : "加竞品(顿号/逗号分隔)"}</span>
            <input value={rivalsText} onChange={(e) => setRivalsText(e.target.value)}
              placeholder={`当前:${(scope.rivals || []).join("、") || "无"};如 Hydro Flask、YETI`} />
            {mode === "upgrade" && targetIntent === "rival_compare" && mergedRivals.length < 2 && (
              <small style={{ color: "#c17d14" }}>竞品对比至少需要 2 个竞品(当前 {mergedRivals.length} 个)。</small>
            )}
          </label>
        )}

        <label className="deepr-supp-field">
          <span>补充资料 / 备注(选填)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="粘贴你后台导出的评论摘要、竞品补充信息、商品新卖点等 —— 会作为「用户补充资料」单独标注进报告。" />
        </label>

        {preview && valid && (
          <div className="deepr-supp-quote">
            <div>
              <b>预计{meta.reuse ? "增量 " : ""}{preview.quote.toLocaleString()} 积分</b>
              <span>{meta.reuse ? `复用 ${preview.reusedEvidence} 条,只查新增` : "换范围为全新采集,不复用旧证据"}</span>
            </div>
            {meta.reuse && preview.fullQuote > preview.quote && <em>省 {Math.round((1 - preview.quote / preview.fullQuote) * 100)}%(全新约 {preview.fullQuote})</em>}
          </div>
        )}
        {err && <div className="tool-error" style={{ marginTop: 10 }}><AlertTriangle size={14} /><span>{err}</span></div>}

        <button className="ac-btn primary share-gen" disabled={!valid || submitting} onClick={submit} style={{ marginTop: 12 }}>
          {submitting ? <><Loader2 size={14} className="my-spin" /> 派生中…</>
            : valid ? (mode === "upgrade" ? "确认升级" : mode === "scope" ? (marketplace !== scope.marketplace ? "确认另出一份新报告" : "确认换范围重跑") : mode === "goal" ? "确认换目标重出" : "确认续跑")
            : (mode === "scope" ? "先换一个平台/市场" : mode === "upgrade" ? "选目标档位与竞品" : mode === "goal" ? "选一个不同的研究目标" : "先加竞品或补充资料")}
        </button>
      </div>
    </>
  );
}

/** 定期复扫开关模块(生命周期 P3):Pro 会员专属;开启即同意到期自动消耗积分,余额不足跳过本次。 */
function RescanCard({ run, onChange }: { run: ResearchRun; onChange: () => Promise<void> }) {
  const { user } = useAuth();
  const isPro = user?.plan_tier === "pro";
  const sch = run.schedule;
  const enabled = !!sch?.enabled;
  const [interval, setIntervalDays] = useState(sch?.intervalDays || 30);
  const [busy, setBusy] = useState(false);
  // 复扫是**全新采集**,报价与当前这一版无关:当前版可能是单章重跑(固定 5 分)或
  // 补资料派生(gather 打折),拿 run.quote 展示会把自动扣费的价格少报最多 4 倍
  // —— 用户是在这个数字上点的「同意到期自动消耗积分」。用后端给的全价口径。
  //
  // 拿不到全价口径时**不报数**,而不是退回 run.quote。
  // `?? run.quote` 看着像个无害的兜底,但它兜出来的正是上面那句警告说的错值 ——
  // 而这个数字是用户点「同意自动扣费」的依据。宁可说不出具体数,也不能说错。
  const perCycle = run.rescanQuote;

  async function apply(next: boolean, days: number) {
    setBusy(true);
    try { await setResearchSchedule(run.runId, next, days); await onChange(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  function toggle() {
    if (!enabled) {
      // Pro 专属:非会员引导升级(关闭不设门槛,退订用户随时能关)
      if (!isPro) {
        if (window.confirm("定期复扫是跨境 Pro 会员功能:报告按周期自动重新采集,持续盯口碑与竞品变化。去看看 Pro?")) {
          window.location.href = "/account/#upgrade";
        }
        return;
      }
      const cost = perCycle != null
        ? `到期自动消耗约 ${perCycle} 积分`
        : "到期按当时「全新采集」的报价自动扣费";
      if (!window.confirm(`开启后每 ${interval} 天自动复扫一份,${cost}(余额不足则跳过本次,不会欠费)。确定开启?`)) return;
      apply(true, interval);
    } else {
      apply(false, interval);
    }
  }

  return (
    <div className="deepr-rescan">
      <div className="deepr-rescan-head">
        <div>
          <b><RefreshCw size={14} /> 定期复扫<em className="deepr-pro-tag">Pro</em></b>
          <span>按周期自动重跑,监测口碑与竞品变化;每份复扫是同一商品的新版本。<b>开启即同意到期自动消耗积分,余额不足跳过本次(不会欠费)。</b></span>
        </div>
        <button className={`deepr-switch${enabled ? " on" : ""}`} disabled={busy} onClick={toggle} aria-pressed={enabled} aria-label="定期复扫开关"><i /></button>
      </div>
      {enabled && (
        <div className="deepr-rescan-body">
          <label>周期
            <select value={interval} disabled={busy} onChange={(e) => { const d = Number(e.target.value); setIntervalDays(d); apply(true, d); }}>
              <option value={7}>每 7 天</option>
              <option value={14}>每 14 天</option>
              <option value={30}>每 30 天</option>
            </select>
          </label>
          <span>下次约 {sch?.nextRunAt ? fmtTime(sch.nextRunAt).slice(0, 10) : "—"}
            {perCycle != null && <> · 每期约 <b>{perCycle}</b> 积分</>}</span>
          {sch?.lastStatus === "skipped_no_credits" && <em className="warn">上次因余额不足跳过</em>}
          {sch?.lastStatus === "skipped_not_pro" && <em className="warn">上次因 Pro 会员到期跳过,续订后自动恢复</em>}
          {sch?.lastRunAt && sch.lastStatus === "ok" && <em>上次 {fmtTime(sch.lastRunAt).slice(0, 10)} 已复扫</em>}
        </div>
      )}
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [err, setErr] = useState("");
  const [resuming, setResuming] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deriveMode, setDeriveMode] = useState<DeriveMode | null>(null);
  const [pinning, setPinning] = useState(false);
  const [sibs, setSibs] = useState<ResearchRunListItem[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatus = useRef<string | null>(null);

  useEffect(() => { listResearch().then(setSibs).catch(() => { /* 对比入口可选 */ }); }, []);

  const load = useCallback(async () => {
    try {
      const r = await getResearch(runId);
      // 虾米君共情:开跑期待、跑完庆祝、失败叹气(#pet-p0)。
      if (prevStatus.current === null && r.status === "running") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "eager", text: "开跑啦,等我~" } }));
      } else if (prevStatus.current === "running" && r.status === "done") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "celebrate" } }));
      } else if (prevStatus.current === "running" && r.status === "failed") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "sigh" } }));
      }
      if (r.status === "running") window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "researching" } }));
      prevStatus.current = r.status;
      setRun(r);
      setErr("");
      if (r.status !== "running" && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch (e) {
      const s = (e as Error & { status?: number }).status;
      setErr(s === 401 ? "请先登录 —— 研究报告存在你的账号里。" : e instanceof Error ? e.message : "加载失败");
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
    }
  }, [runId]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  async function resume() {
    setResuming(true); setErr("");
    try {
      await resumeResearch(runId);
      if (!timer.current) timer.current = setInterval(load, 3000);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "续跑失败");
    } finally {
      setResuming(false);
    }
  }

  async function togglePin() {
    if (!run || pinning) return;
    setPinning(true);
    try { await pinResearch(runId, !run.pinned); await load(); }
    catch { /* ignore */ } finally { setPinning(false); }
  }

  if (err && !run) return <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>;
  if (!run) return <div className="fact-empty">加载中…</div>;

  const rep = run.report;
  const scope = run.scope;
  // 同谱系已完成的兄弟版本(供版本对比入口)
  const lineageSibs = sibs.filter((s) => (s.lineageRootId || s.runId) === (run.lineageRootId || run.runId) && s.status === "done");

  return (
    <>
      <div className={`deepr-head is-${run.status}`}>
        <div>
          <h1><Telescope size={20} strokeWidth={1.8} /> {scope?.productName || "商品口碑与需求洞察"}
            {scope?.productName && scope?.marketplace ? ` @ ${MARKET_LABEL[scope.marketplace] ?? scope.marketplace}` : ""}</h1>
          <p>
            {fmtTime(run.createdAt)} · {MARKET_LABEL[scope?.marketplace] ?? scope?.marketplace} ·
            {" "}{goalLine(scope)} ·
            已消耗 <b>{run.totalCharged.toLocaleString()}</b> 积分(预估上限 {run.quote.toLocaleString()})
          </p>
        </div>
        <div className="deepr-head-tags">
          {/* AI 标识已内建在 ReportBody(分享页也要有),这里不再重复。 */}
          {run.pinned && <span className="deepr-pin-badge"><Pin size={12} /> 参考版本</span>}
          <span className={`deepr-status is-${run.status}`}>{STATUS_LABEL[run.status]}</span>
        </div>
      </div>

      <StageRail run={run} />

      {run.status === "running" && (
        <p className="pi-note">研究进行中,约需数分钟 —— 页面自动刷新 —— 可以先去干别的,报告会留在「我的研究报告」。</p>
      )}
      {run.status === "paused_insufficient" && (
        <div className="wb-block deepr-pause">
          <div className="conflict-item warn"><AlertTriangle size={14} /><span>{run.error || "余额不足,已暂停。"}</span></div>
          <p className="fact-note">已完成的阶段与扣费都保留着 —— 补足余额后点击续跑,<b>只为剩余阶段消耗积分,不会重复扣</b>。</p>
          <div className="fact-foot-actions">
            <button className="fill" onClick={resume} disabled={resuming}>
              {resuming ? <><RefreshCw size={12} className="spin" /> 续跑中…</> : "余额已补足,继续研究"}
            </button>
          </div>
        </div>
      )}
      {run.status === "failed" && (
        <div className="wb-block deepr-pause">
          <div className="conflict-item warn"><AlertTriangle size={14} /><span>研究失败:{run.error || "未知错误"}。失败阶段的冻结积分已退回。</span></div>
          <div className="fact-foot-actions">
            <button className="fill" onClick={resume} disabled={resuming}>
              {resuming ? <><RefreshCw size={12} className="spin" /> 重试中…</> : "从断点重试"}
            </button>
          </div>
        </div>
      )}
      {err && run && <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>}

      {run.status === "done" && rep && (
        <>
          <div className="rr-actions-bar">
            {/* 重跑/衍生三变体收进一个下拉,操作行从 8 个降到 ~4 个 */}
            <ActionMenu label="重跑 / 衍生" icon={<RefreshCw size={13} />}>
              <button onClick={() => setDeriveMode("supplement")}><RefreshCw size={13} /> 补充资料续跑</button>
              <button onClick={() => setDeriveMode("goal")}><Target size={13} /> 换研究目标</button>
              <button onClick={() => setDeriveMode("scope")}><Globe2 size={13} /> 换范围重跑</button>
              {(UPGRADE_TARGETS[scope?.intent] || []).length > 0 && (
                <button onClick={() => setDeriveMode("upgrade")}><ArrowUpCircle size={13} /> 升级研究</button>
              )}
            </ActionMenu>
            <BindProductMenu
              productRef={run.productRef ?? null}
              productName={scope?.productName || ""}
              marketplace={scope?.marketplace}
              asin={scope?.asin}
              onBind={(ref, name) => bindResearchProduct(runId!, ref, name)}
              onBound={(ref) => setRun((r) => (r ? { ...r, productRef: ref ?? undefined } : r))}
              menu={(label, icon, children) => <ActionMenu label={label} icon={icon}>{children}</ActionMenu>}
            />
            {/* 版本对比常驻(与样例一致);同谱系只有一个版本时禁用并说明,不误导。 */}
            {(() => {
              const other = lineageSibs.find((s) => s.runId !== runId);
              const canCompare = lineageSibs.length >= 2 && !!other;
              return (
                <button disabled={!canCompare}
                  title={canCompare ? undefined : "只有一个版本 —— 重跑 / 衍生出新版本后即可两版对比"}
                  onClick={() => {
                    if (other) window.location.href = `/crossborder/research/report/?id=${encodeURIComponent(runId)}&vs=${encodeURIComponent(other.runId)}`;
                  }}><GitCompareArrows size={13} /> 版本对比</button>
              );
            })()}
            <button className={run.pinned ? "is-pinned" : ""} onClick={togglePin} disabled={pinning}>
              {run.pinned ? <><PinOff size={13} /> 取消参考</> : <><Pin size={13} /> 设为参考</>}
            </button>
            <button onClick={() => setShareOpen(true)}><Share2 size={13} /> 分享</button>
            <ActionMenu label="导出" icon={<Download size={13} />}>
              <button onClick={() => downloadWord(run)}><FileText size={13} /> 导出 Word</button>
              <button onClick={() => downloadMarkdown(run)}><Download size={13} /> 导出 Markdown</button>
              <button onClick={() => window.print()}><Printer size={13} /> 打印 / 存 PDF</button>
            </ActionMenu>
          </div>
          {shareOpen && <ShareModal runId={runId} onClose={() => setShareOpen(false)} />}
          {deriveMode && <DeriveDrawer run={run} mode={deriveMode} onClose={() => setDeriveMode(null)} />}
          <RescanCard run={run} onChange={load} />
          <ReportBody rep={rep} scope={scope} onRerunSection={async (module, title) => {
            // 单章重跑:复用全部证据(0 费),只付撰写段(上限 5 积分,按实结算);出同谱系新版本。
            if (!window.confirm(`只重写「${title}」这一章?\n复用全部证据,费用为撰写段(≤5 积分,按实结算),其余章节原样保留,生成同谱系新版本。`)) return;
            try {
              const r = await rerunSection(runId, module);
              window.location.href = `/crossborder/research/report/?id=${r.runId}`;
            } catch (e) {
              alert(e instanceof Error ? e.message : "重跑失败,请稍后再试。");
            }
          }} />
        </>
      )}
    </>
  );
}


function RunList() {
  const showExample = useSyncExternalStore(subscribeProducts, hasExampleProduct, () => false);
  const [runs, setRuns] = useState<ResearchRunListItem[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listResearch()
      .then(setRuns)
      .catch((e) => {
        const s = (e as Error & { status?: number }).status;
        setErr(s === 401 ? "请先登录查看你的研究报告。" : e instanceof Error ? e.message : "加载失败");
      });
  }, []);

  async function del(runId: string, name: string) {
    if (busy || !window.confirm(`删除研究报告「${name}」?已消耗的积分不退回,此操作不可撤销。`)) return;
    setBusy(runId);
    try {
      await deleteResearch(runId);
      setRuns((rs) => (rs ?? []).filter((r) => r.runId !== runId));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "删除失败,请稍后再试。");
    } finally { setBusy(null); }
  }

  if (err && !showExample) return <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>;
  if (!runs && !err) return <div className="fact-empty">加载中…</div>;
  const realRuns = runs ?? [];
  if (!realRuns.length && !showExample) {
    return (
      <div className="fact-empty">
        还没有研究报告。输入一个商品名,先扫描它的可研究性。
        <div className="fact-foot-actions" style={{ marginTop: 10 }}>
          <a className="fill" href="/crossborder/research/product-insight/">开始研究</a>
        </div>
      </div>
    );
  }
  // 谱系分组(生命周期 P0):按 lineageRootId 聚成「版本历史」。单版本组仍是普通行,
  // 不加冗余;多版本组显示版本链(补资料/换范围/升档标签)。runs 已按 createdAt 倒序。
  const groups: { root: string; items: ResearchRunListItem[] }[] = [];
  const idx = new Map<string, number>();
  for (const r of realRuns) {
    const root = r.lineageRootId || r.runId;
    if (!idx.has(root)) { idx.set(root, groups.length); groups.push({ root, items: [] }); }
    groups[idx.get(root)!].items.push(r);
  }

  return (
    <div className="deepr-list">
      {err && <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>}
      {showExample && (
        <div className="deepr-list-row is-example-report">
          <a className="deepr-row-main" href={EXAMPLE_RESEARCH_HREF}>
            <FileText size={15} />
            <div>
              <strong>
                {withMarket(EXAMPLE_RESEARCH_SCOPE.productName, EXAMPLE_RESEARCH_SCOPE.marketplace)}
                <ExampleReportBadge compact />
              </strong>
              <small>需求洞察 · 演示数据 · 非实时检索 · 未消耗积分</small>
            </div>
            <span className="deepr-status is-example">示例</span>
          </a>
        </div>
      )}
      {groups.map((g) => {
        const latest = g.items[0];   // 组内最新(倒序第一条)
        if (g.items.length === 1) {
          return (
            <div key={latest.runId} className="deepr-list-row">
              <a className="deepr-row-main" href={`/crossborder/research/report/?id=${encodeURIComponent(latest.runId)}`}>
                <FileText size={15} />
                <div>
                  <strong>{withMarket(latest.productName, latest.marketplace)}{latest.status === "done" && !latest.seen && <span className="deepr-new">NEW</span>}</strong>
                  <small>{fmtTime(latest.createdAt)} · {goalLine(latest)} · 已消耗 {latest.totalCharged.toLocaleString()} 积分</small>
                </div>
                <span className={`deepr-status is-${latest.status}`}>{STATUS_LABEL[latest.status]}</span>
              </a>
              <button className="deepr-del" disabled={busy === latest.runId} title="删除报告"
                onClick={() => del(latest.runId, withMarket(latest.productName, latest.marketplace))}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        }
        // 多版本:一个商品卡片 + 版本链(时间正序展示,最早在左)
        const ordered = [...g.items].reverse();
        return (
          <div key={g.root} className="deepr-lineage">
            <div className="deepr-lineage-head">
              <FileText size={15} />
              <strong>{withMarket(latest.productName, latest.marketplace)}{g.items.some((r) => r.status === "done" && !r.seen) && <span className="deepr-new">NEW</span>}</strong>
              <em>{g.items.length} 个版本 · 最新 {fmtTime(latest.createdAt).slice(0, 10)}</em>
            </div>
            <div className="deepr-versions">
              {ordered.map((r, i) => (
                <div key={r.runId} className={`deepr-version${r.runId === latest.runId ? " is-current" : ""}${r.pinned ? " is-pinned" : ""}`}>
                  <a className="deepr-version-main"
                    href={`/crossborder/research/report/?id=${encodeURIComponent(r.runId)}`}>
                    <b>v{i + 1}</b>
                    <span>{r.relation && r.relation !== "origin" ? RELATION_LABEL[r.relation] : goalLine(r)}</span>
                    {r.status === "done" && !r.seen && <i className="deepr-new-dot" title="未读" />}
                    {r.pinned && <Pin size={11} className="pin-i" />}
                    <small>{fmtTime(r.createdAt).slice(5, 10)}</small>
                  </a>
                  <button className="deepr-version-del" disabled={busy === r.runId} title="删除这一版"
                    onClick={() => del(r.runId, `${withMarket(r.productName, r.marketplace)} v${i + 1}`)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 负面主题集合(去重),用于版本间对比。 */
function negThemes(run: ResearchRun | null): string[] {
  return Array.from(new Set((run?.report?.findings?.voice?.negatives || []).map((n) => n.theme).filter(Boolean)));
}
function subjectsOf(run: ResearchRun | null): string[] {
  return (run?.report?.findings?.diffMatrix?.subjects || []).filter(Boolean);
}
function verdictMap(run: ResearchRun | null): Map<string, string> {
  return new Map((run?.report?.verdicts || []).map((v) => [v.tag, v.text]));
}

/** 版本对比视图(生命周期 P3):同一条谱系里两版报告的差异,纯读 report_json,不新增采集。 */
function CompareView({ aId, bId }: { aId: string; bId: string }) {
  const [runA, setRunA] = useState<ResearchRun | null>(null);
  const [runB, setRunB] = useState<ResearchRun | null>(null);
  const [siblings, setSiblings] = useState<ResearchRunListItem[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    Promise.all([getResearch(aId), getResearch(bId)])
      .then(([ra, rb]) => { setRunA(ra); setRunB(rb); })
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
    listResearch().then(setSiblings).catch(() => { /* 选择器可空 */ });
  }, [aId, bId]);

  if (err) return <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>;
  if (!runA || !runB) return <div className="fact-empty">加载中…</div>;
  if (!runA.report || !runB.report) return <div className="fact-empty">对比需要两份都已完成的报告。</div>;

  // 时间早的在左(旧版),晚的在右(新版)
  const [older, newer] = (new Date(runA.createdAt || 0) <= new Date(runB.createdAt || 0)) ? [runA, runB] : [runB, runA];
  const lineageRoot = newer.lineageRootId;
  const versions = siblings.filter((s) => (s.lineageRootId || s.runId) === lineageRoot && s.status === "done");

  const subOld = subjectsOf(older), subNew = subjectsOf(newer);
  const addedSubjects = subNew.filter((s) => !subOld.includes(s));
  const removedSubjects = subOld.filter((s) => !subNew.includes(s));
  const negOld = negThemes(older), negNew = negThemes(newer);
  const addedNeg = negNew.filter((t) => !negOld.includes(t));
  const goneNeg = negOld.filter((t) => !negNew.includes(t));
  const vOld = verdictMap(older), vNew = verdictMap(newer);
  const tags = Array.from(new Set([...vOld.keys(), ...vNew.keys()]));

  const srcOld = older.report!.sources.length, srcNew = newer.report!.sources.length;
  const relLabel = (r: ResearchRun) => (r.relation && r.relation !== "origin" ? RELATION_LABEL[r.relation] : "原创");
  const head = (r: ResearchRun, side: string) => (
    <div className="deepr-cmp-card">
      <div className="deepr-cmp-side">{side}{r.pinned && <Pin size={11} className="pin-i" />}</div>
      <b>{goalLine(r.scope)}</b>
      <span>{MARKET_LABEL[r.scope.marketplace] ?? r.scope.marketplace} · {relLabel(r)}</span>
      <small>{fmtTime(r.createdAt).slice(0, 16)} · {r.report!.sources.length} 来源</small>
    </div>
  );

  return (
    <>
      <div className="deepr-head"><div>
        <h1><GitCompareArrows size={20} strokeWidth={1.8} /> 版本对比 · {newer.scope.productName}</h1>
        <p>同一条版本链里两版报告的差异 —— 看重跑后口碑、竞品与结论怎么变了。</p>
      </div></div>

      <div className="deepr-cmp-heads">
        {head(older, "旧版")}
        <GitCompareArrows size={18} className="deepr-cmp-vs" />
        {head(newer, "新版")}
      </div>

      {versions.length > 2 && (
        <label className="deepr-cmp-pick">换对比版本:
          <select value={older.runId} onChange={(e) => { window.location.href = `/crossborder/research/report/?id=${encodeURIComponent(newer.runId)}&vs=${encodeURIComponent(e.target.value)}`; }}>
            {versions.filter((v) => v.runId !== newer.runId).map((v) => (
              <option key={v.runId} value={v.runId}>{RELATION_LABEL[v.relation || "origin"]} · {fmtTime(v.createdAt).slice(0, 10)}</option>
            ))}
          </select>
        </label>
      )}

      <div className="deepr-cmp-block">
        <h3>变化摘要</h3>
        <div className="deepr-cmp-deltas">
          <div><span>来源数</span><b>{srcOld} → {srcNew}</b>{srcNew !== srcOld && <em className={srcNew > srcOld ? "up" : "down"}>{srcNew > srcOld ? "+" : ""}{srcNew - srcOld}</em>}</div>
          {(subOld.length > 0 || subNew.length > 0) && <div><span>对比主体</span><b>{subOld.length} → {subNew.length}</b></div>}
          <div><span>负面主题</span><b>{negOld.length} → {negNew.length}</b></div>
        </div>
        {(addedSubjects.length > 0 || removedSubjects.length > 0) && (
          <p className="deepr-cmp-chips">
            {addedSubjects.map((s) => <i key={s} className="add">+ {s}</i>)}
            {removedSubjects.map((s) => <i key={s} className="gone">− {s}</i>)}
            <small>对比主体变化</small>
          </p>
        )}
        {(addedNeg.length > 0 || goneNeg.length > 0) && (
          <p className="deepr-cmp-chips">
            {addedNeg.map((s) => <i key={s} className="add">新增 {s}</i>)}
            {goneNeg.map((s) => <i key={s} className="gone">不再 {s}</i>)}
            <small>负面主题变化</small>
          </p>
        )}
        {addedSubjects.length === 0 && removedSubjects.length === 0 && addedNeg.length === 0 && goneNeg.length === 0 && (
          <p className="rc-note">两版在主体与负面主题上没有明显增减 —— 变化更多在结论措辞与证据数(见下)。</p>
        )}
      </div>

      <div className="deepr-cmp-block">
        <h3>一页结论逐条对比</h3>
        <div className="rr-table-wrap">
          <table className="rr-table deepr-cmp-verdicts">
            <thead><tr><th>维度</th><th>旧版</th><th>新版</th></tr></thead>
            <tbody>
              {tags.map((t) => {
                const a = vOld.get(t) || "—", b = vNew.get(t) || "—";
                return <tr key={t} className={a !== b ? "is-diff" : ""}><td><b>{t}</b></td><td>{a}</td><td>{b}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <p className="rc-note">高亮行为两版结论措辞有变动处;结论级证据与来源以各自报告页为准。</p>
      </div>
    </>
  );
}

export function ResearchReportView() {
  // 静态导出:URL 参数只能在客户端拿,挂载前渲染骨架避免水合不一致。
  const showExample = useSyncExternalStore(subscribeProducts, hasExampleProduct, () => false);
  const [ready, setReady] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [vsId, setVsId] = useState<string | null>(null);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setRunId(q.get("id"));
    setVsId(q.get("vs"));
    setSample(isExampleReportParam(q.get("sample")));
    setReady(true);
  }, []);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rr-page">
        {/* 对比页回退到左侧报告;详情页回退到列表;列表页回退到首页 */}
        <a className="tool-breadcrumb" href={vsId && runId ? `/crossborder/research/report/?id=${encodeURIComponent(runId)}` : (runId || sample) ? "/crossborder/research/report/" : "/crossborder/research/"}>
          <ArrowLeft size={13} /> {vsId && runId ? "返回报告" : (runId || sample) ? "我的研究报告" : "深度研究"}
        </a>
        {!ready ? <div className="fact-empty">加载中…</div>
          : runId && vsId ? <CompareView aId={runId} bId={vsId} />
          : runId ? <RunDetail runId={runId} />
          : sample ? (showExample
            ? <ExampleProductResearchReport />
            : <div className="fact-empty">示例商品档案已不存在，因此这份虚拟示例报告不再展示。</div>)
          : (
            <>
              <div className="deepr-head"><div><h1>我的研究报告</h1><p>分阶段生成 · 存在你的账号里</p></div></div>
              <RunList />
            </>
          )}
      </section>
      <SiteFooter />
    </main>
  );
}
