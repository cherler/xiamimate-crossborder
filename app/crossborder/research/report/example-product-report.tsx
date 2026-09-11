"use client";

/**
 * 示例商品名下的研究报告 —— 数据是**真实报告快照**,不是阉割的假报告。
 *
 * 因此这里按真实报告页同款渲染:五段阶段轨 + 操作行 + 完整正文。
 * 操作行口径是「能真用的就真给,不能用的诚实置灰」:
 *   · 导出        —— 真能用(纯客户端,与真实报告同一份数据),且不消耗积分
 *   · 归入商品档案 —— 它本来就挂在示例商品名下,如实静态显示
 *   · 研究我的商品 —— 引导做一次真实研究(示例没有服务端 run,伪造 lineage 是骗人)
 *   · 版本对比/设为参考/分享 —— 需要真实 run,置灰并说明原因
 */

import { useState } from "react";
import {
  ChevronDown, Download, GitCompareArrows, Package, Pin, RefreshCw, Share2, Telescope,
} from "lucide-react";
import {
  EXAMPLE_RESEARCH_CHARGED, EXAMPLE_RESEARCH_REPORT, EXAMPLE_RESEARCH_SCOPE, EXAMPLE_RESEARCH_STAGES,
} from "../../../../lib/crossborder/example-reports";
import { EXAMPLE_PRODUCT_NAME } from "../../../../lib/crossborder/example-product";
import { MARKET_LABEL } from "../../../../lib/crossborder/asin";
import { RESEARCH_STAGE_LABEL, type ResearchRun } from "../../../../lib/crossborder/research/types";
import { ExampleReportBadge, ExampleReportBanner } from "../../example-report-ui";
import { downloadMarkdown, downloadWord } from "./report-export";
import { ReportBody } from "./report-body";

/** 仅供导出用的 run —— 导出函数只读 scope/report,不碰服务端。 */
const EXPORT_RUN = {
  runId: "example",
  status: "done",
  scope: EXAMPLE_RESEARCH_SCOPE,
  report: EXAMPLE_RESEARCH_REPORT,
} as unknown as ResearchRun;

/** 阶段轨:沿用真实报告页 deepr-rail 版式,费用一律显示「示例 · 未扣分」。 */
function ExampleStageRail() {
  return (
    <div className="deepr-rail">
      {EXAMPLE_RESEARCH_STAGES.map((s) => (
        <div key={s.name} className="deepr-stage is-done">
          <span>{RESEARCH_STAGE_LABEL[s.name as keyof typeof RESEARCH_STAGE_LABEL] ?? s.name}</span>
          <em>示例 · 未扣分</em>
        </div>
      ))}
    </div>
  );
}

function ExampleActions() {
  const [open, setOpen] = useState(false);
  const needReal = "示例报告没有服务端任务 —— 生成一次真实研究后可用";
  return (
    <div className="rr-actions-bar">
      <a className="my-act" href="/crossborder/research/product-insight/">
        <RefreshCw size={13} /> 研究我自己的商品
      </a>
      <button disabled title="这份示例报告本来就挂在示例商品档案名下">
        <Package size={13} /> 已归入 {EXAMPLE_PRODUCT_NAME}
      </button>
      <button disabled title={needReal}><GitCompareArrows size={13} /> 版本对比</button>
      <button disabled title={needReal}><Pin size={13} /> 设为参考</button>
      <button disabled title={needReal}><Share2 size={13} /> 分享</button>
      <div className="rr-menu-wrap">
        <button className={open ? "is-open" : ""} aria-haspopup="menu" aria-expanded={open}
          title="导出真的可用 —— 与真实报告同一份数据,且不消耗积分"
          onClick={() => setOpen((v) => !v)}>
          <Download size={13} /> 导出 <ChevronDown size={12} />
        </button>
        {open && (
          <div className="rr-menu" role="menu" onClick={() => setOpen(false)}>
            <button onClick={() => downloadMarkdown(EXPORT_RUN)}>导出 Markdown</button>
            <button onClick={() => downloadWord(EXPORT_RUN)}>导出 Word(.doc)</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ExampleProductResearchReport() {
  const sources = EXAMPLE_RESEARCH_REPORT.sources?.length ?? 0;
  return (
    <>
      <div className="deepr-head is-example-report">
        <div>
          <h1>
            <Telescope size={20} strokeWidth={1.8} />
            {" "}{EXAMPLE_RESEARCH_SCOPE.productName}
            {" @ "}{MARKET_LABEL[EXAMPLE_RESEARCH_SCOPE.marketplace] ?? EXAMPLE_RESEARCH_SCOPE.marketplace}
          </h1>
          <p>
            真实报告快照 · {sources} 条可核对来源 · 五段研究流程完整保留 ·{" "}
            <b>未消耗你的积分</b>(原始生成消耗 {EXAMPLE_RESEARCH_CHARGED} 积分)
          </p>
        </div>
        <div className="deepr-head-tags">
          <ExampleReportBadge />
        </div>
      </div>

      <ExampleReportBanner />
      <ExampleStageRail />
      <ExampleActions />
      <ReportBody rep={EXAMPLE_RESEARCH_REPORT} scope={EXAMPLE_RESEARCH_SCOPE} />

      <div className="example-report-next">
        <div>
          <b>看懂示例后，可以研究自己的商品</b>
          <span>真实报告会联网检索、展示可核对来源，并按实际用量消耗积分。</span>
        </div>
        <a href="/crossborder/research/product-insight/">开始一次真实研究</a>
      </div>
    </>
  );
}
