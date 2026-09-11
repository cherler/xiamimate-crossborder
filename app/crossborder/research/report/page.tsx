import type { Metadata } from "next";
import { ResearchReportView } from "./view";

export const metadata: Metadata = {
  title: "研究报告｜深度研究 · 虾米伙伴",
  description: "商品口碑与需求洞察报告:四张结论卡、分章正文、结论级证据与来源附录。运行中可查看阶段进度,中断可续跑。",
  robots: { index: false, follow: false },
};

export default function ResearchReportPage() {
  return <ResearchReportView />;
}
