import type { Metadata } from "next";
import { SampleReport } from "./sample";

export const metadata: Metadata = {
  title: "样例报告 · 商品口碑与需求洞察｜虾米跨境 · 虾米伙伴",
  description: "深度研究样例:挂脖风扇 · 新品进入验证。展示正式报告的结构、证据标注与局限说明方式,数据为演示编写。",
  alternates: { canonical: "/crossborder/research/sample" },
};

export default function SampleReportPage() {
  return <SampleReport />;
}
