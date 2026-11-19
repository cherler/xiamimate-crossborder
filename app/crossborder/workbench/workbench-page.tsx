"use client";
import type { ReactNode } from "react";
import { SiteHeader, SiteFooter, BackTo } from "../../site-chrome";
const TITLES: Record<string, [string, string]> = {
  "listing-doctor": [
    "Listing 检查与事实库",
    "记录可核对的商品事实，编辑标题五点，再检查关键词与事实缺口。",
  ],
  "voice-insight": [
    "评论与竞品样本分析",
    "用自己提供的 CSV 和可编辑关键词统计主题，原文、数量与占比一起看。",
  ],
  "service-copilot": [
    "客服回复工作台",
    "选择售后场景，准备中英文模板，编辑后检查常见风险表述。",
  ],
};
export function WorkbenchPage({
  slug,
  children,
}: {
  slug: string;
  children?: ReactNode;
}) {
  const entry = TITLES[slug];
  if (!entry) return null;
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="tool-page">
        <BackTo />
        <div className="tool-page-head">
          <div>
            <span>CROSSBORDER / WORKBENCH</span>
            <h1>{entry[0]}</h1>
          </div>
        </div>
        <p className="local-note">{entry[1]}</p>
        {children}
      </section>
      <SiteFooter />
    </main>
  );
}
