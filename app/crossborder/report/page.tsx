import type { Metadata } from "next";
import { ReportView } from "./report";

export const metadata: Metadata = {
  title: "深度用户声音报告｜虾米跨境 · 虾米伙伴",
  description: "分段生成、按实际用量消耗 AI 积分的商品用户声音报告:执行摘要、带证据的问题清单、可放大的卖点与样本口径注意事项。",
  robots: { index: false, follow: false },
};

export default function ReportPage() {
  return <ReportView />;
}
