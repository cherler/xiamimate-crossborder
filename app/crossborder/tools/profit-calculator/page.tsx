import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { ProfitCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "利润计算器｜跨境经营工具 · 虾米伙伴",
  description: "输入售价、采购、物流、佣金和广告，即时算清单件净利润、净利润率与保本售价。公式透明可核对。",
  alternates: { canonical: siteUrl("/crossborder/tools/profit-calculator") },
};

export default function ProfitCalculatorPage() {
  return <ProfitCalculator />;
}
