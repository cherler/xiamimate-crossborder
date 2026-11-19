"use client";
import { ArrowLeft, Code2, Package, SunMoon } from "lucide-react";
import { SiteLink } from "./site-link";
import { XiamiMark } from "./logo";
import { REPO_URL } from "../lib/site";
import { readThemePref, writeThemePref, applyThemePref } from "../lib/theme";

export function BackTo({ moduleKey: _moduleKey }: { moduleKey?: string }) {
  return (
    <SiteLink className="tool-breadcrumb" href="/">
      <ArrowLeft size={13} /> 虾米跨境
    </SiteLink>
  );
}
export function BackToOrigin() {
  return <BackTo />;
}
export function SiteHeader({ active: _active }: { active?: string }) {
  return (
    <header className="local-header">
      <SiteLink href="/" className="local-brand">
        <XiamiMark size={30} />
        <span>
          虾米跨境<small>XIAMIMATE CROSSBORDER</small>
        </span>
      </SiteLink>
      <nav aria-label="主导航">
        <SiteLink href="/">工具</SiteLink>
        <SiteLink href="/crossborder/my/">
          <Package size={15} /> 我的商品
        </SiteLink>
        <SiteLink href="/crossborder/guide/">入门教程</SiteLink>
        <SiteLink
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 源码"
        >
          <Code2 size={17} />
        </SiteLink>
        <button
          onClick={() =>
            (() => {
              const next = readThemePref() === "dark" ? "light" : "dark";
              writeThemePref(next);
              applyThemePref(next);
            })()
          }
          aria-label="切换明暗主题"
        >
          <SunMoon size={17} />
        </button>
      </nav>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="local-footer">
      <span>虾米跨境 · 把一个商品的账算清楚</span>
      <span>资料保存在当前浏览器，可在「我的商品」导出备份。</span>
      <SiteLink href="https://xiamimate.com/" target="_blank" rel="noreferrer">
        虾米伙伴 · 个人维护，可能随时关闭或失效
      </SiteLink>
    </footer>
  );
}
