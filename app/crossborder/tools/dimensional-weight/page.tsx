import type { Metadata } from "next";
import { DimWeightCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "计费重与包装优化器｜跨境经营工具 · 虾米伙伴",
  description: "按承运商规则（除数 / 尺寸取整 / 重量进位 / 最低计费重）算真实计费重，逐步解释账单为何更高，并对比包装方案能省多少运费。规则可手动覆盖，以承运商资费为准。",
  alternates: { canonical: "/crossborder/tools/dimensional-weight" },
};

export default function DimensionalWeightPage() {
  return <DimWeightCalculator />;
}
