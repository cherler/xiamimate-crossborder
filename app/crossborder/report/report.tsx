"use client";

/**
 * 深度舆情报告结果页。
 *
 * ?id=run_xxx 展示单份报告(静态导出下参数在客户端读);无 id 列出我的报告。
 * 运行中每 3 秒轮询;paused_insufficient / failed 提供续跑入口 ——
 * 已完成的段落后端不会重复扣费,这一点直接写在界面上。
 */

import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode,
} from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, CircleDashed, FileText, Package,
  PauseCircle, Pencil, RefreshCw, Trash2,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import {
  STAGE_LABEL, bindReportProduct, deleteReport, getReport, listReports, renameReport, resumeReport,
  type ReportRun, type RunListItem,
} from "../../../lib/crossborder/deep-report";
import {
  EXAMPLE_VOICE_HREF, EXAMPLE_VOICE_REPORT, hasExampleProduct, isExampleReportParam,
} from "../../../lib/crossborder/example-reports";
import { subscribeProducts } from "../../../lib/crossborder/products";
import { AigcBadge } from "../aigc";
import { BindProductMenu } from "../bind-product-menu";
import { ExampleReportBadge } from "../example-report-ui";
import { ExampleProductVoiceReport } from "./example-product-report";
import { ReportThemeTable } from "./theme-table";

const SEV_RANK: Record<string, number> = { high: 3, mid: 2, low: 1 };
const SEV_LABEL = { high: "高", mid: "中", low: "低" } as const;

/** 轻量下拉容器:与研究报告页 ActionMenu 同版式(rr-menu-*),供归属菜单复用。 */
function MiniMenu({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className="rr-menu-wrap" ref={ref}>
      <button className={open ? "is-open" : ""} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        {icon} {label} <ChevronDown size={12} />
      </button>
      {open && <div className="rr-menu" role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

/**
 * 模型输出防御:report 各数组字段约定是字符串,但模型偶尔会给出
 * {note/theme/evidence} 这类对象 —— 直接进 JSX 会整页崩溃(付费页白屏)。
 * 一律在渲染前压成字符串,取其中最像正文的字段。
 */
function toText(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    const main = o.note ?? o.text ?? o.action ?? o.summary ?? o.theme;
    if (typeof main === "string") {
      const extra = typeof o.evidence === "string" ? `(${o.evidence})` : "";
      return main + extra;
    }
    try { return JSON.stringify(x); } catch { return String(x); }
  }
  return x == null ? "" : String(x);
}
const STATUS_LABEL: Record<ReportRun["status"], string> = {
  running: "生成中",
  paused_insufficient: "余额不足 · 已暂停",
  failed: "生成失败",
  done: "已完成",
};

function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function StageRail({ run }: { run: ReportRun }) {
  return (
    <div className="deepr-rail">
      {run.stages.map((s) => (
        <div key={s.name} className={`deepr-stage is-${s.status}`}>
          {s.status === "done" ? <CheckCircle2 size={14} />
            : s.status === "skipped" ? <CircleDashed size={14} />
            : run.status === "running" ? <RefreshCw size={14} className="spin" />
            : <PauseCircle size={14} />}
          <span>{STAGE_LABEL[s.name]}</span>
          <em>{s.status === "done" ? (s.charged ? `消耗 ${s.charged.toLocaleString()} 积分` : "免费")
            : s.status === "skipped" ? "无竞品,跳过"
            : `预估 ≤ ${s.estimate.toLocaleString()}`}</em>
        </div>
      ))}
    </div>
  );
}

/**
 * 溯源 · 原始输入:把当时喂进报告的商品背景 + 我方/竞品评论原文摊开,让用户能核对
 * 「这份报告是怎么来的、分析了哪些评论」。默认折叠,不干扰阅读结论。
 */
function SourceTrace({ run }: { run: ReportRun }) {
  const [open, setOpen] = useState(false);
  const reviews = run.sourceReviews ?? [];
  const competitor = run.sourceCompetitor ?? [];
  if (!reviews.length && !competitor.length) return null;
  return (
    <div className="wb-block deepr-trace">
      <button className={`deepr-trace-toggle${open ? " is-open" : ""}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open}>
        <span><Package size={14} /> 溯源 · 原始输入</span>
        <em>
          {run.productName || "未命名商品"} · {reviews.length} 条评论
          {competitor.length ? ` + ${competitor.length} 条竞品` : ""}
          <ChevronDown size={14} className="deepr-trace-caret" />
        </em>
      </button>
      {open && (
        <div className="deepr-trace-body">
          {run.productContext
            ? <p className="fact-note" style={{ marginTop: 0 }}>商品背景:{run.productContext}</p>
            : null}
          <div className="section-heading"><span>我方评论</span><em>{reviews.length} 条</em></div>
          <div className="deepr-trace-list">
            {reviews.map((r) => (
              <div key={r.id} className="deepr-trace-row">
                <span>{r.rating ? `${r.rating}★` : "—"}</span><q>{r.text}</q>
              </div>
            ))}
          </div>
          {competitor.length > 0 && (
            <>
              <div className="section-heading mt-gap"><span>竞品评论</span><em>{competitor.length} 条</em></div>
              <div className="deepr-trace-list">
                {competitor.map((r) => (
                  <div key={r.id} className="deepr-trace-row">
                    <span>{r.rating ? `${r.rating}★` : "—"}</span><q>{r.text}</q>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<ReportRun | null>(null);
  const [err, setErr] = useState("");
  const [resuming, setResuming] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await getReport(runId);
      // 虾米君共情:跑完戴博士帽庆祝(#73);失败时叹口气(#pet-p0,不下结论、只共情)。
      if (prevStatus.current === "running" && r.status === "done") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "celebrate" } }));
      } else if (prevStatus.current === "running" && r.status === "failed") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "sigh" } }));
      } else if (prevStatus.current === null && r.status === "running") {
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "eager", text: "开跑啦,等我~" } }));
      }
      // 研究进行中心跳:让虾米君一直举着放大镜(每次轮询续命)。
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
      setErr(s === 401 ? "请先登录 —— 报告存在你的账号里。" : e instanceof Error ? e.message : "加载失败");
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
      await resumeReport(runId);
      if (!timer.current) timer.current = setInterval(load, 3000);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "续跑失败");
    } finally {
      setResuming(false);
    }
  }

  if (err && !run) return <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>;
  if (!run) return <div className="fact-empty">加载中…</div>;

  const rep = run.report?.report;
  /**
   * 存量报告的占比校正(渲染层,不改写落库数据)。
   *
   * 「占比一律用真实聚合覆盖模型报数」是后加的。在它上线之前生成的报告,
   * report_json 里存的仍是模型自报的数字 —— 生产上就有一份:5 条问题的主题
   * 在真实样本里根本不存在,今天打开照样印「33% 样本提及」。
   * 落库的旧报告永不改写(渲染确定性的根),所以在这里按当时的真实聚合复核:
   * 对不上就不显示这个数,而不是印一个查无实据的百分比。
   */
  const realShare = (theme: string): number | null => {
    const t = (run.report?.themes ?? []).find((x) => x.theme?.trim() === theme?.trim());
    return t ? t.share : null;
  };
  const stats = run.report?.stats;

  return (
    <>
      <div className={`deepr-head is-${run.status}`}>
        <div>
          <h1>{run.productName || "深度用户声音报告"}</h1>
          <p>
            {fmtTime(run.createdAt)} · {run.inputSummary?.reviews ?? "—"} 条评论
            {run.inputSummary?.competitor ? ` + ${run.inputSummary.competitor} 条竞品` : ""} ·
            已消耗 <b>{run.totalCharged.toLocaleString()}</b> 积分(预估上限 {run.quote.toLocaleString()})
          </p>
        </div>
        <div className="deepr-head-tags">
          <AigcBadge />
          <span className={`deepr-status is-${run.status}`}>{STATUS_LABEL[run.status]}</span>
        </div>
      </div>

      {run.status === "done" && (
        <div className="rr-actions-bar">
          <BindProductMenu
            productRef={run.productRef ?? null}
            productName={run.productName || ""}
            onBind={(ref, name) => bindReportProduct(run.runId, ref, name)}
            onBound={(ref) => setRun((r) => (r ? { ...r, productRef: ref } : r))}
            menu={(label, icon, children) => <MiniMenu label={label} icon={icon}>{children}</MiniMenu>}
          />
        </div>
      )}

      <StageRail run={run} />

      <SourceTrace run={run} />

      {run.status === "paused_insufficient" && (
        <div className="wb-block deepr-pause">
          <div className="conflict-item warn"><AlertTriangle size={14} /><span>{run.error || "余额不足,已暂停。"}</span></div>
          <p className="fact-note">
            已完成的段落与扣费都保留着 —— 补足余额后点击续跑,<b>只为剩余段落消耗积分,不会重复扣</b>。
          </p>
          <div className="fact-foot-actions">
            <button className="fill" onClick={resume} disabled={resuming}>
              {resuming ? <><RefreshCw size={12} className="spin" /> 续跑中…</> : "余额已补足,继续生成"}
            </button>
          </div>
        </div>
      )}
      {run.status === "failed" && (
        <div className="wb-block deepr-pause">
          <div className="conflict-item warn"><AlertTriangle size={14} /><span>生成失败:{run.error || "未知错误"}。失败段落的冻结积分已退回。</span></div>
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
          <div className="wb-block deepr-summary">
            <div className="section-heading"><span>执行摘要</span>
              <em>{stats ? `${stats.total} 条 · 均分 ${stats.avgRating ?? "—"}` : ""}</em>
            </div>
            <p>{toText(rep.summary)}</p>
          </div>

          {!!rep.topIssues?.length && (
            <div className="wb-block">
              <div className="section-heading"><span>问题清单</span><em>按严重度排序 · 有原文的排在前面</em></div>
              <div className="deepr-issues">
                {/* 副标题此前写「按严重度排序 · 每条带原文证据」,两句都不成立:
                    sanitize 完全保留模型给的顺序,也不强制 evidence。
                    与其改文案糊弄,不如真的排 —— 有证据的、严重的排前面。 */}
                {[...rep.topIssues].sort((a, b) =>
                  (b.evidence?.length ? 1 : 0) - (a.evidence?.length ? 1 : 0)
                  || (SEV_RANK[b.severity ?? ""] ?? 0) - (SEV_RANK[a.severity ?? ""] ?? 0)
                ).map((it, i) => (
                  <div key={i} className={`deepr-issue sev-${it.severity ?? "none"}`}>
                    <div className="deepr-issue-head">
                      {/* 没有原文证据的条目不摆「严重度」——「严重度 高」看起来同样权威,
                          但读者无从分辨它是从样本归纳出来的,还是模型自由发挥的。 */}
                      {it.severity
                        ? <span className={`deepr-sev sev-${it.severity}`}>严重度 {SEV_LABEL[it.severity] ?? toText(it.severity)}</span>
                        : <span className="deepr-sev is-noev">无原文支撑 · 供参考</span>}
                      <strong>{toText(it.theme)}</strong>
                      {/* 占比取自真实聚合;模型自造的主题对不上样本 → 不显示,
                          而不是印一个「0% 样本提及」冒充数据。 */}
                      {(() => {
                        const v = realShare(toText(it.theme));
                        return typeof v === "number" ? <em>{Math.round(v * 100)}% 样本提及</em> : null;
                      })()}
                    </div>
                    {it.evidence?.map((q, j) => <q key={j}>{toText(q)}</q>)}
                    <div className="deepr-issue-foot">
                      {it.affected?.map((a, j) => <span key={j} className="deepr-chip">{toText(a)}</span>)}
                      <p>{toText(it.action)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!rep.positives?.length && (
            <div className="wb-block">
              <div className="section-heading"><span>可放大的卖点</span><em>{rep.positives.length} 个</em></div>
              <div className="deepr-pos-list">
                {rep.positives.map((p, i) => (
                  <div key={i} className="deepr-pos">
                    <strong>{p.theme}</strong>
                    {/* 卖点占比同样按真实聚合复核 —— 存量报告里这个数可能是模型编的 */}
                    {(() => {
                      const v = realShare(toText(p.theme));
                      return typeof v === "number" ? <em>{Math.round(v * 100)}%</em> : null;
                    })()}
                    <p>{toText(p.note)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ReportThemeTable title="全部主题(我方)" themes={run.report?.themes ?? []} />
          <ReportThemeTable title="竞品主题" themes={run.report?.competitorThemes ?? []} />

          {!!rep.competitorNotes?.length && (
            <div className="wb-block">
              <div className="section-heading"><span>与竞品的可行动差异</span><em>{rep.competitorNotes.length} 条</em></div>
              <ul className="deepr-notes">{rep.competitorNotes.map((n, i) => <li key={i}>{toText(n)}</li>)}</ul>
            </div>
          )}

          {!!rep.cautions?.length && (
            <div className="wb-block deepr-cautions">
              <div className="section-heading"><span>口径与样本注意</span><em>结论的边界</em></div>
              <ul className="deepr-notes">{rep.cautions.map((n, i) => <li key={i}>{toText(n)}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

function RunList() {
  const showExample = useSyncExternalStore(subscribeProducts, hasExampleProduct, () => false);
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    listReports()
      .then(setRuns)
      .catch((e) => {
        const s = (e as Error & { status?: number }).status;
        setErr(s === 401 ? "请先登录查看你的报告。" : e instanceof Error ? e.message : "加载失败");
      });
  }, []);

  async function rename(e: MouseEvent, r: RunListItem) {
    e.preventDefault();
    const name = window.prompt("给这份报告改个名字(即它绑定的商品名):", r.productName || "");
    if (name == null || !name.trim()) return;
    const trimmed = name.trim();
    setBusy(r.runId); setErr("");
    try {
      await renameReport(r.runId, trimmed);
      setRuns((xs) => xs?.map((x) => (x.runId === r.runId ? { ...x, productName: trimmed } : x)) ?? xs);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "改名失败"); }
    finally { setBusy(""); }
  }

  async function remove(e: MouseEvent, r: RunListItem) {
    e.preventDefault();
    if (!window.confirm(`删除报告「${r.productName || "未命名商品"}」?\n已消耗的积分不退(报告是已交付产物)。`)) return;
    setBusy(r.runId); setErr("");
    try {
      await deleteReport(r.runId);
      setRuns((xs) => xs?.filter((x) => x.runId !== r.runId) ?? xs);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "删除失败"); }
    finally { setBusy(""); }
  }

  if (err && !showExample) return <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>;
  if (!runs && !err) return <div className="fact-empty">加载中…</div>;
  const realRuns = runs ?? [];
  if (!realRuns.length && !showExample) {
    return (
      <div className="fact-empty">
        还没有报告。去「用户声音与竞品洞察」取一批评论(从商品档案选,或上传 CSV)、跑完主题分析后,即可升级为深度用户声音报告。
        <div className="fact-foot-actions" style={{ marginTop: 10 }}>
          <a className="fill" href="/crossborder/workbench/voice-insight/">去分析评论</a>
        </div>
      </div>
    );
  }
  return (
    <div className="deepr-list">
      {err && <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>}
      {showExample && (
        <div className="deepr-list-row is-example-report">
          <a className="deepr-list-main" href={EXAMPLE_VOICE_HREF}>
            <FileText size={15} />
            <div>
              <strong>{EXAMPLE_VOICE_REPORT.productName} <ExampleReportBadge compact /></strong>
              <small>演示数据 · 非实时分析 · 未消耗积分</small>
            </div>
          </a>
          <span className="deepr-status is-example">示例</span>
        </div>
      )}
      {realRuns.map((r) => (
        <div key={r.runId} className="deepr-list-row">
          <a className="deepr-list-main" href={`/crossborder/report/?id=${encodeURIComponent(r.runId)}`}>
            <FileText size={15} />
            <div>
              <strong>{r.productName || "未命名商品"}</strong>
              <small>{fmtTime(r.createdAt)} · 已消耗 {r.totalCharged.toLocaleString()} 积分</small>
            </div>
          </a>
          <span className={`deepr-status is-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          <div className="deepr-row-actions">
            <button title="改名" aria-label="改名" onClick={(e) => rename(e, r)} disabled={busy === r.runId}>
              <Pencil size={14} />
            </button>
            <button title="删除" aria-label="删除" className="danger" onClick={(e) => remove(e, r)} disabled={busy === r.runId}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportView() {
  // 静态导出:URL 参数只能在客户端拿,挂载前渲染骨架避免水合不一致。
  const showExample = useSyncExternalStore(subscribeProducts, hasExampleProduct, () => false);
  const [ready, setReady] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setRunId(q.get("id"));
    setSample(isExampleReportParam(q.get("sample")));
    setReady(true);
  }, []);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page deepr-page">
        <a className="tool-breadcrumb" href={runId || sample ? "/crossborder/report/" : "/crossborder/workbench/voice-insight/"}>
          <ArrowLeft size={13} /> {runId || sample ? "我的用户声音报告" : "用户声音与竞品洞察"}
        </a>
        {!ready ? <div className="fact-empty">加载中…</div>
          : runId ? <RunDetail runId={runId} />
          : sample ? (showExample
            ? <ExampleProductVoiceReport />
            : <div className="fact-empty">示例商品档案已不存在，因此这份虚拟示例报告不再展示。</div>)
          : (
            <>
              <div className="deepr-head"><div><h1>用户声音报告</h1><p>分段生成 · 按实际用量消耗积分 · 每份都挂在对应商品名下,可溯源</p></div></div>
              <RunList />
            </>
          )}
      </section>
      <SiteFooter />
    </main>
  );
}
