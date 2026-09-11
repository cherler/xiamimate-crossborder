import type { Metadata } from "next";
// P1-3 自托管字体:geist 官方包把 woff2 随 npm 包本地分发,构建不再请求
// Google Fonts(大陆构建环境连不上会直接失败)。CSS 变量名与旧写法完全一致
// (--font-geist-sans / --font-geist-mono),globals.css 无需改动。
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import { StructuredData } from "./structured-data";
import { THEME_BOOT_SCRIPT } from "../lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL("https://xiamimate.com"),
  title: "虾米伙伴｜模块化 AI 增强工具平台",
  description: "AI 负责理解需求，专业工具负责给出清晰、可靠、可验证的结果。",
  applicationName: "虾米伙伴",
  authors: [{ name: "虾米伙伴", url: "https://xiamimate.com/about" }],
  creator: "虾米伙伴",
  publisher: "虾米伙伴",
  category: "AI 增强工具",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "虾米伙伴｜让复杂的事，简单一点",
    description: "一个模块化的 AI 增强工具平台。工具给结果，AI 帮你用。",
    url: "https://xiamimate.com/",
    siteName: "虾米伙伴",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "/og.png", width: 1730, height: 909, alt: "虾米伙伴模块化 AI 增强工具平台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "虾米伙伴｜让复杂的事，简单一点",
    description: "工具给结果，AI 帮你用。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const siteGraph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://xiamimate.com/#organization",
        name: "虾米伙伴",
        alternateName: ["XIAMI MATE", "XiaMimate"],
        url: "https://xiamimate.com/",
        description: "一个模块化 AI 增强工具平台，让复杂的事简单一点。",
      },
      {
        "@type": "WebSite",
        "@id": "https://xiamimate.com/#website",
        url: "https://xiamimate.com/",
        name: "虾米伙伴",
        alternateName: "XIAMI MATE",
        inLanguage: "zh-CN",
        publisher: { "@id": "https://xiamimate.com/#organization" },
      },
    ],
  };
  return (
    /**
      * `suppressHydrationWarning` 只作用在 <html> 这一个元素的属性上,子节点照常对账。
      *
      * 下面那段 THEME_BOOT_SCRIPT 必须在 hydrate 之前同步跑,它给 <html> 挂上
      * `data-theme` 和 `data-eco` —— 而这正是 React 也要对账的属性,于是服务端 HTML
      * 与客户端对不上,控制台报「A tree hydrated but some attributes …」。
      * 只在**用户设置过**外观或省流之后才报,所以很容易一直没人注意到。
      *
      * 脚本不能挪进 React:挪进去就会先按默认外观画一帧再改,「每翻一页闪一下白」
      * 正是它要躲的东西。所以放过 <html> 的属性对账 —— Next 官方对预加载主题脚本
      * 给的就是这个做法。(/atlas 那份 layout 里有同样一段说明。)
      */
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        {/* 外观偏好要在第一帧之前落地，见 lib/theme.ts 的说明。必须同步、必须不走 React。 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <StructuredData data={siteGraph} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
