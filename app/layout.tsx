import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import "./standalone.css";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "../lib/theme";
import { siteUrl, sitePath } from "../lib/site";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: "虾米跨境｜把一个商品的账算清楚",
  description:
    "跨境经营计算器、商品档案、Listing 检查、评论统计与客服模板，在浏览器中直接使用。",
  applicationName: "虾米跨境",
  icons: { icon: sitePath("/favicon.svg") },
  openGraph: {
    title: "虾米跨境",
    description: "把一个商品的账算清楚",
    url: siteUrl("/"),
    siteName: "虾米跨境",
    locale: "zh_CN",
    type: "website",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
