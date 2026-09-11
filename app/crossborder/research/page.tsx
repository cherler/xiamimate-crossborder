import type { Metadata } from "next";
import { ResearchHub } from "./research";

export const metadata: Metadata = {
  title: "深度研究｜虾米跨境 · 虾米伙伴",
  description: "商品口碑与需求洞察:基于评论、社区讨论、问答、媒体和公开网页的 AI 深度研究。异步生成、结论可追溯到来源、按实际用量消耗 AI 积分。",
  alternates: { canonical: "/crossborder/research" },
};

export default function ResearchPage() {
  return <ResearchHub />;
}
