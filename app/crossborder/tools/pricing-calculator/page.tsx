import type { Metadata } from "next";
import { PricingCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "定价决策模拟器｜跨境经营工具 · 虾米伙伴",
  description: "按目标净利率 / ROI / 单件利润 / 保本倒推售价，给出售价情景表与最大折扣空间（只算财务可行区间，不预测销量）。公式透明可核对。",
  alternates: { canonical: "/crossborder/tools/pricing-calculator" },
};

export default function PricingCalculatorPage() {
  return <PricingCalculator />;
}
