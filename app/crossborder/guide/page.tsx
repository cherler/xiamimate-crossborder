import { siteUrl } from "../../../lib/site";
import type { Metadata } from "next";
import { GuideView } from "./guide";
import { StructuredData } from "../../structured-data";

export const metadata: Metadata = {
  title: "跨境电商新手入门指南(2026 版)｜虾米跨境 · 虾米伙伴",
  description: "从行业认知、路线选择,到第一笔可验证订单:17 章 + 附录,含 20 个核心术语、商品验证框架、90 天行动路线与四条入行路径。免费全文,不构成收益承诺。",
  alternates: { canonical: siteUrl("/crossborder/guide") },
};

export default function GuidePage() {
  const articleData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "跨境电商新手入门指南（2026 版）",
    description: metadata.description,
    url: "https://xiamimate.com/crossborder/guide",
    inLanguage: "zh-CN",
    dateModified: "2026-07-27",
    author: { "@id": "https://xiamimate.com/#organization" },
    publisher: { "@id": "https://xiamimate.com/#organization" },
    isPartOf: { "@id": "https://xiamimate.com/#website" },
  };
  return <><StructuredData data={articleData} /><GuideView /></>;
}
