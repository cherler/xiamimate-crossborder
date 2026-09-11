/**
 * 报告导出(Markdown / Word)与「档次 · 目标」展示句 —— 真实报告页与示例报告页共用。
 *
 * 从 view.tsx 摘出独立成文:example-product-report.tsx 要复用这些函数,而 view.tsx
 * 又 import 了那个组件,直接互相引用会形成循环依赖(同 sample-ops.tsx 的处理)。
 */
import { MARKET_LABEL } from "../../../../lib/crossborder/asin";
import {
  EVIDENCE_KIND_LABEL, EVIDENCE_LEVEL_LABEL, GOAL_LABEL, LEGACY_INTENTS, TIER_LABEL, scopeGoal,
  type ResearchRun,
} from "../../../../lib/crossborder/research/types";
import { withAigcMark } from "../../aigc";

const NATURE_LABEL: Record<string, string> = {
  original: "原始", repost: "转载", sponsored: "商业合作", ugc: "用户生成",
};

/**
 * 档位 · 目标 组合展示句(#2026-07-21 目标/档位解耦)。老报告 intent 直接是
 * product_optimization/quality_diagnosis 的历史值 —— 那是「档位即目标」年代存量数据,
 * 原样显示,不强行套目标组合(scope.goal 那时也不存在)。
 */
export function goalLine(scope: { intent?: string; goal?: string } | null | undefined): string {
  const it = scope?.intent;
  if (!it) return "";
  // 老报告(档位即目标年代)没有独立 goal,原样显示历史档位名,不强行套组合。
  if (LEGACY_INTENTS.has(it)) return TIER_LABEL[it] ?? it;
  return `${TIER_LABEL[it] ?? it} · ${GOAL_LABEL[scopeGoal(scope)]}`;
}


/** 导出 Markdown:全部取自 report_json,和页面同一数据源。 */
export function toMarkdown(run: ResearchRun): string {
  const rep = run.report!;
  const s = run.scope;
  const L: string[] = [];
  L.push(`# 商品口碑与需求洞察报告:${s.productName}`);
  L.push("");
  L.push(`- 研究对象:${s.productName}${s.mode === "direction" ? "(商品方向)" : ""}`);
  L.push(`- 市场:${MARKET_LABEL[s.marketplace] ?? s.marketplace} · 研究目标:${goalLine(s)}`);
  L.push(`- 有效来源:${rep.sources.length} · 生成时间:${rep.generatedAt}`);
  if (s.assumed?.length) L.push(`- 系统假设:部分研究范围为系统默认值,结论不应外推。`);
  L.push("");
  L.push("## 一页结论");
  for (const v of rep.verdicts) L.push(`- **${v.tag}**:${v.text}(${v.evidenceNote})`);
  L.push("");
  rep.sections.forEach((sec, i) => {
    L.push(`## ${i + 1} ${sec.title}`);
    if (sec.insufficient) L.push(`> 证据不足:${sec.insufficient}`);
    if (sec.module === "sources_appendix") {
      L.push("| 类型 | 来源 | 性质 | 发布 | 可靠度 | 关键信息 |");
      L.push("| --- | --- | --- | --- | --- | --- |");
      for (const e of rep.sources) {
        const name = e.url ? `[${e.title}](${e.url})` : e.title;
        L.push(`| ${EVIDENCE_KIND_LABEL[e.kind]} | ${name} | ${NATURE_LABEL[e.nature] ?? e.nature} | ${e.publishedAt || "—"} | ${EVIDENCE_LEVEL_LABEL[e.reliability]} | ${e.snippet.replace(/\|/g, "/")} |`);
      }
    } else {
      L.push(sec.body);
    }
    for (const c of sec.conclusions) {
      // 零证据的条目不印「等级」——等级是证据分级,没证据就没有等级(与页面同口径)。
      const grade = c.supportIds.length ? `(等级 ${EVIDENCE_LEVEL_LABEL[c.level]})` : "(无证据支撑 · 供参考)";
      const src = c.supportIds.length ? ` —— 支持 ${c.supportIds.join(", ")}` : "";
      L.push(`> **结论**${grade}:${c.text}${src}${c.againstIds.length ? `;反向 ${c.againstIds.join(", ")}` : ""}`);
    }
    L.push("");
  });
  if (rep.coverage?.limits?.length) {
    L.push("## 局限说明");
    for (const l of rep.coverage.limits) L.push(`- ${l}`);
  }
  return withAigcMark(L.join("\n"));
}

/** Word 导出(P2):Word 兼容的 HTML .doc(零依赖,Word/WPS 直接打开可编辑)。
 *  内容与 Markdown 导出同源(标题/判词/章节/结论/局限),不引第三方 docx 库。 */
export function downloadWord(run: ResearchRun) {
  const rep = run.report!;
  const s = run.scope;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const H: string[] = [];
  H.push(`<h1>商品口碑与需求洞察报告:${esc(s.productName || "")}</h1>`);
  H.push(`<p style="color:#666">${esc(s.marketplace || "")} · 生成于 ${esc((rep.generatedAt || "").slice(0, 10))} · AI 生成,请核对</p>`);
  if (rep.verdicts?.length) {
    H.push("<h2>核心判断</h2><ul>");
    for (const v of rep.verdicts) H.push(`<li><b>${esc(v.tag)}</b>:${esc(v.text)}${v.evidenceNote ? `(${esc(v.evidenceNote)})` : ""}</li>`);
    H.push("</ul>");
  }
  for (const sec of rep.sections || []) {
    H.push(`<h2>${esc(sec.title)}</h2>`);
    if (sec.insufficient) H.push(`<p style="color:#a66"><b>证据不足</b>:${esc(sec.insufficient)}</p>`);
    for (const para of String(sec.body || "").split(/\n+/).filter(Boolean)) H.push(`<p>${esc(para)}</p>`);
    if (sec.conclusions?.length) {
      H.push("<ul>");
      for (const c of sec.conclusions) {
        // Word 版此前只印「可信度」不印证据 id —— 导给同事的那一份证据链归零,
        // 零证据的条目还挂着「可信度:高」。补上来源 id,并对零证据如实标注。
        const lvl = c.level === "high" ? "高" : c.level === "mid" ? "中" : "低";
        const tail = c.supportIds.length
          ? `(可信度:${lvl};支持 ${esc(c.supportIds.join(", "))}${c.againstIds.length ? `;反向 ${esc(c.againstIds.join(", "))}` : ""})`
          : "(无证据支撑 · 供参考)";
        H.push(`<li>${esc(c.text)}${tail}</li>`);
      }
      H.push("</ul>");
    }
  }
  const limits = rep.coverage?.limits || [];
  if (limits.length) {
    H.push("<h2>研究局限</h2><ul>");
    for (const l of limits) H.push(`<li>${esc(l)}</li>`);
    H.push("</ul>");
  }
  H.push(`<p style="color:#999;font-size:12px">来源共 ${rep.sources?.length || 0} 条(明细见站内报告的证据附录)· 虾米伙伴 · AI 生成内容,请结合官方来源核对。</p>`);
  const doc = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">` +
    `<style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.7}h1{font-size:20pt}h2{font-size:14pt;border-bottom:1px solid #ccc;padding-bottom:4px}</style>` +
    `</head><body>${H.join("")}</body></html>`;
  const blob = new Blob(["﻿", doc], { type: "application/msword;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `口碑与需求洞察-${s.productName}.doc`.replace(/[/\\:*?"<>|]/g, "-");
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadMarkdown(run: ResearchRun) {
  const blob = new Blob([toMarkdown(run)], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `口碑与需求洞察-${run.scope.productName}.md`.replace(/[/\\:*?"<>|]/g, "-");
  a.click();
  URL.revokeObjectURL(a.href);
}
