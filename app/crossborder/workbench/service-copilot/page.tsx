import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { CopilotPanel } from "./copilot";

export const metadata: Metadata = {
  title: "客服回复 Copilot｜跨境经营工具 · 虾米伙伴",
  description: "在你提供的订单与商品上下文里生成回复，提示可能触碰平台消息规则之处，脱敏在调模型之前，违规检查不由模型自己做，且不代你发送。",
  alternates: { canonical: "/crossborder/workbench/service-copilot" },
};

export default function ServiceCopilotPage() {
  return (
    <WorkbenchPage slug="service-copilot">
      <CopilotPanel />
    </WorkbenchPage>
  );
}
