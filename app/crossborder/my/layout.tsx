import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的商品｜虾米跨境",
  description: "管理本地商品档案、事实库、竞品与测算记录，支持导出备份和导入恢复。",
  robots: { index: false, follow: false },
};

export default function MyProductsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
