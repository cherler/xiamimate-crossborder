"use client";
import { SiteLink } from "../../site-link";


/**
 * 跨境基础 Wiki —— 新手向常青词条,账本式排版。
 * 词条即台账行:词 + 一句话 + 展开的两三句 + 相关工具。
 * 只收不过时的骨架知识;会变的数字不写具体值,写「去哪核实」。
 */

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Search } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import { WIKI_GROUPS, WIKI_COUNT, type WikiEntry } from "../../../lib/crossborder/wiki";
import { rich } from "../../../lib/crossborder/rich-text";

function Entry({ e }: { e: WikiEntry }) {
  return (
    <details className="wk-entry" id={e.slug}>
      <summary>
        <span className="wk-term">{e.term}{e.en && <em>{e.en}</em>}</span>
        <span className="wk-one">{rich(e.one)}</span>
      </summary>
      <div className="wk-body">
        <p>{rich(e.body)}</p>
        {e.tools && e.tools.length > 0 && (
          <div className="wk-tools">
            <span>上手算它:</span>
            {e.tools.map((t) => (
              <SiteLink key={t.href} href={t.href}>{t.name} <ArrowRight size={12} /></SiteLink>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function WikiPage() {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return WIKI_GROUPS;
    return WIKI_GROUPS
      .map((g) => ({
        ...g,
        entries: g.entries.filter((e) =>
          [e.term, e.en ?? "", e.one, e.body].some((s) => s.toLowerCase().includes(query))),
      }))
      .filter((g) => g.entries.length > 0);
  }, [q]);

  const shown = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div className="page-col">
      <SiteHeader active="crossborder" />
      <main className="wk-wrap">
        <SiteLink className="tool-breadcrumb" href="/crossborder"><ArrowLeft size={13} /> 虾米跨境</SiteLink>

        <div className="wk-head">
          <span className="my-kicker"><BookOpen size={13} /> 跨境基础</span>
          <h1>名词与常识</h1>
          <p>
            {WIKI_COUNT} 个新手最常卡住的词,只讲<b>不会过时的骨架</b>:口径、结构、常见误区。
            凡是会变的数字(税率 / 费率 / 政策),这里不给具体值 —— 给你「它长什么样、去哪核实」。
            每个词条都挂着能立刻上手算它的工具。
          </p>
          <div className="wk-search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="搜词条(ACoS / 体积重 / DDP…)" aria-label="搜索词条" />
            {q && <span className="wk-count">{shown} 条</span>}
          </div>
          {!q && (
            <nav className="wk-toc" aria-label="分组导航">
              {WIKI_GROUPS.map((g) => (
                <SiteLink key={g.key} href={`#g-${g.key}`}>{g.title}<em>{g.entries.length}</em></SiteLink>
              ))}
            </nav>
          )}
        </div>

        {groups.length === 0 ? (
          <p className="cb-empty">没有匹配的词条。换个词试试,或者这个词值得收录 —— 欢迎反馈。</p>
        ) : groups.map((g) => (
          <section className="wk-group" key={g.key} id={`g-${g.key}`}>
            <div className="wk-group-head"><h2>{g.title}</h2><small>{g.note}</small></div>
            <div className="wk-list">
              {g.entries.map((e) => <Entry key={e.slug} e={e} />)}
            </div>
          </section>
        ))}

        <p className="wk-foot">
          这份基础只求「不带错路」,不求全 —— 具体费率、政策、平台规则永远以官方当期文件为准。
          学完一个词,最好的巩固是<SiteLink href="/crossborder">拿工具算一遍</SiteLink>。
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
