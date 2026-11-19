import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { CopilotPanel } from "./copilot";

export const metadata: Metadata = {
  title: "客服回复工作台｜虾米跨境",
  description: "准备中英文售后回复模板，手动编辑并检查常见风险表达；资料在本地处理，不代替用户发送。",
  alternates: { canonical: siteUrl("/crossborder/workbench/service-copilot") },
};

export default function ServiceCopilotPage() {
  return (
    <WorkbenchPage slug="service-copilot">
      <CopilotPanel />
    </WorkbenchPage>
  );
}
