import { siteUrl } from "../../../lib/site";
import type { Metadata } from "next";
import { AssessPanel } from "./assess";

export const metadata: Metadata = {
  title: "综合测算｜虾米跨境 · 虾米伙伴",
  description: "当前商品的账一页走完:成本底盘、单件利润、广告红线、定价空间,四个环节同一份档案串着算,给出能拍板的综合判决。",
  alternates: { canonical: siteUrl("/crossborder/assess") },
};

export default function AssessPage() {
  return <AssessPanel />;
}
