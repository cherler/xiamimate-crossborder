import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { AcosCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "广告盈亏规划器｜跨境经营工具 · 虾米伙伴",
  description: "测算保本 / 目标 ACoS、每单可承受广告费，并按实测 CPC 与转化率推算出价上限与 TACoS（只给财务红线，不下广告策略结论）。公式透明可核对。",
  alternates: { canonical: siteUrl("/crossborder/tools/acos-break-even") },
};

export default function AcosBreakEvenPage() {
  return <AcosCalculator />;
}
