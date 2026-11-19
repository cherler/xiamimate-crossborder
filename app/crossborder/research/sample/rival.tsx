"use client";
import { SiteLink } from "../../../site-link";


/**
 * 竞品对比样例报告(静态写死)—— ?type=rival 时展示。
 *
 * 版式标准与口碑洞察样例完全对齐(2026-07-19 评审):左目录右正文、章节编号、
 * 每章可折叠证据说明(正式报告此处展开真实来源链接)、内容饱满不敷衍。
 * 差异矩阵、定位图经 report/charts.tsx 真实组件渲染;刻意留空格演示可比性防护。
 * 数据为演示编写;来源附录不放假链接。
 */

import { AlertTriangle, ArrowLeft, GitCompare, Info } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import type { ReportFindings } from "../../../../lib/crossborder/research/types";
import { DiffMatrix, PositionMap } from "../report/charts";

const TEAL = "#0c9488";
const NEG = "#b45309";
const mk = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

const META = [
  { k: "我方商品", v: "挂脖风扇" },
  { k: "对比竞品", v: "Torras Coolify · JISULIFE" },
  { k: "市场", v: "美国 · Amazon 为主" },
  { k: "研究档次", v: "竞品对比" },
  { k: "研究目标", v: "新品进入验证" },
  { k: "有效来源", v: "60" },
  { k: "证据覆盖", v: "中等" },
];

const VERDICTS = [
  { tag: "我方相对优势", text: "性价比与低档静音口碑领先 —— 价格带更友好,日常佩戴噪音抱怨更少。", n: 9 },
  { tag: "最大短板", text: "半导体制冷体验弱于 Torras:「贴脖即凉」的传播力我方拿不到。", n: 7, neg: true },
  { tag: "最可争夺", text: "长发安全 + 中价位:两家竞品都未同时做好,是清晰的夺单空缺。", n: 6 },
  { tag: "最大不确定", text: "无销量与真实成交价,定位为公开口碑归纳,不代表市场份额。", n: 0, dim: true },
];

const TOC = [
  { id: "subjects", t: "1 商品与主体清单" },
  { id: "coverage", t: "2 数据覆盖与对比可信度" },
  { id: "matrix", t: "3 差异矩阵(核心)" },
  { id: "profiles", t: "4 各主体口碑侧写" },
  { id: "whychosen", t: "5 用户选择原因与决策因子" },
  { id: "position", t: "6 竞品定位与夺单机会" },
  { id: "actions", t: "7 行动建议" },
  { id: "sources", t: "8 证据与来源附录" },
];

const DIFF: NonNullable<ReportFindings["diffMatrix"]> = {
  subjects: ["挂脖风扇", "Torras Coolify", "JISULIFE"],
  dimensions: ["续航", "噪音", "制冷体验", "佩戴舒适", "性价比"],
  coverage: { "挂脖风扇": 21, "Torras Coolify": 20, "JISULIFE": 19 },
  cells: [
    { subject: "挂脖风扇", dimension: "续航", verdict: "mid", note: "各档续航中规中矩", ids: mk(4) },
    { subject: "挂脖风扇", dimension: "噪音", verdict: "adv", note: "低档静音口碑好", ids: mk(6) },
    { subject: "挂脖风扇", dimension: "佩戴舒适", verdict: "mid", ids: mk(3) },
    { subject: "挂脖风扇", dimension: "性价比", verdict: "adv", note: "价格带友好", ids: mk(7) },
    { subject: "Torras Coolify", dimension: "续航", verdict: "weak", note: "制冷款续航偏短", ids: mk(5) },
    { subject: "Torras Coolify", dimension: "制冷体验", verdict: "adv", note: "半导体贴脖即凉,传播力强", ids: mk(8) },
    { subject: "Torras Coolify", dimension: "性价比", verdict: "weak", note: "价格显著更高", ids: mk(4) },
    { subject: "JISULIFE", dimension: "续航", verdict: "adv", note: "大容量续航是卖点", ids: mk(6) },
    { subject: "JISULIFE", dimension: "噪音", verdict: "mid", ids: mk(3) },
    // 刻意留空:Torras×噪音/佩戴、JISULIFE×制冷/佩戴/性价比 —— 公开资料不足,不脑补
  ],
  insufficient: null,
};

const RIVAL_MAP: NonNullable<ReportFindings["rivalMap"]> = {
  x: "价格", y: "静音与安全",
  reason: "噪音与卷发安全是本品类公开讨论的两大分水岭",
  points: [
    { label: "挂脖风扇(我方)", x: "low", y: "mid", note: "价格友好、低档静音", ids: mk(6) },
    { label: "Torras Coolify", x: "high", y: "mid", note: "贵、制冷强但噪音一般", ids: mk(5) },
    { label: "JISULIFE", x: "mid", y: "low", note: "续航好但高档噪音被抱怨", ids: mk(4) },
  ],
};

const PROFILES = [
  { name: "挂脖风扇(我方)", good: "性价比、低档静音", bad: "制冷体验平平", quote: "「白天办公开低档基本听不见,这个价位没什么可挑的」", cov: 21 },
  { name: "Torras Coolify", good: "半导体制冷、外观", bad: "贵、续航短", quote: "「贴脖那一下是真凉,但开制冷俩小时就没电了」", cov: 20 },
  { name: "JISULIFE", good: "续航、价格平衡", bad: "高档噪音", quote: "「续航确实顶,可是开到三档像迷你吹风机」", cov: 19 },
];

const FACTORS = [
  { f: "制冷体感", w: 3, note: "「真凉」是 Torras 用户复购与传播的第一动因,评测视频传播力最强" },
  { f: "续航", w: 3, note: "通勤与户外场景的硬门槛,JISULIFE 以此立足;虚标是差评引爆点" },
  { f: "价格", w: 2, note: "价格敏感用户在我方与 JISULIFE 之间摇摆,Torras 溢价靠制冷支撑" },
  { f: "噪音", w: 2, note: "办公场景决定性,低档静音是我方被明确点名的优势" },
  { f: "头发安全", w: 1, note: "长发用户的一票否决项 —— 三家都未把防护做成明确卖点" },
];

const WHY = [
  { text: "买 Torras 的用户多冲着「制冷片贴脖」的差异化体验 —— 评测视频里「开机三秒变凉」的画面是决策临门一脚;但复购评论里「续航焦虑」同样高频,说明体验优势建立在续航妥协上。", n: 5 },
  { text: "买 JISULIFE 的多看重续航与价格平衡 —— 「一次充电用一周」出现在多条好评首句;选它的用户往往明确对比过 Torras 的价格后回头。", n: 4 },
  { text: "选择我方的用户复述最多的是「便宜又安静」—— 但没有一条评论把我方当成「制冷设备」,说明品类心智仍是「风扇」,与 Torras 不在同一决策框内。", n: 6 },
];

const ACTIONS = [
  { stage: "① 立即确认", items: ["实测三家同场景噪音分贝与续航,拿到可对比数字", "确认我方护发网罩的成本与结构可行性"] },
  { stage: "② 打差异", items: ["主打「长发安全 + 中价位静音」空缺位,不与 Torras 拼制冷", "Listing 首图直接给「低档噪音对比」场景"] },
  { stage: "③ 防守", items: ["续航按档位如实标注,不给 JISULIFE 用户留虚标话柄", "FAQ 预答「和制冷款怎么选」,承认差异引导场景"] },
  { stage: "④ 监测", items: ["盯 Torras 续航差评走势 —— 它的短板恶化就是我方窗口", "每月复扫一次本对比,矩阵变化即市场信号"] },
];

const SOURCES = [
  { type: "媒体评测", name: "科技媒体挂脖风扇三款横评(样例)", time: "2026-05", rel: "中高", backs: "续航、噪音、制冷对比" },
  { type: "社区讨论", name: "Reddit 通勤装备版讨论串(样例)", time: "2026-04", rel: "中", backs: "用户选择原因、价格权衡" },
  { type: "视频评测", name: "YouTube 三款对比实测与置顶评论(样例)", time: "2026-06", rel: "中", backs: "制冷体感、佩戴舒适" },
  { type: "问答", name: "商品问答区高赞问题汇总(样例)", time: "2025-09 起", rel: "中", backs: "头发安全、续航焦虑" },
  { type: "官方资料", name: "各品牌规格页与说明书(样例)", time: "2025-12", rel: "高", backs: "参数口径、宣称对齐" },
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
        反向证据指与该结论方向相反的公开讨论 —— 保留它们,结论才可信。
      </p>
    </details>
  );
}

function Pips({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="rcs-pips">
      {[1, 2, 3].map((i) => <i key={i} className={i <= level ? "" : "off"} />)}
    </span>
  );
}

export function RivalSample() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rr-page">
        <SiteLink className="tool-breadcrumb" href="/"><ArrowLeft size={13} /> 深度研究</SiteLink>

        <div className="rr-sample-banner">
          <Info size={15} />
          <span><b>这是一份竞品对比样例</b> —— 数据为演示编写。正式报告的结构、差异矩阵与证据标注方式与此完全一致。</span>
        </div>

        <div className="rr-cat-toggle" role="tablist" aria-label="样例类型">
          <SiteLink role="tab" href="/crossborder/research/sample/">口碑与需求洞察</SiteLink>
          <button role="tab" aria-selected className="on">商品与竞品对比</button>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=full">商品综合研究</SiteLink>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=tiktok">TikTok Shop 平台</SiteLink>
          <span>竞品对比是横向多主体对齐 —— 定性口碑与定位差异,不是参数横评或实时比价</span>
        </div>

        <header className="rr-head">
          <h1><GitCompare size={22} strokeWidth={1.8} style={{ verticalAlign: "-4px", marginRight: 8, color: TEAL }} />挂脖风扇 @ 亚马逊美国</h1>
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
            <section id="subjects">
              <h2>1 商品与主体清单</h2>
              <p>
                本报告横向对比<b>我方挂脖风扇</b>与两个公开讨论度最高的竞品:<b>Torras Coolify</b>(半导体制冷款,
                品类高端心智占位者)与 <b>JISULIFE</b>(大容量续航款,价格平衡型走量代表)。选择这两家是因为
                公开讨论里用户做购买决策时,反复在这三类形态之间权衡 —— 对比它们即是对比三条产品路线。
              </p>
              <div className="rr-assume">
                <AlertTriangle size={14} />
                <span><b>口径</b>:定性优劣为样本内公开口碑归纳,非参数横评;不含实时价格与销量;矩阵第一行为我方。</span>
              </div>
            </section>

            <section id="coverage">
              <h2>2 数据覆盖与对比可信度</h2>
              <p>
                三个主体分别独立检索,共获得 <b>60 个有效公开来源</b>(我方 21 / Torras 20 / JISULIFE 19)——
                覆盖均衡,矩阵的横向对比具备可比性;若某主体来源显著偏少,该主体会被降级标注「资料有限」,
                不进入强判断。
              </p>
              <div className="rr-limits">
                <b>对比报告特别要说清的限制:</b>
                <ul>
                  <li>公开资料对头部品牌覆盖天然更好 —— <b>矩阵中的空格代表「资料不足」,不代表「无差异」</b>,我们不为凑满矩阵而脑补。</li>
                  <li>三家均无销量、退货率、真实成交价数据,「性价比」维度基于公开标价与口碑归纳。</li>
                  <li>测评内容可能含商业合作,来源附录已分类标注,合作内容不作为优劣判断的独立依据。</li>
                </ul>
              </div>
              <EvidenceLine support={12} against={0} level="中高" />
            </section>

            <section id="matrix">
              <h2>3 差异矩阵(核心)</h2>
              <DiffMatrix diff={DIFF} />
              <p>
                读法:我方的两个「优」(噪音、性价比)与 Torras 的「制冷体验·优」错位而非正面冲突 ——
                说明这不是同质化混战,而是三条差异化路线各守阵地。真正的信号在空格与「劣」:
                Torras 的续航与性价比双「劣」是它的结构性代价,不是运营失误。
              </p>
              <EvidenceLine support={10} against={2} level="中高" />
            </section>

            <section id="profiles">
              <h2>4 各主体口碑侧写</h2>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>主体</th><th>口碑重心</th><th>公开短板</th><th>代表性反馈</th><th>有效来源</th></tr></thead>
                  <tbody>
                    {PROFILES.map((p) => (
                      <tr key={p.name}><td><b>{p.name}</b></td><td>{p.good}</td><td>{p.bad}</td><td>{p.quote}</td><td>{p.cov}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rc-note">代表性反馈为样本内典型表述的概括;正式报告可展开每条的原始出处。</p>
              <EvidenceLine support={9} against={1} level="中" />
            </section>

            <section id="whychosen">
              <h2>5 用户选择原因与决策因子</h2>
              <p>先看用户在三家之间做决策时,哪些因子真正起作用(按样本内讨论热度定性排序):</p>
              <div className="rcs-ranks" style={{ marginBottom: 14 }}>
                {FACTORS.map((f) => (
                  <div key={f.f}><b>{f.f}</b><Pips level={f.w as 1 | 2 | 3} /><small>{f.note}</small></div>
                ))}
              </div>
              <p>再看各家用户「为什么最终选了它」的公开表述归纳:</p>
              <ul>
                {WHY.map((w, i) => (
                  <li key={i}>{w.text}<small style={{ color: "#8a95a1" }}> · {w.n} 来源</small></li>
                ))}
              </ul>
              <EvidenceLine support={8} against={1} level="中高" />
            </section>

            <section id="position">
              <h2>6 竞品定位与夺单机会</h2>
              <PositionMap rivalMap={RIVAL_MAP} />
              <p>
                定位图与矩阵互相印证:三家没有任何一家同时占据「安全安静」与「中价位」——
                <b>长发安全 + 中价位静音</b>是清晰的空缺位。夺单路径不是正面进攻 Torras 的制冷心智
                (那需要供应链级投入),而是把我方已被用户点名的「便宜又安静」升级成明确卖点,
                再补上三家都没做的护发防护,承接「长发用户的一票否决」。
              </p>
              <EvidenceLine support={7} against={2} level="中" />
            </section>

            <section id="actions">
              <h2>7 行动建议</h2>
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
              <h2>8 证据与来源附录</h2>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>类型</th><th>来源</th><th>时间</th><th>可靠度</th><th>支持的对比</th></tr></thead>
                  <tbody>
                    {SOURCES.map((s) => (
                      <tr key={s.name}><td>{s.type}</td><td>{s.name}</td><td>{s.time}</td><td>{s.rel}</td><td>{s.backs}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rr-tabnote">样例节选 5 条,不含真实链接。正式报告含全部 60 条来源、逐主体证据分布与「原始/转载/商业合作」性质标注。</p>
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
