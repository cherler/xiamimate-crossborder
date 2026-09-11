"use client";

/**
 * 诊断面板 —— Listing 诊断工作台的第二段。
 *
 * 三块输入都由你提供：现有 Listing、关键词、政策快照。我们不代查、不抓取。
 * 判定本身不调模型（见 listing-diagnosis.ts），所以同一份输入永远得到同一份结论。
 *
 * 政策检索是显式动作、结果存进项目，不是每次诊断偷偷搜一遍 ——
 * 否则今天说超限、明天说没事，等于没结论。
 */

import { useMemo, useState } from "react";
import { aiFetch, aiJson } from "../../../../lib/api";
import {
  AlertTriangle, CheckCircle2, ExternalLink, FileSearch, HelpCircle, Info,
  RefreshCw, Search, Tag,
} from "lucide-react";
import { processKeywords } from "../../../../lib/crossborder/calculators/keyword";
import {
  advisoryRules, describeRetrieval, hardRules, isStale, verdictText,
  type PolicyRule,
} from "../../../../lib/crossborder/policy-snapshot";
import { diagnose, summarize, summaryText, type Finding } from "../../../../lib/crossborder/listing-diagnosis";
import { touch, type ProductProject } from "../../../../lib/crossborder/product-facts";

const DEFAULT_QUERY = "Amazon product title character limit rules 2026";

type ApiRule = PolicyRule;
type ApiResponse = { rules?: ApiRule[]; retrievedAt?: number; provider?: string; error?: string; reason?: string };

const LEVEL_META: Record<Finding["level"], { label: string; cls: string }> = {
  violation: { label: "违反官方规则", cls: "violation" },
  risk: { label: "高风险", cls: "risk" },
  gap: { label: "待补", cls: "gap" },
  unknown: { label: "无法判断", cls: "unknown" },
  info: { label: "说明", cls: "info" },
};

function FindingRow({ f }: { f: Finding }) {
  const meta = LEVEL_META[f.level];
  return (
    <div className={`finding is-${meta.cls}`}>
      <div className="finding-head">
        <span className={`finding-badge ${meta.cls}`}>{meta.label}</span>
        <strong>{f.title}</strong>
      </div>
      <p>{f.detail}</p>
      {f.evidence && (
        <div className="finding-evidence">
          <FileSearch size={11} />
          <span>{f.evidence}</span>
          {f.sourceUrl && (
            <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer">
              来源 <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, onToggle }: { rule: PolicyRule; onToggle: () => void }) {
  return (
    <div className={`rule-row is-${rule.tier}`}>
      <div className="rule-head">
        <span className={`rule-tier ${rule.tier}`}>{rule.tier === "official" ? "官方" : "非官方"}</span>
        <strong>{rule.claim}</strong>
      </div>
      <div className="rule-quote"><q>{rule.quote}</q></div>
      <div className="rule-foot">
        <a href={rule.url} target="_blank" rel="noopener noreferrer">
          {new URL(rule.url).hostname} <ExternalLink size={9} />
        </a>
        {rule.effectiveFrom && <em>{rule.effectiveFrom} 起生效</em>}
        {rule.tier === "official" ? (
          <button className={rule.status === "confirmed" ? "fill" : ""} onClick={onToggle}>
            {rule.status === "confirmed" ? "已核对 · 参与判定" : "核对后用于判定"}
          </button>
        ) : (
          <span className="rule-note" title="非官方来源不能作为判定依据">仅提示 · 不参与判定</span>
        )}
      </div>
    </div>
  );
}

export function DiagnosisPanel({ project, onChange }: {
  project: ProductProject;
  onChange: (p: ProductProject) => void;
}) {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [kwText, setKwText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quotaOut, setQuotaOut] = useState(false);

  const findings = useMemo(
    () => diagnose({
      listingTitle: project.listing.title,
      bullets: project.listing.bullets,
      keywords: project.keywords,
      project,
      snapshot: project.snapshot,
    }),
    [project],
  );
  const summary = useMemo(() => summarize(findings), [findings]);
  const hard = hardRules(project.snapshot);
  const advisory = advisoryRules(project.snapshot);
  const stale = project.snapshot.rules.length > 0 && isStale(project.snapshot.retrievedAt);

  const setListing = (patch: Partial<ProductProject["listing"]>) =>
    onChange(touch({ ...project, listing: { ...project.listing, ...patch } }));

  function applyKeywords() {
    // 复用关键词清洗引擎：切分 + 去重 + 保留首次写法。
    const r = processKeywords(kwText);
    onChange(touch({ ...project, keywords: r.unique }));
    setKwText("");
  }

  async function retrieve() {
    setLoading(true);
    setError("");
    setQuotaOut(false);
    try {
      const res = await aiFetch("/api/crossborder/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, marketplace: project.marketplace }),
      });
      if (!res.ok) {
        // 额度用完与「坏了」必须分得清 —— 用户需要知道是没钱了还是出故障了。
        let err: { error?: string; reason?: string } = {};
        try { err = await res.json(); } catch { /* 空/非JSON响应体(如405) */ }
        if (err.reason === "quota_exhausted") setQuotaOut(true);
        throw new Error(err.error || `请求失败(${res.status}),服务暂时不可用,请稍后重试。`);
      }
      const data = await aiJson<ApiResponse>(res);
      onChange(touch({
        ...project,
        snapshot: {
          query,
          marketplace: project.marketplace,
          rules: data.rules ?? [],
          retrievedAt: data.retrievedAt ?? Date.now(),
          version: 1,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "检索失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  const toggleRule = (id: string) =>
    onChange(touch({
      ...project,
      snapshot: {
        ...project.snapshot,
        rules: project.snapshot.rules.map((r) => (r.id === id
          ? { ...r, status: r.status === "confirmed" ? "unconfirmed" as const : "confirmed" as const }
          : r)),
      },
    }));

  return (
    <div className="wb-grid">
      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><Tag size={15} /> 现有 Listing</span><em>诊断的对象</em></div>
          <label className="gen-field">
            <span>标题</span>
            <textarea className="mt-textarea" style={{ minHeight: 60 }} value={project.listing.title}
              placeholder="粘贴当前商品标题…" onChange={(e) => setListing({ title: e.target.value })} />
          </label>
          <label className="gen-field">
            <span>五点描述（每行一条）</span>
            <textarea className="mt-textarea" style={{ minHeight: 110 }} value={project.listing.bullets.join("\n")}
              placeholder="粘贴当前五点描述，每行一条…"
              onChange={(e) => setListing({ bullets: e.target.value.split("\n").filter((b) => b.trim()) })} />
          </label>
        </div>

        <div className="wb-block">
          <div className="section-heading"><span><Search size={15} /> 关键词</span>
            <em>{project.keywords.length ? `${project.keywords.length} 个` : "选填"}</em>
          </div>
          <textarea className="mt-textarea" style={{ minHeight: 70 }} value={kwText}
            placeholder="粘贴关键词，或从 CSV 里复制一列（换行 / 逗号分隔）…"
            onChange={(e) => setKwText(e.target.value)} />
          <div className="fact-foot-actions">
            <button className="fill" onClick={applyKeywords} disabled={!kwText.trim()}>清洗并导入</button>
            {project.keywords.length > 0 && (
              <button onClick={() => onChange({ ...project, keywords: [] })}>清空</button>
            )}
          </div>
          {project.keywords.length > 0 && (
            <div className="mt-chips" style={{ marginTop: 10 }}>
              {project.keywords.slice(0, 24).map((k, i) => <span className="mt-chip" key={i}>{k}</span>)}
            </div>
          )}
          <p className="fact-note">
            只核对<b>你自己的词有没有写进文案</b>。我们不提供搜索量数据，也不判断哪个词值得投。
          </p>
        </div>

        <div className="wb-block">
          <div className="section-heading"><span><FileSearch size={15} /> 平台规则</span>
            <em>{describeRetrieval(project.snapshot.retrievedAt)}</em>
          </div>
          <label className="gen-field">
            <span>检索什么</span>
            <input className="gen-input" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="fact-foot-actions">
            <button className="fill" onClick={retrieve} disabled={loading}>
              {loading ? <><RefreshCw size={12} className="spin" /> 检索中…</> : <><Search size={12} /> AI 联网检索</>}
            </button>
          </div>
          {quotaOut && (
            <div className="conflict-item warn">
              <AlertTriangle size={14} />
              <span><b>免费额度已用完。</b>额度为所有免费用户共用，请稍后再试；或改为自己找到平台公告、把原文粘进上方的资料里。</span>
            </div>
          )}
          {error && !quotaOut && <div className="tool-error"><AlertTriangle size={15} /><span>{error}</span></div>}
          {stale && (
            <div className="conflict-item info">
              <Info size={14} />
              <span>快照已超过 30 天。平台规则会变，建议重新检索。</span>
            </div>
          )}
          <p className="fact-note">
            检索一次、存进项目，<b>不是每次诊断都重搜</b> —— 否则同一份 Listing 今天和明天会得到不同结论。
            我们<b>不维护政策库</b>，检索结果不构成平台裁定，需你逐条核对。
          </p>

          {project.snapshot.rules.length > 0 && (
            <div className="rule-list">
              {[...hard, ...advisory].map((r) => (
                <RuleRow key={r.id} rule={r} onToggle={() => toggleRule(r.id)} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><CheckCircle2 size={15} /> 诊断结果</span>
            <em>{summary.conclusive ? "可判定" : "结论不完整"}</em>
          </div>

          <div className={`diag-summary ${summary.conclusive ? "" : "is-partial"}`}>
            {summary.conclusive ? <CheckCircle2 size={14} /> : <HelpCircle size={14} />}
            <span>{summaryText(summary)}</span>
          </div>

          <div className="diag-counts">
            <div><small>违反规则</small><strong className={summary.violations ? "neg" : ""}>{summary.violations}</strong></div>
            <div><small>高风险</small><strong className={summary.risks ? "neg" : ""}>{summary.risks}</strong></div>
            <div><small>待补</small><strong>{summary.gaps}</strong></div>
            <div><small>无法判断</small><strong className={summary.unknowns ? "warn" : ""}>{summary.unknowns}</strong></div>
          </div>

          <div className="finding-list">
            {findings.map((f) => <FindingRow key={f.id} f={f} />)}
            {!findings.length && <div className="fact-empty">填入标题与五点后开始诊断。</div>}
          </div>

          <p className="fact-note">
            {verdictText(project.snapshot)}
          </p>
        </div>
      </section>
    </div>
  );
}
