import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { InsightPanel } from "./insight";

export const metadata: Metadata = {
  title: "评论与竞品样本分析｜虾米跨境",
  description: "导入自己持有的评论 CSV，按可编辑关键词统计主题、评分与占比，并查看代表性原文和竞品样本对比。",
  alternates: { canonical: siteUrl("/crossborder/workbench/voice-insight") },
};

export default function VoiceInsightPage() {
  return (
    <WorkbenchPage slug="voice-insight">
      <InsightPanel />
    </WorkbenchPage>
  );
}
