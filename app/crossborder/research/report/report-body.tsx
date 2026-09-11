"use client";

/**
 * 研究报告正文(#P1-3 抽取)。从 view.tsx 抽出「元信息头 → 结论卡/决策摘要 →
 * 研究过程 → 左目录右正文(图表 + 证据 + 来源附录)」这段,给报告页与公开分享页共用,
 * 保证分享出去的和自己看的是同一套版式(图表 + 目录都在)。只吃 rep + scope。
 */

import { useState } from "react";
import { AlertTriangle, ChevronDown, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { MARKET_LABEL } from "../../../../lib/crossborder/asin";
import { AigcBadge } from "../../aigc";
import { Markdown } from "./markdown";
import { CHART_LABEL, checkChartSlots, normalizeFindings } from "../../../../lib/crossborder/research/chart-slots";
import { moduleById } from "../../../../lib/crossborder/research/modules";
import {
  EVIDENCE_KIND_LABEL, EVIDENCE_LEVEL_LABEL, GOAL_LABEL, TIER_LABEL, scopeGoal,
  type EvidenceItem, type ResearchReport, type ResearchScope,
} from "../../../../lib/crossborder/research/types";
import {
  ClaimGap, CoverageBars, DiffMatrix, DivergingThemes, EvidenceDots, MotivationBars,
  PositionMap, PriorityMatrix, PriorityTable,
} from "./charts";

/** 档位映射统一到 types.ts 的 TIER_LABEL(单一真源);此别名保留给既有引用。 */
export const REPORT_INTENT = TIER_LABEL;

const NATURE_LABEL: Record<string, string> = {
  original: "原始", repost: "转载", sponsored: "商业合作", ugc: "用户生成",
};

export function fmtTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function coverageWord(n: number): string {
  return n >= 25 ? "较好" : n >= 10 ? "中等" : "有限";
}

/**
 * 资料采集时间窗。
 *
 * 这一格原先显示 generatedAt(报告生成时刻),标签却写「研究截止」。对原创报告两者
 * 相差无几;但**派生报告**(换目标 / 升档 / 补资料)复用的是上一版的证据 —— 大半资料
 * 是几周前采的,页面却一律显示成今天,读者会以为整份报告的数据都是当天的。
 * 这里按证据自己的 fetchedAt 算真实区间:跨天就如实显示区间,让"有多旧"看得见。
 */
export function collectedWindow(rep: { sources?: EvidenceItem[]; generatedAt: string }): string {
  const days = (rep.sources || [])
    .map((e) => (e.fetchedAt ? fmtTime(e.fetchedAt).slice(0, 10) : ""))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!days.length) return fmtTime(rep.generatedAt).slice(0, 10);
  const first = days[0], last = days[days.length - 1];
  return first === last ? last : `${first} ~ ${last}`;
}

/** 结论的证据展开:来源数做成可点徽章,点开即真实链接列表。 */
function ConclusionRow({ text, level, support, against }: {
  text: string; level: string; support: EvidenceItem[]; against: EvidenceItem[];
}) {
  return (
    <details className="rr-evidence">
      <summary>
        {text}
        <span className="rr-ev-chips">
          {/* 零证据的条目不摆「0 来源 · 等级 高」——「等级」是证据分级,没有证据就没有等级可言。
              这类条目多是范围陈述(如「研究对象为 X 品类、目标市场 Y」),本就不靠证据成立;
              但也可能是模型引用了不存在的 id 被白名单清空后剩下的空壳。一律如实标注,
              让读者自己判断,而不是给它一个看起来有依据的可信度。 */}
          {support.length > 0
            ? <i className="rr-ev-chip">{support.length} 来源</i>
            : <i className="rr-ev-chip is-noev">无证据支撑 · 供参考</i>}
          {against.length > 0 && <i className="rr-ev-chip is-against">反向 {against.length}</i>}
          {support.length > 0 && (
            <i className="rr-ev-chip is-level">等级 {EVIDENCE_LEVEL_LABEL[level as "high"] ?? level}</i>
          )}
        </span>
      </summary>
      {[{ label: "支持", items: support }, { label: "反向", items: against }].map(({ label, items }) =>
        items.length > 0 && (
          <ul key={label} className="rr-ev-list">
            {items.map((e, i) => (
              <li key={`${e.id}-${i}`}>
                <i>{label}</i>
                {e.url
                  ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title} <ExternalLink size={11} /></a>
                  : <span>{e.title}</span>}
                <small>{EVIDENCE_KIND_LABEL[e.kind]} · {NATURE_LABEL[e.nature] ?? e.nature} · 可靠度 {EVIDENCE_LEVEL_LABEL[e.reliability]}</small>
              </li>
            ))}
          </ul>
        ))}
    </details>
  );
}

function SourcesRows({ sources }: { sources: EvidenceItem[] }) {
  return (
    <>
      {sources.map((e, i) => (
        <tr key={`${e.id}-${i}`}>
          <td>{EVIDENCE_KIND_LABEL[e.kind]}</td>
          <td>{e.url
            ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title} <ExternalLink size={11} /></a>
            : e.title}</td>
          <td>{NATURE_LABEL[e.nature] ?? e.nature}</td>
          <td>{e.publishedAt || "—"}</td>
          <td>{EVIDENCE_LEVEL_LABEL[e.reliability]}</td>
          <td>{e.snippet}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * 来源附录:表格由后端拼装的证据清单渲染。平台评价(kind=platform,如 TikTok Shop
 * 第三方接口数据)单独分组展示 —— 和样例页(sample/tiktok.tsx)承诺的一致:一眼可辨
 * 哪些结论靠平台数据、哪些靠公开网络,不混在一张表里稀释这条差异。
 */
function SourcesTable({ sources }: { sources: EvidenceItem[] }) {
  const platform = sources.filter((e) => e.kind === "platform");
  // P2:用户自有数据(评论/退货 CSV、补充资料)单独一组 —— 读者一眼分清
  // 哪些结论来自卖家一手数据、哪些来自公开网络。
  const userUp = sources.filter((e) => e.kind === "user_upload");
  const rest = sources.filter((e) => e.kind !== "platform" && e.kind !== "user_upload");
  const userBlock = userUp.length > 0 && (
    <>
      <h3 style={{ marginTop: rest.length ? 18 : 0 }}>用户上传资料(卖家自有数据)</h3>
      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>类型</th><th>来源</th><th>性质</th><th>发布</th><th>可靠度</th><th>关键信息</th></tr></thead>
          <tbody><SourcesRows sources={userUp} /></tbody>
        </table>
      </div>
      <p className="rc-note" style={{ marginTop: 8 }}>
        以上为发起研究时上传的评论/退货 CSV 与补充资料,是卖家一手数据;统计数字由系统按上传内容计算,原文条目为逐字引用。
      </p>
    </>
  );
  if (!platform.length) {
    return (
      <>
        {rest.length > 0 && (
          <div className="rr-table-wrap">
            <table className="rr-table">
              <thead><tr><th>类型</th><th>来源</th><th>性质</th><th>发布</th><th>可靠度</th><th>关键信息</th></tr></thead>
              <tbody><SourcesRows sources={rest} /></tbody>
            </table>
          </div>
        )}
        {userBlock}
      </>
    );
  }
  return (
    <>
      {rest.length > 0 && (
        <>
          <h3>公开网络来源</h3>
          <div className="rr-table-wrap">
            <table className="rr-table">
              <thead><tr><th>类型</th><th>来源</th><th>性质</th><th>发布</th><th>可靠度</th><th>关键信息</th></tr></thead>
              <tbody><SourcesRows sources={rest} /></tbody>
            </table>
          </div>
        </>
      )}
      <h3 style={{ marginTop: rest.length ? 18 : 0 }}>
        平台评价(第三方接口)<span className="tk-src-badge"><ShieldCheck size={12} /> 已去个人身份</span>
      </h3>
      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>类型</th><th>来源</th><th>性质</th><th>发布</th><th>可靠度</th><th>关键信息</th></tr></thead>
          <tbody><SourcesRows sources={platform} /></tbody>
        </table>
      </div>
      <p className="rc-note" style={{ marginTop: 8 }}>
        平台评价经第三方接口采样获取,已去除评价者姓名/ID/头像、剔除被激励评论;非官方、非全量,可能有缺漏与时延。
      </p>
      {userBlock}
    </>
  );
}

/**
 * 去掉正文开头重复的章节标题。
 *
 * 渲染器已经画了章节标题,但模型常在 body 里再写一遍(「## 一页决策摘要」),
 * 于是页面上同一个标题出现两次。这里在渲染前剥掉 —— 对**存量报告**也立刻生效,
 * 不必重跑。只剥开头、且必须与章节标题同名,不误伤正文里的小标题。
 */
export function stripDuplicateHeading(body: string, title: string): string {
  const want = title.replace(/\s+/g, "");
  const lines = String(body || "").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length) {
    const head = lines[i].replace(/^#{1,4}\s*/, "").replace(/\*\*/g, "").trim().replace(/\s+/g, "");
    const isHeading = /^#{1,4}\s/.test(lines[i]) || /^\*\*.+\*\*$/.test(lines[i].trim());
    if (isHeading && (head === want || head === want.replace(/[·。:]/g, ""))) {
      lines.splice(0, i + 1);
      return lines.join("\n").replace(/^\n+/, "");
    }
  }
  return body;
}

export function ReportBody({ rep, scope, onRerunSection }: {
  rep: ResearchReport; scope: ResearchScope;
  /** 单章重跑(P2):报告所有者视图传入;分享页不传即无按钮。 */
  onRerunSection?: (module: string, title: string) => void;
}) {
  const [showPlan, setShowPlan] = useState(false);
  const evMap = new Map((rep.sources || []).map((e) => [e.id, e]));
  // 去重:模型偶尔会在同一条结论的 supportIds/againstIds 里重复引用同一证据(如 h31),
  // 不去重会同一条证据渲染两次、并触发 React 重复 key 报错。
  const pick = (ids: string[]) => [...new Set(ids)].map((i) => evMap.get(i)).filter((e): e is EvidenceItem => !!e);
  // 存量报告的 findings 里可能有缺 ids 的条目(模型漏字段,且已落库不再改写)——
  // 图表直接读 .ids.length,不补齐会整页白屏。补成空数组即「无出处」,不会被当成有证据。
  const findings = normalizeFindings(rep.findings);
  const chartsAvail = rep.chartsAvailable ?? checkChartSlots({
    coverageCounts: rep.coverage?.counts, themes: rep.themes,
    findings, category: scope?.category, intent: scope?.intent,
  });
  const chartOk = (id: string) => chartsAvail.some((c) => c.chart === id && c.ready);
  const isFull = scope?.intent === "full";
  const decisionSec = isFull ? rep.sections.find((s) => s.module === "decision_summary") : null;
  const bodySections = (rep.sections || []).filter((s) => !(isFull && s.module === "decision_summary"));

  const cards = rep.verdicts.map((v) => {
    /**
     * 判词的证据点数。
     *
     * 优先用 supportIds(compose 已按证据 id 白名单校验过);老报告没有这个字段时,
     * 退回从 evidenceNote 里抠数字 —— 但**必须封顶到报告真实来源数**:那句话是模型
     * 自由文本,写「基于 30+ 来源」就会画 30 个点,哪怕全报告只有 8 条证据。
     * 图表铁律是「长度只编码样本内真实计数」,画出比证据还多的点等于伪造。
     */
    const ids = (v as { supportIds?: string[] }).supportIds;
    const claimed = Number((v.evidenceNote.match(/\d+/) || [])[0] || 0);
    const n = ids?.length ? pick(ids).length : Math.min(claimed, rep.sources.length);
    return (
      <div key={v.tag} className={`rr-verdict${v.tag.includes("问题") ? " is-neg" : ""}`}>
        <em>{v.tag}</em>
        <p>{v.text}</p>
        <span>{n > 0 && <EvidenceDots count={n} neg={v.tag.includes("问题")} />}{v.evidenceNote}</span>
      </div>
    );
  });

  return (
    <>
      {/* AI 生成标识放在**共用正文组件**里:报告页、公开分享页、示例页都渲染这个组件,
          加在各页外层会漏(分享页此前就没有标识,而它恰恰是传播给第三方的那一份)。 */}
      <div className="rr-aigc-line"><AigcBadge /><span>本报告由 AI 依据公开资料生成,可能有误,请核对后使用</span></div>

      <div className="rr-meta">
        <div><span>研究对象</span><b>{scope.productName}{scope.mode === "direction" ? "(商品方向)" : ""}</b></div>
        <div><span>市场</span><b>{MARKET_LABEL[scope.marketplace] ?? scope.marketplace}</b></div>
        <div><span>研究档次</span><b>{TIER_LABEL[scope.intent] ?? scope.intent}</b></div>
        <div><span>研究目标</span><b>{GOAL_LABEL[scopeGoal(scope)]}</b></div>
        <div><span>有效来源</span><b>{rep.sources.length}</b></div>
        <div><span>资料采集</span><b>{collectedWindow(rep)}</b></div>
        <div><span>证据覆盖</span><b>{coverageWord(rep.sources.length)}</b></div>
      </div>

      {scope.assumed?.length > 0 && (
        <div className="rr-assume" style={{ margin: "12px 0" }}>
          <AlertTriangle size={14} />
          <span><b>系统假设</b>:本次研究的部分范围取系统默认值(未经显式确认),结论不应外推到其他市场或目标。</span>
        </div>
      )}

      {isFull ? (
        <div className="rr-decision">
          <div className="rr-decision-head"><b>一页决策摘要</b></div>
          <div className="rr-verdicts" style={{ marginTop: 0 }}>{cards}</div>
          {decisionSec?.body && (
            <div className="rr-decision-body">
              <Markdown text={stripDuplicateHeading(decisionSec.body, decisionSec.title || "一页决策摘要")} />
            </div>
          )}
        </div>
      ) : (
        <div className="rr-verdicts">{cards}</div>
      )}

      <button className="rr-plan-toggle" onClick={() => setShowPlan((x) => !x)}>
        <ChevronDown size={14} className={showPlan ? "open" : ""} /> 查看研究过程(章节如何取舍)
      </button>
      {showPlan && (
        <div className="rr-plan">
          {rep.plan.decisions.map((d) => (
            <div key={d.module} className={`rr-plan-row is-${d.action}`}>
              <i>{{ keep: "保留", merge: "合并", demote: "降级", drop: "删除" }[d.action]}</i>
              {/* 被删除/合并掉的章节在 sections 里查不到,原来就直接把 module id 裸露出来
                  (用户看到的是 optimize_priorities 这种英文标识符)。回退到模块表取中文名。 */}
              <b>{rep.sections.find((s) => s.module === d.module)?.title
                  || moduleById(d.module)?.title || d.module}</b>
              <span>{d.reason}</span>
            </div>
          ))}
          {/* 图表计划 vs 实际出图:plan 阶段按品类裁决了哪些图「在范围内」,compose 再按
              实际数据判就绪。两者一对照,「这张图为什么没出现」才有交代 ——
              chartPlan 此前只落库、从不展示,等于把这个交代吞掉了。 */}
          {(rep.plan.chartPlan?.length ?? 0) > 0 && (
            <div className="rr-plan-charts">
              <b>图表计划</b>
              <ul>
                {rep.plan.chartPlan!.map((c) => {
                  const av = chartsAvail.find((x) => x.chart === c.chart);
                  return (
                    <li key={`${c.chart}-${c.module}`}>
                      <span>{CHART_LABEL[c.chart] ?? c.chart}</span>
                      {av?.ready ? <i className="ok">已出图</i>
                        : <i>未出图 · {av?.reason || "本次未纳入"}</i>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rr-body">
        <nav className="rr-toc" aria-label="报告目录">
          {bodySections.map((s, i) => <a key={s.module} href={`#${s.module}`}>{i + 1} {s.title}</a>)}
        </nav>
        <article className="rr-article">
          {bodySections.map((s, i) => (
            <section key={s.module} id={s.module}>
              {/*
                标题与「重跑本章」是两件事,必须视觉上分开。
                原来按钮直接跟在标题文字后面且**没有任何样式**(.rr-rerun-sec
                在 CSS 里一次都没出现),浏览器默认按钮紧贴文字,读起来就成了
                「1 商品与范围确认重跑本章」—— 用户以为是标题的一部分。
              */}
              <h2 className="rr-h2">
                <span>{i + 1} {s.title}</span>
                {onRerunSection && (
                  <button type="button" className="rr-rerun-sec" title="只重写这一章(复用全部证据,出同谱系新版本)"
                    onClick={() => onRerunSection(s.module, s.title)}>
                    <RefreshCw size={12} /> 重跑本章
                  </button>
                )}
              </h2>
              {s.insufficient && (
                <div className="rr-assume"><AlertTriangle size={14} /><span><b>证据不足</b>:{s.insufficient}</span></div>
              )}
              {s.module === "data_coverage" && chartOk("coverage_bars") && <CoverageBars counts={rep.coverage?.counts} />}
              {s.module === "demand_scenarios" && chartOk("motivation_bars") && <MotivationBars demand={findings?.demand} />}
              {s.module === "voice_themes" && (
                <>
                  {chartOk("diverging_themes") && <DivergingThemes themes={rep.themes} />}
                  {chartOk("priority_matrix")
                    ? <PriorityMatrix negatives={findings?.voice?.negatives} />
                    : <PriorityTable negatives={findings?.voice?.negatives} />}
                  {chartOk("claim_gap") && <ClaimGap gaps={findings?.claimGaps} />}
                </>
              )}
              {s.module === "rival_opportunities" && chartOk("position_map") && (
                <PositionMap rivalMap={findings?.rivalMap} />
              )}
              {s.module === "rival_diff" && chartOk("diff_matrix") && <DiffMatrix diff={findings?.diffMatrix} />}
              {s.module === "sources_appendix" ? (
                <>
                  {/* 附录章的正文(来源构成、可靠度分布怎么看)此前被整段丢弃 —— 只留一个
                      折叠的来源表。这段是模型对样本构成的说明,恰恰是判断可信度要读的。 */}
                  {s.body?.trim() && <Markdown text={stripDuplicateHeading(s.body, s.title)} />}
                  <details className="rr-sources-fold">
                    <summary>展开全部 {rep.sources.length} 条来源</summary>
                    <SourcesTable sources={rep.sources} />
                  </details>
                </>
              ) : (
                <Markdown text={stripDuplicateHeading(s.body, s.title)} />
              )}
              {s.conclusions.length > 0 && (
                // 来源附录里的结论只作纯文字可靠性说明,不再做成与来源表并列的可折叠证据块(避免"两个并列引用"的观感)。
                s.module === "sources_appendix"
                  ? s.conclusions.map((c, j) => <p key={j} className="rr-appendix-note">{c.text}</p>)
                  : s.conclusions.map((c, j) => (
                      <ConclusionRow key={j} text={c.text} level={c.level}
                        support={pick(c.supportIds)} against={pick(c.againstIds)} />
                    ))
              )}
              {s.module === "data_coverage" && rep.coverage?.limits?.length > 0 && (
                <div className="rr-limits">
                  <b>本报告做不到的事:</b>
                  <ul>{rep.coverage.limits.map((l, j) => <li key={j}>{l}</li>)}</ul>
                </div>
              )}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
