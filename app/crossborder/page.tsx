import type { Metadata } from "next";
import { CrossborderCenter } from "./center";
import { StructuredData } from "../structured-data";

export const metadata: Metadata = {
  title: "虾米跨境｜虾米伙伴",
  description: "利润、定价、广告、物流和税费，快速算清楚。手动表单为主，AI 负责读取资料。",
  alternates: { canonical: "/crossborder" },
};

export default function CrossborderPage() {
  const appData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": "https://xiamimate.com/crossborder#application",
    name: "虾米跨境",
    url: "https://xiamimate.com/crossborder",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "zh-CN",
    description: "面向跨境卖家的经营计算器、AI 工作台、商品档案与可追溯深度研究。",
    featureList: [
      "利润、定价、到岸成本、广告盈亏与计费重计算器",
      "Listing 诊断、用户声音洞察与客服回复工作台",
      "商品口碑与需求深度研究",
      "商品档案与证据溯源",
    ],
    publisher: { "@id": "https://xiamimate.com/#organization" },
  };
  return <><StructuredData data={appData} /><CrossborderCenter /></>;
}
