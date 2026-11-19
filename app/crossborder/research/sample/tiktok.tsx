"use client";
import { SiteLink } from "../../../site-link";


/**
 * TikTok Shop 平台样例报告(静态写死)—— ?type=tiktok 时展示。
 *
 * 这一档专门展示「平台数据接入」这个能力:公开网络 + 第三方接口真实商品评价
 * 双来源;评分分布来自平台评价;来源附录把「平台评价(第三方接口)」单独分组,
 * 并明写「已去除评价者个人身份、剔除被激励评论」—— 与 P1 的合规实现一致。
 * 图表经 report/charts.tsx 真实组件渲染;数据为演示编写(网红保温随行杯)。
 */

import { ArrowLeft, Info, ShieldCheck, Sparkles } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import type { ReportFindings, ReportTheme } from "../../../../lib/crossborder/research/types";
import { CoverageBars, DivergingThemes, MotivationBars, PriorityMatrix } from "../report/charts";

const TEAL = "#0c9488";
const NEG = "#b45309";
const mk = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

const META = [
  { k: "研究对象", v: "网红保温随行杯(商品方向)" },
  { k: "平台", v: "TikTok Shop 美国" },
  { k: "研究档次", v: "需求洞察" },
  { k: "研究目标", v: "新品进入验证" },
  { k: "有效来源", v: "64(公开 18 + 平台评价 46)" },
  { k: "证据覆盖", v: "中高" },
];

const VERDICTS = [
  { tag: "用户最重视", text: "颜值出片 + 保温 + 大容量 —— 达人开箱带火后,「密封不漏」成了复购与差评的分水岭。", n: 14 },
  { tag: "最大问题", text: "吸管/盖子漏水 + 掉漆是平台评价里最高频的负面,退货多因「晒图好看、用起来漏」。", n: 11, neg: true },
  { tag: "最值得做", text: "车杯架适配 + 强密封 + 高颜值配色 的中价位款,是平台真实评价反复点名的空缺。", n: 7 },
  { tag: "最大不确定", text: "平台评价为接口采样、非全量;病毒式爆款的早期评分易被上市初期热度拉高。", n: 0, dim: true },
];

const TOC = [
  { id: "scope", t: "1 商品与平台范围" },
  { id: "coverage", t: "2 数据覆盖(双来源)" },
  { id: "demand", t: "3 用户需求与购买动机" },
  { id: "voice", t: "4 正面口碑与负面问题" },
  { id: "rating", t: "5 平台评分分布(平台数据)" },
  { id: "actions", t: "6 行动优先级" },
  { id: "sources", t: "7 证据与来源附录" },
];

const findings: ReportFindings = {
  demand: {
    motivations: [
      { text: "颜值出片晒单", ids: mk(13) },
      { text: "大容量少续杯", ids: mk(9) },
      { text: "保温持久", ids: mk(7) },
    ],
    decisionAttrs: ["密封防漏", "保温", "容量", "颜值配色", "车杯架适配"],
  },
  voice: {
    negatives: [
      { theme: "吸管/盖漏水", freq: "high", impact: "high", ids: mk(11) },
      { theme: "掉漆脱涂层", freq: "high", impact: "mid", ids: mk(8) },
      { theme: "胶圈异味", freq: "mid", impact: "mid", ids: mk(6) },
      { theme: "偏重不便携", freq: "mid", impact: "low", ids: mk(4) },
      { theme: "吸管缩水开裂", freq: "low", impact: "mid", ids: mk(3) },
    ],
  },
};

const THEMES: ReportTheme[] = [
  { theme: "颜值出片", sentiment: "positive", ids: mk(13) },
  { theme: "保温强", sentiment: "positive", ids: mk(9) },
  { theme: "容量大", sentiment: "positive", ids: mk(7) },
  { theme: "配色多", sentiment: "positive", ids: mk(5) },
  { theme: "吸管漏水", sentiment: "negative", ids: mk(11) },
  { theme: "掉漆", sentiment: "negative", ids: mk(8) },
  { theme: "胶圈异味", sentiment: "negative", ids: mk(6) },
  { theme: "偏重", sentiment: "negative", ids: mk(4) },
];

const COVERAGE = { platform: 46, media: 6, forum: 5, video: 4, qa: 3 } as const;

// 平台评价评分分布(采样 46 条)—— 平台数据专属可视化
const RATING = [
  { star: 5, n: 28 }, { star: 4, n: 8 }, { star: 3, n: 4 }, { star: 2, n: 2 }, { star: 1, n: 4 },
];
const RATING_TOTAL = RATING.reduce((a, r) => a + r.n, 0);

const ACTIONS = [
  { stage: "① 立即确认", items: ["实测密封防漏(倒置/摇晃)与吸管结构,拿到可宣称的防漏说法", "核对掉漆/涂层工艺,这是平台差评第二高频"] },
  { stage: "② 开发前验证", items: ["车杯架直径适配实测(平台评价高频诉求)", "胶圈材质换测,消除异味投诉"] },
  { stage: "③ 上线前优化", items: ["Listing 首图给「倒置不漏」实拍,承接达人晒单流量", "配色 SKU 对齐 TikTok 当季审美,颜值是第一动因"] },
  { stage: "④ 上线后监测", items: ["平台评价按「漏水/掉漆/异味」归类,盯早期差评拐点", "每月复扫,病毒式爆款口碑衰减快,及时接住"] },
];

const SRC_PUBLIC = [
  { type: "媒体评测", name: "科技媒体保温杯横评(样例)", time: "2026-05", rel: "中高", backs: "保温、密封对比" },
  { type: "社区讨论", name: "Reddit r/BuyItForLife 讨论串(样例)", time: "2026-04", rel: "中", backs: "漏水、掉漆抱怨" },
  { type: "视频评测", name: "YouTube 倒置防漏实测(样例)", time: "2026-06", rel: "中", backs: "密封结构" },
  { type: "问答", name: "商品问答区高赞(样例)", time: "2026-03 起", rel: "中", backs: "车杯架适配" },
];

const SRC_PLATFORM = [
  { q: "颜值绝了,但用两周吸管开始漏水,晒图一流用起来糟心", star: 3, verified: true },
  { q: "保温是真的顶,冰水放一整天还有冰;就是有点重", star: 4, verified: true },
  { q: "边角磕一下就掉漆,露出里面的塑料,质感打折", star: 2, verified: true },
  { q: "新的时候胶圈一股味儿,泡了两天才散", star: 3, verified: true },
];

function Dots({ n, neg }: { n: number; neg?: boolean }) {
  if (!n) return <>局限说明,不设证据数</>;
  return (
    <span className="rc-dots" title={`${n} 个来源`}>
      {Array.from({ length: Math.min(n, 14) }).map((_, i) => <i key={i} style={{ background: neg ? NEG : TEAL }} />)}
      <small>{n} 来源</small>
    </span>
  );
}

/** 可折叠证据说明(正式报告此处展开真实来源链接)。 */
function EvidenceLine({ support, against, level }: { support: number; against: number; level: string }) {
  return (
    <details className="rr-evidence">
      <summary>
        证据链
        <span className="rr-ev-chips">
          <i className="rr-ev-chip">{support} 来源</i>
          {against > 0 && <i className="rr-ev-chip is-against">反向 {against}</i>}
          <i className="rr-ev-chip is-level">等级 {level}</i>
        </span>
      </summary>
      <p>
        正式报告中,这里可展开每条来源的链接、发布时间与可靠度评级;样例不含真实链接。
        平台评价来自第三方接口,已去除评价者个人身份、剔除被激励评论,仅保留评论文本、评分与时间。
      </p>
    </details>
  );
}

/** 平台评分分布条(采样内计数)。 */
function RatingDist() {
  const max = Math.max(...RATING.map((r) => r.n));
  return (
    <div className="tk-rating">
      {RATING.map((r) => {
        const good = r.star >= 4;
        return (
          <div key={r.star} className="tk-rating-row">
            <span className="tk-rating-star">{r.star}★</span>
            <div className="tk-rating-track">
              <i style={{ width: `${(r.n / max) * 100}%`, background: good ? TEAL : NEG, opacity: good ? 1 : 0.8 }} />
            </div>
            <b>{r.n}</b>
          </div>
        );
      })}
    </div>
  );
}

export function TikTokSample() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rr-page">
        <SiteLink className="tool-breadcrumb" href="/"><ArrowLeft size={13} /> 深度研究</SiteLink>

        <div className="rr-sample-banner">
          <Info size={15} />
          <span><b>这是一份 TikTok Shop 平台样例</b> —— 展示公开网络 + <b>真实平台评价</b>双来源。数据为演示编写,正式报告结构与证据标注方式与此一致。</span>
        </div>

        <div className="rr-cat-toggle" role="tablist" aria-label="样例类型">
          <SiteLink role="tab" href="/crossborder/research/sample/">口碑与需求洞察</SiteLink>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=rival">商品与竞品对比</SiteLink>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=full">商品综合研究</SiteLink>
          <button role="tab" aria-selected className="on">TikTok Shop 平台</button>
          <span>选 TikTok Shop 时,除公开网络外会接入平台真实评价(第三方接口,已去个人身份)</span>
        </div>

        <header className="rr-head">
          <h1><Sparkles size={22} strokeWidth={1.8} style={{ verticalAlign: "-4px", marginRight: 8, color: TEAL }} />网红保温随行杯 @ TikTok Shop 美国</h1>
          <div className="rr-meta">
            {META.map((m) => <div key={m.k}><span>{m.k}</span><b>{m.v}</b></div>)}
          </div>
        </header>




        <div className="rr-verdicts">
          {VERDICTS.map((v) => (
            <div key={v.tag} className={`rr-verdict${v.neg ? " is-neg" : ""}`}
              style={v.dim ? { borderLeftColor: "#8a95a1" } : undefined}>
              <em style={v.dim ? { color: "#8a95a1" } : undefined}>{v.tag}</em>
              <p>{v.text}</p>
              <span><Dots n={v.n} neg={v.neg} /></span>
            </div>
          ))}
        </div>

        <div className="rr-body">
          <nav className="rr-toc" aria-label="报告目录">
            {TOC.map((t) => <SiteLink key={t.id} href={`#${t.id}`}>{t.t}</SiteLink>)}
          </nav>

          <article className="rr-article">
            <section id="scope">
              <h2>1 商品与平台范围</h2>
              <p>
                本报告研究「网红保温随行杯」在 <b>TikTok Shop 美国</b> 的商品方向。TikTok Shop 的口碑画像与
                亚马逊不同 —— 更偏<b>达人开箱与病毒式晒单</b>驱动,爆款起量快、口碑衰减也快。本次除公开网络外,
                <b>接入了平台真实商品评价</b>作为独立来源(见第 2、5、7 章)。
              </p>
              <div className="rr-assume">
                <ShieldCheck size={14} />
                <span><b>合规口径</b>:平台评价经第三方接口获取,<b>已去除评价者个人身份</b>(不含姓名/ID/头像)、<b>剔除被激励评论</b>,仅保留评论文本、评分与时间;报告只做去标识的聚合洞察。</span>
              </div>
            </section>

            <section id="coverage">
              <h2>2 数据覆盖(双来源)</h2>
              <div className="rcs-cov">
                <div>
                  <div className="rcs-hero"><b>64</b><span>有效来源<br />公开网络 18 + 平台评价 46</span></div>
                  <div className="rcs-miss"><em>未获得:</em><i>完整评论库</i><i>销量与退货数据</i><i>达人带货 GMV</i></div>
                </div>
                <CoverageBars counts={COVERAGE} />
              </div>
              <div className="rr-limits">
                <b>本报告做不到的事(先说清,再看结论):</b>
                <ul>
                  <li>平台评价是接口<b>采样、非全量</b> —— 负面主题的真实占比不可外推;病毒式爆款早期评分偏高。</li>
                  <li>公开网络对 TikTok 覆盖天然弱(内容多在 App 内),泛网络证据以媒体/社区为主。</li>
                  <li>无销量、退货率与达人带货数据 —— 不对市场规模与投产比做任何测算。</li>
                </ul>
              </div>
              <EvidenceLine support={13} against={0} level="中高" />
            </section>

            <section id="demand">
              <h2>3 用户需求与购买动机</h2>
              <MotivationBars demand={findings.demand} />
              <p>
                证据细节:「颜值出片晒单」是 TikTok Shop 场景的第一动因 —— 与亚马逊「实用优先」的画像明显不同,
                这里<b>先被视觉种草、再看功能</b>。但「大容量」与「保温」紧随其后,说明颜值是入口、留存靠功能。
              </p>
              <EvidenceLine support={14} against={1} level="中高" />
            </section>

            <section id="voice">
              <h2>4 正面口碑与负面问题</h2>
              <DivergingThemes themes={THEMES} />
              <PriorityMatrix negatives={findings.voice?.negatives} />
              <p>
                证据细节:「吸管/盖漏水」的 11 条里多数来自<b>平台真实评价</b>(见评分分布中的低星段)——
                这类「晒图好看、用起来漏」的落差,正是达人驱动品类最典型的退货引信;「掉漆」紧随其后,是工艺硬伤。
              </p>
              <EvidenceLine support={11} against={2} level="中高" />
            </section>

            <section id="rating">
              <h2>5 平台评分分布(平台数据)</h2>
              <div className="tk-rating-card">
                <div className="tk-rating-head"><b>TikTok Shop 平台评价 · 采样 {RATING_TOTAL} 条</b><span>已去评价者身份 · 剔除被激励评论</span></div>
                <RatingDist />
              </div>
              <p>
                读法:5★ 占多数(达人带火的爆款早期评分偏高),但 <b>1–2★ 合计 {RATING[3].n + RATING[4].n} 条</b>集中指向
                「漏水 / 掉漆」——低星评价的<b>负面主题一致性</b>比星级本身更有信息量。样例展示分布形态,正式报告
                会把每条低星评价的文本归入对应负面主题。
              </p>
              <EvidenceLine support={RATING_TOTAL} against={RATING[3].n + RATING[4].n} level="中高" />
            </section>

            <section id="actions">
              <h2>6 行动优先级</h2>
              <div className="rr-actions">
                {ACTIONS.map((a) => (
                  <div key={a.stage} className="rr-action">
                    <b>{a.stage}</b>
                    <ul>{a.items.map((it) => <li key={it}>{it}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>

            <section id="sources">
              <h2>7 证据与来源附录</h2>
              <h3>公开网络来源</h3>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>类型</th><th>来源</th><th>时间</th><th>可靠度</th><th>支持的结论</th></tr></thead>
                  <tbody>
                    {SRC_PUBLIC.map((s) => (
                      <tr key={s.name}><td>{s.type}</td><td>{s.name}</td><td>{s.time}</td><td>{s.rel}</td><td>{s.backs}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 style={{ marginTop: 18 }}>平台评价(第三方接口)<span className="tk-src-badge"><ShieldCheck size={12} /> 已去个人身份</span></h3>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>来源渠道</th><th>代表性评价(去标识)</th><th>评分</th><th>性质</th></tr></thead>
                  <tbody>
                    {SRC_PLATFORM.map((s, i) => (
                      <tr key={i}><td>TikTok Shop 平台评价</td><td>「{s.q}」</td><td>{s.star}★</td><td>{s.verified ? "已验证购买" : "未验证"}</td></tr>
                    ))}
                    <tr><td>TikTok Shop 平台评价</td><td>…… 其余 {46 - SRC_PLATFORM.length} 条同样已去个人身份、仅保留文本/评分/时间</td><td>—</td><td>采样合计 46</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="rr-tabnote">平台评价经第三方接口(如 TikHub)采样获取,<b>已去除评价者姓名/ID/头像,剔除被激励评论</b>;非官方、非全量,可能有缺漏与时延。样例节选,不含真实链接。</p>
            </section>
          </article>
        </div>

        <div className="rr-sample-cta">
          <p>准备好自己的评论 CSV 后，可到评论工作台进行本地统计与对比。</p>
          <SiteLink href="/crossborder/workbench/voice-insight/">分析自己的评论 →</SiteLink>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
