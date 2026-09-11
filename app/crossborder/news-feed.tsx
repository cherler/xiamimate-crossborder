"use client";

/**
 * 出海新闻 feed(#69)。
 *
 * 数据来自后端 /v1/news:每日一轮(惰性刷新,后台跑),来源为公开报道,
 * 抓取范围由 ai-service news-scan 的查询白名单限定(平台规则/税费关税/
 * 物流/大促营销/合规/市场)。这里只陈列:日期 + 分类 + 标题(直达原文)+
 * 一句话摘要;AI 筛选可能有误,口径写在栏目脚注里。
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Newspaper } from "lucide-react";
import { apiUrl, AUTH_ENABLED } from "../../lib/api";

type NewsItem = {
  title: string; url: string; source: string | null;
  category: string | null; summary: string | null; publishedAt: string | null;
  /** 入库时批量翻好的中文;为空说明本来就是中文,或这条没把握翻 —— 那就显示原文 */
  titleZh?: string | null; summaryZh?: string | null;
};

const CAT_TONE: Record<string, string> = {
  平台规则: "rule", 税费关税: "tax", 物流: "ship", 大促营销: "promo", 合规: "law", 市场: "mkt",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewsFeed() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  /**
   * 纵向慢滚:把列表多复制几份接在后面,滚过一份就瞬间跳回去,视觉上首尾无缝。
   * 用 rAF 手推 scrollTop 而不是 CSS 动画 —— 悬停能立刻停在当前位置,
   * 而不是跳回关键帧。
   *
   * **复制几份必须按实际高度算,不能写死两份。**
   * 回卷的前提是「一份列表的高度」这个位置滚得到,即
   *   一份高度 <= scrollHeight - 可视高度 = (份数-1)×一份高度 - ... 
   * 化简后就是 (份数-1)×一份高度 >= 可视高度。
   *
   * 原来写死两份,等价于要求「一份列表比可视区高」。新闻只有三条时一份约 220px、
   * 而容器高 268px —— scrollTop 最多到 172,永远够不到 220 的回卷线,
   * 于是滚到底就卡死不动了(线上就是这个状态)。
   */
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    if (!items?.length) return;
    const el = track.current;
    if (!el) return;

    const measure = () => {
      const first = el.querySelector<HTMLElement>(".nf-list");
      const unit = first?.offsetHeight ?? 0;
      if (unit <= 0) return;
      // (份数-1) × 一份 >= 可视高度,再多留一份余量,滚起来不会贴着边界
      const need = Math.max(2, Math.ceil(el.clientHeight / unit) + 1);
      setCopies((c) => (c === need ? c : need));
    };
    measure();

    // 窗口变化、字体加载完都会改高度 —— 不重新量就会退回卡死
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, copies]);

  useEffect(() => {
    if (!items?.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      if (!paused.current) {
        el.scrollTop += 0.36;                       // 约每秒 22px,读得完一行
        const unit = el.querySelector<HTMLElement>(".nf-list")?.offsetHeight ?? 0;
        // 够不到回卷线就别滚 —— 滚过去只会停在底部装死,不如原地不动
        if (unit > 0 && unit <= el.scrollHeight - el.clientHeight) {
          if (el.scrollTop >= unit) el.scrollTop -= unit;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items, copies]);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let alive = true;
    fetch(apiUrl("/v1/news"))
      .then((r) => r.json())
      .then((d) => { if (alive) { setItems(d.items || []); setRefreshing(!!d.refreshing); } })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (!AUTH_ENABLED || items === null) return null;

  return (
    <section className="cb-section">
      <div className="cb-section-head">
        <h2>出海动态</h2>
        <small>每日自动整理 · 英文已译中 · 悬停暂停{refreshing ? " · 今日一轮整理中…" : ""}</small>
      </div>
      {items.length === 0 ? (
        <p className="cb-empty">今日新闻整理中,稍后回来看看。</p>
      ) : (
        <div className="nf-scroll" ref={track}
          onPointerEnter={() => { paused.current = true; }}
          onPointerLeave={() => { paused.current = false; }}
          onFocusCapture={() => { paused.current = true; }}
          onBlurCapture={() => { paused.current = false; }}>
          {/* 复制几份接在后面做无缝循环;副本对读屏隐藏,免得同一条被读好几遍 */}
          {Array.from({ length: copies }, (_, dup) => (
            <div className="nf-list" key={dup} aria-hidden={dup > 0 || undefined}>
              {items.map((n) => (
                <a key={`${dup}-${n.url}`} className="nf-row" href={n.url}
                  target="_blank" rel="noreferrer noopener" tabIndex={dup > 0 ? -1 : undefined}>
                  <span className="nf-date">{fmtDate(n.publishedAt) || "近日"}</span>
                  {n.category && <span className={`nf-cat is-${CAT_TONE[n.category] ?? "mkt"}`}>{n.category}</span>}
                  <span className="nf-body">
                    <b>{n.titleZh || n.title}</b>
                    {(n.summaryZh || n.summary) && <span>{n.summaryZh || n.summary}</span>}
                  </span>
                  <span className="nf-src">{n.source || ""} <ExternalLink size={11} /></span>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="nf-note">
        <Newspaper size={12} /> 共 {items.length} 条 · 英文标题由 AI 译为中文(专有名词保留原文,译不准的显示原文) ·
        来源为公开报道,由 AI 按「平台规则 / 税费关税 / 物流 / 大促营销 / 合规 / 市场」筛选,可能有误 ——
        点开以原文为准;政策类信息请以监管机构与平台后台为准。
      </p>
    </section>
  );
}
