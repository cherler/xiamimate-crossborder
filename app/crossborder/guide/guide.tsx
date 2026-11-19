"use client";
import { SiteLink } from "../../site-link";


/**
 * 《跨境电商新手入门指南(2026 版)》—— 免费全文页。
 *
 * 教程是信任层(免费开放、可被搜索),工具是行动层:每章底部挂
 * 「把这章的账自己算一遍」。声明条置顶:不承诺、不构成建议;
 * 政策段自带来源与校订日期 —— 过时的政策比没有政策更害人。
 */

import { ArrowLeft, ArrowUp, BookOpenCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import {
  GUIDE_CHAPTER_COUNT, GUIDE_META, GUIDE_PARTS, type GuideBlock, type GuideChapter,
} from "../../../lib/crossborder/guide";
import { rich } from "../../../lib/crossborder/rich-text";

function Block({ b }: { b: GuideBlock }) {
  switch (b.kind) {
    case "p":
      return <p className="gd-p">{rich(b.text)}</p>;
    case "list":
      return <ul className="gd-list">{b.items.map((x, i) => <li key={i}>{rich(x)}</li>)}</ul>;
    case "check":
      return <ul className="gd-list gd-checklist">{b.items.map((x, i) => <li key={i}>{rich(x)}</li>)}</ul>;
    case "table":
      return (
        <div className="gd-twrap">
          <table className="gd-table">
            <thead><tr>{b.cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{rich(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case "callout":
      return <div className="gd-callout"><b>{rich(b.title)}</b><p>{rich(b.text)}</p></div>;
  }
}

function Chapter({ ch }: { ch: GuideChapter }) {
  return (
    <section className="gd-chapter" id={ch.slug}>
      <div className="gd-ch-head">
        <span className="gd-no">{ch.no}</span>
        <h3>{ch.title}</h3>
      </div>
      <p className="gd-lead">{rich(ch.lead)}</p>
      {ch.blocks.map((b, i) => <Block key={i} b={b} />)}
      {ch.tools && ch.tools.length > 0 && (
        <div className="gd-tools">
          <span>把这章的账自己算一遍:</span>
          {ch.tools.map((t) => <SiteLink key={t.href} href={t.href}>{t.name}</SiteLink>)}
        </div>
      )}
    </section>
  );
}

export function GuideView() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page gd-page">
        <SiteLink className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</SiteLink>

        <header className="gd-hero">
          <span className="gd-kicker"><BookOpenCheck size={13} /> XIAMI CROSS-BORDER · GUIDE 2026</span>
          <h1>{GUIDE_META.title}</h1>
          <p className="gd-sub">{GUIDE_META.subtitle} · {GUIDE_META.edition} · 资料检索与校订:{GUIDE_META.revised}</p>
          <div className="gd-notice">
            <b>这不是「快速暴富教程」。</b>
            示例金额只用于演示方法,不构成收益承诺、投资建议、法律或税务意见;税务、合规与平台政策持续变化,
            正式经营前请以目标市场监管机构与平台后台的最新要求为准。不建议购买店铺、借用主体、伪造认证、
            刷单、操纵评论或销售侵权商品。
          </div>
        </header>

        {/* 四段式目录 */}
        <nav className="gd-toc" aria-label="指南目录">
          {GUIDE_PARTS.map((p) => (
            <div className="gd-toc-part" key={p.key}>
              <div className="gd-toc-ph">{p.label}</div>
              <div className="gd-toc-ps">{p.note}</div>
              <ol>
                {p.chapters.map((ch) => (
                  <li key={ch.slug} className={ch.hot ? "hot" : undefined}>
                    <SiteLink href={`#${ch.slug}`}><span>{ch.no}</span>{ch.title}</SiteLink>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

        <div className="gd-90band">
          <b>90 天行动路线</b>
          <span>D1–30 认知与选定组合</span>
          <span>D31–60 商品验证与打样</span>
          <span>D61–90 小批量上线与复盘</span>
          <SiteLink href="#90-days">看第 15 章 →</SiteLink>
        </div>

        {GUIDE_PARTS.map((p) => (
          <div key={p.key} className="gd-partsec">
            <div className="gd-part-head"><h2>{p.label}</h2><small>{p.note} · {p.chapters.length} 章</small></div>
            {p.chapters.map((ch) => <Chapter key={ch.slug} ch={ch} />)}
          </div>
        ))}

        <footer className="gd-foot">
          <p>全文免费开放 · 共 {GUIDE_CHAPTER_COUNT} 章 + 附录 · 校订 {GUIDE_META.revised}。
          可把教程里的测算存成商品档案，导出备份后在其他设备导入继续使用。</p>
          <p className="gd-motto">先把一件事算清楚,再把一件事做完整。</p>
          <SiteLink className="gd-top" href="#"><ArrowUp size={13} /> 回到目录</SiteLink>
        </footer>
      </section>
      <SiteFooter />
    </main>
  );
}
