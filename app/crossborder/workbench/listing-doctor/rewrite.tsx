"use client";

/**
 * 改写与复检 —— Listing 诊断工作台的第三段。
 *
 * 改写是整条流程里唯一让模型产出成品的环节，也是幻觉唯一的入口。
 * 所以改写完不是结束，而是要把成品重新丢回同一套确定性诊断里跑一遍：
 * 模型新编的卖点会被事实库当场抓住。提示词不是最后一道防线，复检才是。
 *
 * 复检不通过的稿子不给导出 —— 导出等于交付，交付一份带虚假声明的文案没有意义。
 */

import { useMemo, useState } from "react";
import { aiFetch, aiJson } from "../../../../lib/api";
import {
  AlertTriangle, ArrowRight, Check, Copy, Download, PenLine, RefreshCw, ShieldCheck,
} from "lucide-react";
import { AigcBadge, withAigcMark } from "../../aigc";
import { blockedFacts, writableFacts, type ProductProject } from "../../../../lib/crossborder/product-facts";
import { diagnose, summarize, summaryText, type Finding } from "../../../../lib/crossborder/listing-diagnosis";

type Draft = { title: string; bullets: string[]; notes: string[] };
type ApiResponse = Draft & { error?: string; titleMaxChars?: number | null; usedFacts?: number };

function DiffRow({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before.trim() !== after.trim();
  return (
    <div className={`diff-row${changed ? " is-changed" : ""}`}>
      <span className="diff-label">{label}</span>
      <div className="diff-before"><small>改前 · {[...before].length} 字符</small><p>{before || "（空）"}</p></div>
      <ArrowRight size={13} />
      <div className="diff-after"><small>改后 · {[...after].length} 字符</small><p>{after || "（空）"}</p></div>
    </div>
  );
}

export function RewritePanel({ project, onChange }: {
  project: ProductProject;
  onChange: (p: ProductProject) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const confirmed = writableFacts(project);
  const blocked = blockedFacts(project);

  // 复检：把改写结果丢回同一套确定性引擎。用的是同一个事实库与同一份政策快照。
  const recheck = useMemo<Finding[] | null>(
    () => (draft
      ? diagnose({
          listingTitle: draft.title,
          bullets: draft.bullets,
          keywords: project.keywords,
          project,
          snapshot: project.snapshot,
        })
      : null),
    [draft, project],
  );
  const recheckSummary = useMemo(() => (recheck ? summarize(recheck) : null), [recheck]);
  const blocking = recheck?.filter((f) => f.level === "violation" || f.level === "risk") ?? [];
  const clean = Boolean(draft) && blocking.length === 0;

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await aiFetch("/api/crossborder/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project }),
      });
      const data = await aiJson<ApiResponse>(res);
      setDraft({ title: data.title, bullets: data.bullets, notes: data.notes });
    } catch (e) {
      setError(e instanceof Error ? e.message : "改写失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  function adopt() {
    if (!draft) return;
    onChange({ ...project, listing: { title: draft.title, bullets: draft.bullets }, updatedAt: Date.now() });
    setDraft(null);
  }

  function exportText(): string {
    if (!draft) return "";
    return [
      `商品：${project.name || "未命名"} · ${project.marketplace}`,
      "",
      "【标题】",
      draft.title,
      "",
      "【五点描述】",
      ...draft.bullets.map((b, i) => `${i + 1}. ${b}`),
      "",
      "【依据 · 已确认事实】",
      ...confirmed.map((f) => `- ${f.label}：${f.value}（${f.sourceNote}）`),
      "",
      "【未确认，文案未提及】",
      blocked.map((f) => f.label).join("、") || "（无）",
      "",
      "本文案仅使用上述已确认事实。结果不替代平台审核或法律意见。",
    ].join("\n");
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(withAigcMark(exportText()));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }


  return (
    <div className="wb-grid">
      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><PenLine size={15} /> 按诊断改写</span>
            <em>{confirmed.length} 条已确认事实可用</em>
          </div>
          <p className="fact-note" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
            只把<b>已确认的事实</b>交给模型，未确认的<b>连值都不给它看</b> —— 看不见就编不出来。
            禁止提及的 {blocked.length} 项只给标签、不给内容。
          </p>
          <div className="fact-foot-actions">
            <button className="fill" onClick={run} disabled={loading || !confirmed.length}>
              {loading ? <><RefreshCw size={12} className="spin" /> 改写中…</> : <><PenLine size={12} /> 生成改写稿</>}
            </button>
            {draft && <button onClick={adopt} disabled={!clean} title={clean ? "" : "复检未通过，先修问题"}>采用为当前 Listing</button>}
          </div>
          {!confirmed.length && (
            <div className="conflict-item info">
              <AlertTriangle size={14} />
              <span>事实库里还没有已确认的事实。没有事实就没有可写的内容 —— 先在上一段导入资料并逐条确认。</span>
            </div>
          )}
          {error && <div className="tool-error"><AlertTriangle size={15} /><span>{error}</span></div>}

          {draft && draft.notes.length > 0 && (
            <div className="rewrite-notes">
              <div className="card-title"><span>改了什么 <AigcBadge compact /></span><small>模型自述</small></div>
              <ul>{draft.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}
        </div>

        {draft && (
          <div className="wb-block">
            <div className="section-heading"><span>修改前后</span><em>逐条对照</em></div>
            <div className="diff-list">
              <DiffRow label="标题" before={project.listing.title} after={draft.title} />
              {draft.bullets.map((b, i) => (
                <DiffRow key={i} label={`五点 ${i + 1}`} before={project.listing.bullets[i] ?? ""} after={b} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><ShieldCheck size={15} /> 改写后复检</span>
            <em>{draft ? (clean ? "通过" : "未通过") : "待生成"}</em>
          </div>

          {!draft ? (
            <div className="fact-empty">生成改写稿后，会用<b>同一套确定性引擎</b>再检一遍 —— 模型新编的卖点会被当场抓住。</div>
          ) : (
            <>
              <div className={`diag-summary ${clean ? "" : "is-partial"}`}>
                {clean ? <Check size={14} /> : <AlertTriangle size={14} />}
                <span>
                  {clean
                    ? `复检通过：改写稿没有引入违反规则或高风险的声明。${recheckSummary && !recheckSummary.conclusive ? "仍有无法判断项，结论不完整。" : ""}`
                    : `复检未通过：改写稿仍有 ${blocking.length} 处需要处理，不建议直接使用。`}
                </span>
              </div>

              {recheckSummary && (
                <div className="diag-counts">
                  <div><small>违反规则</small><strong className={recheckSummary.violations ? "neg" : ""}>{recheckSummary.violations}</strong></div>
                  <div><small>高风险</small><strong className={recheckSummary.risks ? "neg" : ""}>{recheckSummary.risks}</strong></div>
                  <div><small>待补</small><strong>{recheckSummary.gaps}</strong></div>
                  <div><small>无法判断</small><strong className={recheckSummary.unknowns ? "warn" : ""}>{recheckSummary.unknowns}</strong></div>
                </div>
              )}

              <div className="finding-list">
                {recheck!.map((f) => (
                  <div className={`finding is-${f.level}`} key={f.id}>
                    <div className="finding-head">
                      <span className={`finding-badge ${f.level}`}>
                        {f.level === "violation" ? "违反官方规则" : f.level === "risk" ? "高风险"
                          : f.level === "gap" ? "待补" : f.level === "unknown" ? "无法判断" : "说明"}
                      </span>
                      <strong>{f.title}</strong>
                    </div>
                    <p>{f.detail}</p>
                  </div>
                ))}
              </div>

              <div className="fact-foot-actions">
                <button className="fill" onClick={copyExport} disabled={!clean}
                  title={clean ? "" : "复检未通过，不提供导出"}>
                  {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 导出（含依据）</>}
                </button>
                {!clean && <span className="fact-note" style={{ border: 0, padding: 0, margin: 0 }}>
                  <Download size={11} /> 复检未通过不给导出 —— 导出等于交付。
                </span>}
              </div>
              <p className="fact-note">{recheckSummary ? summaryText(recheckSummary) : ""}</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
