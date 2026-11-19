import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { LandedCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "进口到岸成本估算｜跨境经营工具 · 虾米伙伴",
  description: "按汇率、关税与 VAT 估算进口到岸成本与目标售价（基础估算，未含清关/保险/派送；目标售价未扣平台佣金与广告）。公式透明可核对。",
  alternates: { canonical: siteUrl("/crossborder/tools/landed-cost") },
};

export default function LandedCostPage() {
  return <LandedCalculator />;
}
