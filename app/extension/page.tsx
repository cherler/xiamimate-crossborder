import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { SiteFooter, SiteHeader, BackTo } from "../site-chrome";
import { siteUrl } from "../../lib/site";
import { ExtensionIntro } from "./intro";
import pkg from "../../extension/package.json";

export const metadata: Metadata = {
  title: "虾米采集助手 · 浏览器扩展｜虾米跨境",
  description: "在商品页一键采集公开信息，导出文件后核对并导入本地商品档案。只在你点击时读取当前标签页，不后台运行、不批量抓取。",
  alternates: { canonical: siteUrl("/extension/") },
};

export default function ExtensionPage() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader />
      <section className="content-page extension-intro-page">
        <BackTo />
        <div className="content-head">
          <div className="hero-kicker"><Sparkles size={14} /> EXTENSION</div>
          <h1>虾米采集助手</h1>
          <p>在商品页点一下，采集商品信息、口碑主题与评论原文，<br />核对后一起放进你的商品档案。</p>
        </div>
        <div className="content-body"><ExtensionIntro version={pkg.version} /></div>
      </section>
      <SiteFooter />
    </main>
  );
}
