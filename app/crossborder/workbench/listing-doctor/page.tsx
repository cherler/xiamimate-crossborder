import type { Metadata } from "next";
import { WorkbenchPage } from "../workbench-page";
import { ListingDoctor } from "./workbench";

export const metadata: Metadata = {
  title: "Listing 诊断与改写工作台｜跨境经营工具 · 虾米伙伴",
  description: "上传商品资料，AI 逐条抽取事实并附原文证据，由你确认后建立商品事实库；未确认的事实不会被写进任何文案。",
  alternates: { canonical: "/crossborder/workbench/listing-doctor" },
};

export default function ListingDoctorPage() {
  return (
    <WorkbenchPage slug="listing-doctor">
      <ListingDoctor />
    </WorkbenchPage>
  );
}
