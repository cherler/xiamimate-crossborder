"use client";

/**
 * /crossborder 「虾米跨境」入口 —— 卖家算账工作间的门口。
 *
 * 两条进门的路:①omnibox —— 一个框一个按钮,按钮永远执行框内内容
 * (搜索 / 建档 / 读取网页 / AI 分流,随输入类型变);②「接着算」签名件。
 * 工具卡用 tcard 语法:图标 + 标题 + 一词小注 + 一句描述 + 动作,不放量纲。
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowRight, BookOpen, BookOpenCheck, Gauge, ImagePlus, Package, Puzzle, Search, Sparkles, Telescope } from "lucide-react";
import { AI_ENABLED, AUTH_ENABLED, apiUrl } from "../../lib/api";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { RouterModal } from "./tools/router-import";
import { HeroBubbles } from "./hero-bubbles";
import { createProductFromRef, currentProduct, subscribeProducts } from "../../lib/crossborder/products";
import { readProductModel } from "../../lib/crossborder/product-model";
import { MARKET_LABEL, parseListingRef } from "../../lib/crossborder/asin";
import { WIKI_COUNT, WIKI_GROUPS, type WikiEntry } from "../../lib/crossborder/wiki";
import { GUIDE_CHAPTER_COUNT } from "../../lib/crossborder/guide";
import { listRecentTools } from "../../lib/crossborder/recent-tools";
import {
  CROSSBORDER_TOOLS, RESEARCH_PRODUCTS, WORKBENCHES, STATUS_LABEL, statusCounts,
  TOOL_INTENT_KEYWORDS, researchStartPath, researchSamplePath,
  type CrossborderTool, type Workbench,
} from "../../lib/crossborder/registry";

/** 卡片标题旁的一词小注 —— 人话,不是量纲。 */
const TOOL_NOTE: Record<string, string> = {
  profit: "最常用",
  pricing: "倒推售价",
  acos: "ACoS",
  dimweight: "包装省费",
  landed: "关税与 VAT",
};
const WB_NOTE: Record<string, string> = {
  "listing-doctor": "有依据地改",
  "voice-insight": "量化归因",
  "service-copilot": "合规校验",
};

function ToolCard({ tool }: { tool: CrossborderTool }) {
  const Icon = tool.icon;
  const reachable = tool.status === "available";
  const inner = (
    <>
      <div className="tc-head">
        <span className="tc-icon"><Icon size={19} strokeWidth={1.8} /></span>
        <span className="tc-title"><b>{tool.name}</b><span>{TOOL_NOTE[tool.id] ?? ""}</span></span>
        {!reachable && <span className={`tool-card-badge ${tool.status}`}>{STATUS_LABEL[tool.status]}</span>}
      </div>
      <p>{tool.short}</p>
      {reachable && <span className="tc-go">开始算 →</span>}
    </>
  );
  return reachable
    ? <a className="tcard" href={`/crossborder/tools/${tool.slug}`}>{inner}</a>
    : <div className="tcard is-locked" aria-disabled="true" title="独立工具页建设中">{inner}</div>;
}

function WorkbenchCard({ wb }: { wb: Workbench }) {
  const Icon = wb.icon;
  return (
    <a className="tcard is-wb" href={`/crossborder/workbench/${wb.slug}`}>
      <div className="tc-head">
        <span className="tc-icon"><Icon size={19} strokeWidth={1.8} /></span>
        <span className="tc-title"><b>{wb.name}</b><span>{WB_NOTE[wb.slug] ?? ""}</span></span>
      </div>
      <p>{wb.short}</p>
      <span className="tc-go">进入工作台 →</span>
    </a>
  );
}

/**
 * 深度研究(右栏主推卡):深色+金强调,与免费工具卡彻底区分。三层入口逐条列出。
 * 启动/样例 href 从 registry 单一来源读(researchStartPath/researchSamplePath)。
 */
function ResearchRail() {
  return (
    <div className="rr-card">
      <div className="rr-h"><Telescope size={13} /> 深度研究</div>
      <p className="rr-pitch">联网搜真实评论与讨论,把需求、差评与机会整理成报告,每个结论都能点开看来源。</p>
      {RESEARCH_PRODUCTS.map((r, i) => {
        const start = researchStartPath(r);
        const sample = researchSamplePath(r);
        return (
          <div key={r.id} className={`rr-tier${start ? "" : " plan"}`}>
            <span className="rr-num">{i + 1}</span>
            <div className="rr-tinfo"><div className="rr-tn">{r.name}</div><div className="rr-td">{r.short}</div></div>
            <div className="rr-acts">
              {start
                ? <a className="rr-go" href={start}>开始 →</a>
                : <span className="rr-plan">{STATUS_LABEL[r.status]}</span>}
              {sample && <a className="rr-sample" href={sample}>样例</a>}
            </div>
          </div>
        );
      })}
      <a className="rr-cta" href="/crossborder/research/">了解深度研究 / 消耗多少积分 →</a>
    </div>
  );
}

const railDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
};

type NewsRow = { url: string; title: string; titleZh?: string | null; publishedAt?: string };

/**
 * 出海动态(右栏):纵向慢滚,全部条目都用上(2026-07-30 用户点名)。
 *
 * 原来只 slice(0,5) —— 后端每轮抓回 30 条,25 条从没露过面。
 * 现在整列缓慢上滚,悬停/聚焦暂停;列表复制一份接在后面做无缝循环。
 * 标题优先显示入库时批量翻好的中文,没有译文就回落原文。
 */
function NewsRail() {
  const [items, setItems] = useState<NewsRow[] | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let alive = true;
    fetch(apiUrl("/v1/news")).then((r) => r.json())
      .then((d) => { if (alive) setItems(d.items || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  // rAF 手推 scrollTop,不用 CSS 动画 —— 悬停要停在当前位置,而不是跳回关键帧
  useEffect(() => {
    if (!items?.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = track.current;
    if (!el) return;
    let raf = 0;
    // 位置存在这个浮点累加器里,不做 el.scrollTop += x ——
    // 浏览器读 scrollTop 会取整,每帧加零点几再读回来永远是 0,根本累加不上去。
    let pos = 0;
    let last = performance.now();
    const PX_PER_SEC = 8;      // 按时间算而不是按帧 —— 120Hz 屏上按帧会快一倍
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);   // 切标签页回来别一次跳一大段
      last = now;
      if (!paused.current) {
        pos += PX_PER_SEC * dt;
        const half = el.scrollHeight / 2;
        if (half > 0 && pos >= half) pos -= half;
        el.scrollTop = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items]);

  if (!AUTH_ENABLED || items === null) return null;
  return (
    <div className="cb-rail-panel news-rail">
      <div className="rail-head"><h3>出海动态</h3></div>
      {items.length === 0 ? (
        <p className="rail-empty">今日整理中,稍后回来看看。</p>
      ) : (
        <div className="nr-scroll" ref={track}
          onPointerEnter={() => { paused.current = true; }}
          onPointerLeave={() => { paused.current = false; }}
          onFocusCapture={() => { paused.current = true; }}
          onBlurCapture={() => { paused.current = false; }}>
          {/* 第二份只为无缝循环,对读屏隐藏且不可聚焦 —— 免得同一条被读两遍 */}
          {[0, 1].map((dup) => (
            <ul key={dup} aria-hidden={dup === 1 || undefined}>
              {items.map((n) => (
                <li key={`${dup}-${n.url}`}>
                  <span className="nr-date">{railDate(n.publishedAt) || "近日"}</span>
                  <a className="nr-title" href={n.url} target="_blank" rel="noreferrer noopener"
                    tabIndex={dup === 1 ? -1 : undefined}>{n.titleZh || n.title}</a>
                </li>
              ))}
            </ul>
          ))}
        </div>
      )}
    </div>
  );
}

/** 跨境基础(右栏):名词与常识 + 新手入门教程。 */
/**
 * 浏览器扩展入口。
 *
 * 放在右栏而不是工具网格里:它不是一个"打开就能用"的工具,而是给已有工作流
 * 装个配件 —— 混进工具卡里会让人以为点进去就能算点什么。
 */
function ExtensionRail() {
  return (
    <div className="cb-rail-panel basics-rail">
      <div className="rail-head"><h3>浏览器扩展</h3><small>商品页一键建档</small></div>
      <a className="basics-item" href="/extension">
        <Puzzle size={15} />
        <div>
          <b>虾米采集助手</b>
          <span>价格、评分、排名、口碑主题一起进档案 —— 只在你点击时读当前这一页</span>
        </div>
      </a>
    </div>
  );
}

function BasicsRail() {
  return (
    <div className="cb-rail-panel basics-rail">
      <div className="rail-head"><h3>跨境基础</h3><small>只讲不过时的骨架</small></div>
      <a className="basics-item" href="/crossborder/wiki">
        <BookOpen size={15} />
        <div><b>名词与常识</b><span>{WIKI_COUNT} 条 · 查词典式,每条挂着能算它的工具</span></div>
      </a>
      <a className="basics-item" href="/crossborder/guide">
        <BookOpenCheck size={15} />
        <div><b>新手入门教程 · 2026 版</b><span>{GUIDE_CHAPTER_COUNT} 章 · 90 天行动路线</span></div>
      </a>
    </div>
  );
}

/** 最近用过的工具:轻量 chips,回头客少走一步。本机记录。 */
function RecentStrip() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // 虾米君剧场(跨境版):悬停哪个入口它就趴过去。研究带的三个深度调研入口
  // (口碑洞察 / 竞品对比 / 综合研究)各自独立浮动,不再被当成一个整体(#80)。
  // 卡间平移不回角(#79):离开卡片只启一个「回角」延迟计时器,期间若进入下一张卡
  // 就取消它、直接平移过去;只有真在空白停留 ~280ms 才回右下角。
  useEffect(() => {
    const SEL = ".tcard,.acard,.rr-card,.cb-rail-panel";
    let perchT: number | undefined;    // 进卡后驻留才起跑
    let returnT: number | undefined;   // 离卡后延迟回角
    const perch = (card: Element) =>
      window.dispatchEvent(new CustomEvent("xm-pet-perch", { detail: { rect: card.getBoundingClientRect(), mode: "cardfoot" } }));
    const over = (e: Event) => {
      const card = (e.target as HTMLElement).closest?.(SEL);
      if (!card) return;
      window.clearTimeout(returnT);    // 进了新卡 → 取消回角,直接过去
      window.clearTimeout(perchT);
      perchT = window.setTimeout(() => perch(card), 150);
    };
    const out = (e: Event) => {
      const pe = e as PointerEvent;
      const from = (pe.target as HTMLElement).closest?.(SEL);
      const to = (pe.relatedTarget as HTMLElement | null)?.closest?.(SEL);
      if (from && to && from !== to) {
        // 卡 → 卡(含研究带内部三入口互跳):立即改趴新卡,不回角
        window.clearTimeout(returnT);
        window.clearTimeout(perchT);
        perchT = window.setTimeout(() => perch(to), 120);
        return;
      }
      if (from && !to) {
        window.clearTimeout(perchT);
        window.clearTimeout(returnT);
        returnT = window.setTimeout(
          () => window.dispatchEvent(new CustomEvent("xm-pet-perch", { detail: {} })), 280);
      }
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      window.clearTimeout(perchT);
      window.clearTimeout(returnT);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      window.dispatchEvent(new CustomEvent("xm-pet-perch", { detail: {} }));
    };
  }, []);
  if (!hydrated) return null;
  const recents = listRecentTools()
    .map((e) => CROSSBORDER_TOOLS.find((t) => t.id === e.id))
    .filter((t): t is CrossborderTool => !!t && t.status === "available")
    .slice(0, 4);
  if (recents.length < 2) return null;   // 只用过一个谈不上「最近」,不摆
  return (
    <div className="cb-recent">
      <span className="cb-recent-lab">最近用过</span>
      {recents.map((t) => (
        <a key={t.id} href={`/crossborder/tools/${t.slug}`}>{t.name}</a>
      ))}
    </div>
  );
}

/** 综合测算入口(#P7):它读同一份商品档案,新档案点进去是空态,首触会挫。
 *  没有可判的账时,把入口指向「先填参数」的利润计算器,并如实改写文案与 CTA,
 *  不再把最显眼的卡片引向死胡同。有账了才直达综合测算。 */
function AssessCard() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); return subscribeProducts(force); }, []);
  const m = hydrated ? readProductModel() : null;
  const ready = !!m && m.updatedAt > 0;
  return (
    <a className="acard" href={ready ? "/crossborder/assess" : "/crossborder/tools/profit-calculator"}>
      <span className="tc-icon"><Gauge size={19} strokeWidth={1.8} /></span>
      <span className="ac-copy">
        <b>综合测算 · 一页把账走完</b>
        <span>{ready
          ? "成本底盘 → 单件利润 → 广告红线 → 定价空间,同一份档案串着算。"
          : "先在利润计算器填一个商品的参数,这里就把成本 → 利润 → 广告 → 定价一页合并。"}</span>
      </span>
      <span className="ac-tag">只核对 · 不下结论</span>
      <span className="tc-go">{ready ? "进去看看 →" : "先填参数 →"}</span>
    </a>
  );
}

/** 签名件:「接着算」—— 当前商品档案直接摆在门口,一键回工具继续。 */
function ContinueStrip() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    return subscribeProducts(force);
  }, []);
  if (!hydrated) return null;
  const p = currentProduct();
  const touched = p && (p.name.trim() || (p.records?.length ?? 0) > 0);
  if (!touched) return null;   // 还没干过活,门口不摆空档案

  const n = p.records?.length ?? 0;
  return (
    <a className="cb-continue" href="/crossborder/tools/profit-calculator">
      <span className="cbc-ic"><Package size={16} /></span>
      <span className="cbc-name">{p.name.trim() || "未命名商品"}</span>
      <span className="cbc-meta">{n ? `${n} 条测算记录` : "档案已建立"}{p.cloudId ? " · 云端" : " · 本机"}</span>
      <span className="cbc-go">接着算 <ArrowRight size={14} /></span>
    </a>
  );
}

/** omnibox 输入分类 → 按钮语义。按钮永远执行框内内容,Enter 同效。 */
type OmniKind = "empty" | "word" | "ref" | "url" | "long";

export function CrossborderCenter() {
  const [query, setQuery] = useState("");
  const [aiSeed, setAiSeed] = useState<string | null>(null); // 非 null 即打开智能读取,携带已输入文字
  const counts = statusCounts();
  const allLive = counts.building === 0 && counts.planned === 0;

  const q = query.trim();
  const listingRef = useMemo(() => parseListingRef(q), [q]);
  const isUrl = !listingRef && /^(https?:\/\/|www\.)\S+$/i.test(q);
  const isLong = !listingRef && !isUrl && q.length >= 40;
  const kind: OmniKind = !q ? "empty" : listingRef ? "ref" : isUrl ? "url" : isLong ? "long" : "word";
  const isWord = kind === "word";

  const filtered = useMemo(() => {
    if (!isWord) return null;
    const lq = q.toLowerCase();
    const scored = CROSSBORDER_TOOLS.map((t) => {
      const terms = [t.name, t.short, t.category, ...(TOOL_INTENT_KEYWORDS[t.id] || [])].map((s) => s.toLowerCase());
      const score = terms.reduce((n, term) => n + (term.includes(lq) || lq.includes(term) ? 1 : 0), 0);
      return { t, score };
    }).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.t);
  }, [q, isWord]);

  const wbHits = useMemo(() => {
    if (!isWord) return [];
    const lq = q.toLowerCase();
    return WORKBENCHES.filter((w) => [w.name, w.short].some((s) => s.toLowerCase().includes(lq)));
  }, [q, isWord]);

  const wikiHits = useMemo(() => {
    if (!isWord || q.length < 2) return [];
    const lq = q.toLowerCase();
    const hits: WikiEntry[] = [];
    for (const g of WIKI_GROUPS) {
      for (const e of g.entries) {
        if ([e.term, e.en ?? "", e.one].some((s) => s.toLowerCase().includes(lq))) hits.push(e);
      }
    }
    return hits.slice(0, 4);
  }, [q, isWord]);

  function fileFromRef() {
    if (!listingRef) return;
    createProductFromRef(listingRef);
    window.location.href = "/crossborder/tools/profit-calculator/";
  }

  /** 执行框内内容 —— 按钮与 Enter 都走这里。 */
  function runOmni() {
    if (kind === "ref") fileFromRef();
    else if (kind === "url") { if (AI_ENABLED) setAiSeed(""); }        // 链接不当正文,走抽屉的读取行自动开抓
    else if (kind === "long") { if (AI_ENABLED) setAiSeed(q); }
    else if (kind === "word") {
      const first = filtered?.[0] ?? null;
      if (first) window.location.href = `/crossborder/tools/${first.slug}`;
    }
  }

  const BTN: Record<OmniKind, { label: string; cls: string; disabled?: boolean }> = {
    empty: { label: "搜索", cls: "is-idle", disabled: true },
    word: { label: "搜索", cls: "is-go" },
    ref: { label: "建档 →", cls: "is-go" },
    url: { label: AI_ENABLED ? "读取网页 →" : "读取 · 即将上线", cls: "is-go", disabled: !AI_ENABLED },
    long: { label: AI_ENABLED ? "AI 分流 →" : "AI 分流 · 即将上线", cls: "is-ai", disabled: !AI_ENABLED },
  };
  const btn = BTN[kind];

  // 框下一行:识别说明(ref/url/long)或截图入口(常驻)
  const hint = kind === "ref" && listingRef
    ? <>识别为{MARKET_LABEL[listingRef.marketplace] ?? "亚马逊"}商品 <b>{listingRef.asin}</b> · 建档并开始测算</>
    : kind === "url"
      ? <>识别为网页链接 —— 读取公开页面里的商品信息(平台页面除外)</>
      : kind === "long"
        ? <>像是整段资料 —— AI 分好该用哪个工具,参数带原文填入,识别后先请你核对</>
        : null;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />

      <section className="cb-hero">
        <HeroBubbles />
        <div className="cb-brand">虾米跨境<em>XIAMI CROSS-BORDER</em></div>
        {/* 鼠标经过时逐字起伏「活」一下(#hover) */}
        <h1 className="cb-h1-wave" aria-label="把一个商品的账,算清楚。">
          {[..."把一个商品的账,"].map((c, i) => <span key={i} style={{ ["--i" as string]: i }}>{c}</span>)}
          <b>{[..."算清楚。"].map((c, i) => <span key={i} style={{ ["--i" as string]: i + 8 }}>{c}</span>)}</b>
        </h1>
        <div className="tool-omni">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runOmni(); }}
            placeholder="搜工具 / 贴商品链接、ASIN / 贴整段报价…"
            aria-label="搜索工具,或贴入商品链接、ASIN、整段资料"
          />
          <button type="button" className={`omni-run ${btn.cls}`} onClick={runOmni} disabled={btn.disabled}>
            {kind === "long" && <Sparkles size={14} />}{btn.label}
          </button>
        </div>
        {/* 只在识别到链接/整段资料时显示提示行 */}
        {hint && <div className="omni-under"><span className="omni-hint-line">{hint}</span></div>}

        {/* 搜索框下、收藏商品卡上:截图上传在前,流程条在后(过稿要求)*/}
        <div className="cb-flow" aria-label="每个工具怎么用">
          <button type="button" className="cb-flow-shot" onClick={() => AI_ENABLED && setAiSeed("")} disabled={!AI_ENABLED}>
            <ImagePlus size={12} /> 有截图 / 表格?上传交给 AI 读取 →
          </button>
          <span className="cb-flow-div" aria-hidden="true" />
          <span className="cb-fs"><b>料</b> 贴报价 / 截图</span><span className="cb-ar">→</span>
          <span className="cb-fs"><b>AI 读取</b> 带原文</span><span className="cb-ar">→</span>
          <span className="cb-fs"><b>你确认</b> 未确认不进</span><span className="cb-ar">→</span>
          <span className="cb-fs"><b>固定公式算</b> 可核对</span>
        </div>

        <ContinueStrip />
        <RecentStrip />
      </section>

      {filtered ? (
        <section className="cb-section">
          <div className="cb-section-head"><h2>搜索结果</h2><small>{filtered.length + wbHits.length} 个 · 名词 {wikiHits.length} 条</small></div>
          {filtered.length + wbHits.length > 0 ? (
            <div className="tc-grid">
              {filtered.map((t) => <ToolCard key={t.id} tool={t} />)}
              {wbHits.map((w) => <WorkbenchCard key={w.id} wb={w} />)}
            </div>
          ) : (
            <p className="cb-empty">没有匹配的工具{wikiHits.length ? ",但基础名词里有:" : ",换个关键词试试。也可以直接贴商品链接或整段报价。"}</p>
          )}
          {wikiHits.length > 0 && (
            <div className="omni-wiki">
              {wikiHits.map((e) => (
                <a key={e.slug} href={`/crossborder/wiki/#${e.slug}`}>
                  <BookOpen size={13} /><b>{e.term}</b><span>{e.one}</span>
                </a>
              ))}
            </div>
          )}
          {/* 深度研究进搜索结果:把搜索词直接接到付费入口(过稿要求) */}
          {query.trim().length >= 2 && (
            <a className="res-research-row" href={`/crossborder/research/product-insight/?q=${encodeURIComponent(query.trim())}`}>
              <span className="rrr-ic"><Telescope size={16} /></span>
              <div className="rrr-body">
                <b>把「{query.trim().slice(0, 16)}」做成一份深度调研</b>
                <span>口碑与需求洞察 · 联网找真实评论 · 结论可追溯到来源 · 消耗 AI 积分</span>
              </div>
              <span className="rrr-go">开始 →</span>
            </a>
          )}
        </section>
      ) : (
        <div className="cb-board">
          {/* 左栏:工具卡保持原状(不瘦身)——过稿要求 */}
          <main className="cb-main">
            <section className="cb-section">
              <div className="cb-section-head">
                <h2>计算工具</h2>
                <small>{CROSSBORDER_TOOLS.length} 个 · 填表即算,同一商品档案处处复用</small>
              </div>
              <div className="tc-grid">
                <AssessCard />
                {CROSSBORDER_TOOLS.map((t) => <ToolCard key={t.id} tool={t} />)}
              </div>
            </section>

            <section className="cb-section">
              <div className="cb-section-head">
                <h2>工作台</h2>
                <small>{WORKBENCHES.length} 个 · 一个商品项目走完整流程</small>
              </div>
              <div className="tc-grid">{WORKBENCHES.map((w) => <WorkbenchCard key={w.id} wb={w} />)}</div>
            </section>

            <p className="cb-tally">
              {allLive
                ? "不注册也能用 · 登录后商品档案云端同步"
                : `已上线 ${counts.available} · 建设中 ${counts.building} · 规划中 ${counts.planned}`}
            </p>
          </main>

          {/* 右栏:深度研究(主推,去"主推"字样)+ 出海动态(紧凑)+ 跨境基础 */}
          <aside className="cb-rail">
            <ResearchRail />
            <ExtensionRail />
            <NewsRail />
            <BasicsRail />
          </aside>
        </div>
      )}

      {aiSeed !== null && <RouterModal initialText={aiSeed} initialUrl={kind === "url" ? q : undefined} onClose={() => setAiSeed(null)} />}

      <SiteFooter />
    </main>
  );
}
