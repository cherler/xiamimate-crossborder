import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的商品｜虾米跨境 · 虾米伙伴",
  description: "管理个人商品档案:平台事实、口碑样本、测算记录、事实库、竞品组和研究入口。",
  robots: { index: false, follow: false },
};

export default function MyProductsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
