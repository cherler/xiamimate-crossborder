import { siteUrl } from "../../../../lib/site";
import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { ListingDoctor } from "./workbench";

export const metadata: Metadata = {
  title: "Listing 检查与事实库｜虾米跨境",
  description: "在浏览器中录入并确认商品事实，编辑标题五点，检查关键词与事实缺口，保存检查快照。",
  alternates: { canonical: siteUrl("/crossborder/workbench/listing-doctor") },
};

export default function ListingDoctorPage() {
  return (
    <WorkbenchPage slug="listing-doctor">
      <ListingDoctor />
    </WorkbenchPage>
  );
}
