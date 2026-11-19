import { siteUrl } from "../../../lib/site";
import type { Metadata } from "next";
import { WikiPage } from "./wiki";

export const metadata: Metadata = {
  title: "跨境基础 · 名词与常识｜虾米跨境",
  description: "新手向的跨境电商基础词条:利润口径、物流与税、平台与广告、Listing 与合规。只讲不过时的骨架知识,会变的数字一律注明去哪核实。",
  alternates: { canonical: siteUrl("/crossborder/wiki") },
};

export default function Page() {
  return <WikiPage />;
}
