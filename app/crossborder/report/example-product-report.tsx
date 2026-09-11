import { FileText, Package } from "lucide-react";
import {
  EXAMPLE_VOICE_COMPETITOR_THEMES,
  EXAMPLE_VOICE_REPORT,
  EXAMPLE_VOICE_SOURCE_COMPETITOR,
  EXAMPLE_VOICE_SOURCE_REVIEWS,
  EXAMPLE_VOICE_THEMES,
} from "../../../lib/crossborder/example-reports";
import { ExampleReportBadge, ExampleReportBanner } from "../example-report-ui";
import { ReportThemeTable } from "./theme-table";

const SEV_LABEL = { high: "高", mid: "中", low: "低" };

export function ExampleProductVoiceReport() {
  const run = EXAMPLE_VOICE_REPORT;
  const rep = run.report;
  return (
    <>
      <div className="deepr-head is-example-report">
        <div>
          <h1><FileText size={20} strokeWidth={1.8} /> {run.productName}</h1>
          <p>
            演示数据 · {run.stats.total} 条本品评论 + {run.competitorCount} 条竞品评论 ·
            {" "}<b>未消耗积分</b>
          </p>
        </div>
        <ExampleReportBadge />
      </div>

      <ExampleReportBanner />

      <details className="wb-block example-report-trace">
        <summary>
          <span><Package size={14} /> 溯源 · 演示输入</span>
          <em>{EXAMPLE_VOICE_SOURCE_REVIEWS.length} 条节选 + {EXAMPLE_VOICE_SOURCE_COMPETITOR.length} 条竞品节选</em>
        </summary>
        <div className="example-report-trace-body">
          <div>
            <b>本品评论节选</b>
            {EXAMPLE_VOICE_SOURCE_REVIEWS.map((r) => (
              <p key={r.id}><span>{r.rating}★</span><q>{r.text}</q></p>
            ))}
          </div>
          <div>
            <b>竞品评论节选</b>
            {EXAMPLE_VOICE_SOURCE_COMPETITOR.map((r) => (
              <p key={r.id}><span>{r.rating}★</span><q>{r.text}</q></p>
            ))}
          </div>
        </div>
      </details>

      <div className="wb-block deepr-summary">
        <div className="section-heading">
          <span>执行摘要</span>
          <em>{run.stats.total} 条 · 均分 {run.stats.avgRating}</em>
        </div>
        <p>{rep.summary}</p>
      </div>

      {!!rep.topIssues?.length && (
        <div className="wb-block">
          <div className="section-heading"><span>问题清单</span><em>按严重度排序 · 每条带演示原文</em></div>
          <div className="deepr-issues">
            {rep.topIssues.map((it) => (
              <div key={it.theme} className={`deepr-issue sev-${it.severity}`}>
                <div className="deepr-issue-head">
                  {/* 示例报告的每条都带原文,所以一定有严重度;仍按同一口径写,
                      免得将来示例数据改了又要在这里补一次防御。 */}
                  {it.severity && (
                    <span className={`deepr-sev sev-${it.severity}`}>严重度 {SEV_LABEL[it.severity]}</span>
                  )}
                  <strong>{it.theme}</strong>
                  <em>{Math.round((it.share ?? 0) * 100)}% 演示样本提及</em>
                </div>
                {it.evidence.map((quote) => <q key={quote}>{quote}</q>)}
                <div className="deepr-issue-foot">
                  {it.affected.map((part) => <span key={part} className="deepr-chip">{part}</span>)}
                  <p>{it.action}</p>
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
            {rep.positives.map((positive) => (
              <div key={positive.theme} className="deepr-pos">
                <strong>{positive.theme}</strong>
                <em>{Math.round((positive.share ?? 0) * 100)}%</em>
                <p>{positive.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <ReportThemeTable title="全部主题（本品）" themes={EXAMPLE_VOICE_THEMES} note="数字按演示样本计算" />
      <ReportThemeTable title="竞品主题" themes={EXAMPLE_VOICE_COMPETITOR_THEMES} note="数字按演示样本计算" />

      {!!rep.competitorNotes?.length && (
        <div className="wb-block">
          <div className="section-heading"><span>与竞品的可行动差异</span><em>{rep.competitorNotes.length} 条</em></div>
          <ul className="deepr-notes">{rep.competitorNotes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>
      )}

      {!!rep.cautions?.length && (
        <div className="wb-block deepr-cautions">
          <div className="section-heading"><span>口径与样本注意</span><em>示例结论的边界</em></div>
          <ul className="deepr-notes">{rep.cautions.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>
      )}

      <div className="example-report-next">
        <div>
          <b>换成自己的评论，就能生成真实用户声音报告</b>
          <span>真实报告会保存到账号、计入商品档案，并按实际用量消耗积分。</span>
        </div>
        <a href="/crossborder/workbench/voice-insight/">分析自己的评论</a>
      </div>
    </>
  );
}
