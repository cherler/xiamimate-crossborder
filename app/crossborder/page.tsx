import type { Metadata } from "next";
import { CrossborderCenter } from "./center";
import { StructuredData } from "../structured-data";
import { siteUrl } from "../../lib/site";
export const metadata: Metadata = {
  title: "虾米跨境｜把一个商品的账算清楚",
  description:
    "利润、定价、广告、物流和税费计算，配合本地商品档案、Listing 检查、评论统计与客服模板。",
  alternates: { canonical: siteUrl("/") },
};
export default function CrossborderPage() {
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "虾米跨境",
          url: siteUrl("/"),
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          inLanguage: "zh-CN",
          featureList: [
            "五个经营计算器",
            "本地商品档案与备份",
            "Listing 检查",
            "评论统计与竞品对比",
            "客服回复模板",
          ],
        }}
      />
      <CrossborderCenter />
    </>
  );
}
