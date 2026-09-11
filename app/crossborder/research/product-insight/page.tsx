import type { Metadata } from "next";
import { InsightLaunch } from "./launch";

export const metadata: Metadata = {
  title: "商品口碑与需求洞察｜深度研究 · 虾米伙伴",
  description: "输入商品名称或链接,扫描可研究性:确认商品身份、可得资料与研究目录,确认范围与费用后启动 AI 深度研究。",
  alternates: { canonical: "/crossborder/research/product-insight" },
};

export default function ProductInsightPage() {
  return <InsightLaunch />;
}
