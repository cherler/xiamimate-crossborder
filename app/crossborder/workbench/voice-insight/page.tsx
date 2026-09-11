import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { InsightPanel } from "./insight";

export const metadata: Metadata = {
  title: "用户声音与竞品洞察｜跨境经营工具 · 虾米伙伴",
  description: "从你的批量评论与竞品评论里找出有证据、可量化的问题主题，并映射到产品、图片与文案的具体修改。频次与占比由系统按实际样本计算。",
  alternates: { canonical: "/crossborder/workbench/voice-insight" },
};

export default function VoiceInsightPage() {
  return (
    <WorkbenchPage slug="voice-insight">
      <InsightPanel />
    </WorkbenchPage>
  );
}
