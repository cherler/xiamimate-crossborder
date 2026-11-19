"use client";
import { SiteLink } from "../../../site-link";


/**
 * 综合研究样例报告(静态写死)—— ?type=full 时展示。
 *
 * 定位:综合研究 = 需求洞察的深度 + 竞品对比的差异矩阵,一次研究完 + 顶部一页
 * 决策摘要。刻意做得比另两档样例更丰富:10 个编号章节,同时含 MotivationBars /
 * DivergingThemes / PriorityMatrix / ClaimGap(洞察侧)与 DiffMatrix / 竞品侧写 /
 * 决策因子 / PositionMap(竞品侧)—— 别的样例只占其中一半。
 * 结论分层:决策摘要说结论,各证据章只做证据展开。图表经 report/charts.tsx 真实
 * 组件渲染;数据为演示编写(筋膜枪 vs Theragun / Hypervolt),来源附录不放假链接。
 */

import { useState } from "react";
import { AlertTriangle, ArrowLeft, Info, Microscope } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import type { ReportFindings, ReportTheme } from "../../../../lib/crossborder/research/types";
import {
  ClaimGap, CoverageBars, DiffMatrix, DivergingThemes, MotivationBars, PositionMap, PriorityMatrix,
} from "../report/charts";

const TEAL = "#0c9488";
const NEG = "#b45309";
const mk = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

const META = [
  { k: "研究对象", v: "筋膜枪(商品方向)" },
  { k: "对比竞品", v: "Theragun Prime · Hypervolt 2" },
  { k: "市场", v: "美国 · Amazon 为主" },
  { k: "研究档次", v: "综合研究" },
  { k: "研究目标", v: "新品进入验证" },
  { k: "有效来源", v: "51" },
  { k: "证据覆盖", v: "较好" },
];

const VERDICTS = [
  { tag: "用户最重视", text: "力度是否「打得透」(失速力/振幅)+ 静音,其次续航与握持 —— 深层力度是复购与口碑分水岭。", n: 13 },
  { tag: "最大问题", text: "失速力虚标 + 高档噪音,叠加「治疗/替代理疗」医疗宣称的 FDA 合规风险。", n: 10, neg: true },
  { tag: "最值得做", text: "「接近 Theragun 力度 + 更低噪音 + 中价 + 完整认证」是横评与用户反复点名的空缺位。", n: 7 },
  { tag: "最大不确定", text: "无销量与退货数据,力度虚标真实占比不可验证;两强 App 生态黏性难量化。", n: 0, dim: true },
];

const TOC = [
  { id: "scope", t: "1 商品与主体范围" },
  { id: "coverage", t: "2 数据覆盖与可信度" },
  { id: "demand", t: "3 用户需求与购买动机" },
  { id: "voice", t: "4 正面口碑与负面问题" },
  { id: "gap", t: "5 期望落差(宣称 vs 实测)" },
  { id: "risk", t: "6 高频问题与品类风险" },
  { id: "matrix", t: "7 竞品差异矩阵(核心)" },
  { id: "profiles", t: "8 竞品侧写与决策因子" },
  { id: "actions", t: "9 行动优先级" },
  { id: "sources", t: "10 证据与来源附录" },
];

const findings: ReportFindings = {
  demand: {
    motivations: [
      { text: "运动后肌肉恢复", ids: mk(12) },
      { text: "久坐肩颈放松", ids: mk(9) },
      { text: "居家替代理疗", ids: mk(6) },
    ],
    decisionAttrs: ["失速力(打得透)", "噪音", "振幅", "续航", "握持与重量"],
  },
  voice: {
    negatives: [
      { theme: "失速力虚标", freq: "high", impact: "high", ids: mk(10) },
      { theme: "高档噪音", freq: "high", impact: "mid", ids: mk(8) },
      { theme: "续航虚标", freq: "mid", impact: "mid", ids: mk(6) },
      { theme: "塑料感做工", freq: "mid", impact: "low", ids: mk(4) },
      { theme: "手柄震手麻", freq: "low", impact: "mid", ids: mk(3) },
      { theme: "App 连接不稳", freq: "low", impact: "low", ids: mk(1) },
    ],
  },
  claimGaps: [
    {
      attr: "失速力", claimedText: "宣称 30kg 失速力", claimedValue: 30,
      observedText: "实测 ≈18kg 顿转", observedValue: 18, unit: "kg",
      note: "重压下顿挫,力度虚标最集中", ids: mk(7),
    },
    {
      attr: "噪音", claimedText: "宣称 ≤45dB", claimedValue: 45,
      observedText: "实测最高档 ≈58dB", observedValue: 58, unit: "dB",
      note: "静音按最低档口径,落差即差评", ids: mk(6),
    },
  ],
  rivalMap: {
    x: "价格", y: "力度与降噪均衡",
    reason: "深层力度(Theragun 标签)与静音(Hypervolt 标签)是本品类两大分水岭",
    points: [
      { label: "白牌走量款", x: "low", y: "low", note: "便宜但力度虚标、噪音大", ids: mk(6) },
      { label: "Theragun", x: "high", y: "mid", note: "力度标杆但贵、高档吵", ids: mk(9) },
      { label: "Hypervolt 2", x: "mid", y: "high", note: "静音标签但深层力度略逊", ids: mk(8) },
    ],
  },
  diffMatrix: {
    subjects: ["我方(中端定位)", "Theragun Prime", "Hypervolt 2"],
    dimensions: ["失速力", "噪音", "续航", "握持舒适", "生态(App/预设)", "性价比"],
    coverage: { "我方(中端定位)": 16, "Theragun Prime": 19, "Hypervolt 2": 16 },
    cells: [
      { subject: "我方(中端定位)", dimension: "失速力", verdict: "mid", note: "接近高端但深层略逊", ids: mk(4) },
      { subject: "我方(中端定位)", dimension: "噪音", verdict: "adv", note: "低档静音口碑好", ids: mk(5) },
      { subject: "我方(中端定位)", dimension: "续航", verdict: "mid", ids: mk(3) },
      { subject: "我方(中端定位)", dimension: "性价比", verdict: "adv", note: "价格带友好", ids: mk(6) },
      { subject: "Theragun Prime", dimension: "失速力", verdict: "adv", note: "深层力度标杆", ids: mk(9) },
      { subject: "Theragun Prime", dimension: "噪音", verdict: "weak", note: "高档偏吵", ids: mk(5) },
      { subject: "Theragun Prime", dimension: "生态(App/预设)", verdict: "adv", note: "App 预设程序成熟", ids: mk(7) },
      { subject: "Theragun Prime", dimension: "性价比", verdict: "weak", note: "价格显著更高", ids: mk(6) },
      { subject: "Hypervolt 2", dimension: "噪音", verdict: "adv", note: "静音是核心标签", ids: mk(8) },
      { subject: "Hypervolt 2", dimension: "失速力", verdict: "mid", note: "够用但深层略逊", ids: mk(5) },
      { subject: "Hypervolt 2", dimension: "生态(App/预设)", verdict: "adv", note: "蓝牙 App 引导", ids: mk(4) },
      // 刻意留空:三家的「握持舒适」多为主观、公开定量资料不足;
      // Theragun/Hypervolt 的「续航」、Hypervolt 的「性价比」公开对照不充分 —— 留空不脑补。
    ],
    insufficient: null,
  },
};

const THEMES: ReportTheme[] = [
  { theme: "打得透深层", sentiment: "positive", ids: mk(12) },
  { theme: "缓解酸痛见效", sentiment: "positive", ids: mk(9) },
  { theme: "便携随身", sentiment: "positive", ids: mk(6) },
  { theme: "低档很安静", sentiment: "positive", ids: mk(5) },
  { theme: "失速力虚标", sentiment: "negative", ids: mk(10) },
  { theme: "高档噪音", sentiment: "negative", ids: mk(8) },
  { theme: "续航虚标", sentiment: "negative", ids: mk(6) },
  { theme: "塑料感做工", sentiment: "negative", ids: mk(4) },
];

const COVERAGE = { media: 14, video: 12, forum: 11, official: 8, qa: 6 } as const;

const PROFILES = [
  { name: "我方(中端定位)", good: "力度接近高端、低档静音、价优", bad: "生态弱、品牌认知低", quote: "「这个价位能有这个力度已经惊喜,就是没那么多花哨程序」", cov: 16 },
  { name: "Theragun Prime", good: "深层力度标杆、App 生态成熟", bad: "价格高、高档偏吵", quote: "「力度确实没得说、能打到深层,但开到高档整个房间都听得见」", cov: 19 },
  { name: "Hypervolt 2", good: "静音、颜值、握持", bad: "深层力度略逊、贵", quote: "「安静到能边看电视边用,可要说打透深层肌肉还是差点意思」", cov: 16 },
];

const FACTORS = [
  { f: "失速力(打得透)", w: 3, note: "「能打到深层」是 Theragun 复购与口碑第一动因,也是白牌差评重灾区" },
  { f: "噪音", w: 3, note: "久坐办公与居家场景决定性,Hypervolt 以「静音」立足并成传播点" },
  { f: "价格", w: 2, note: "中端用户在我方与两强之间反复权衡,溢价必须靠力度/静音支撑" },
  { f: "续航", w: 2, note: "便携与随身场景的硬门槛,续航虚标是差评引爆点" },
  { f: "生态(App/预设)", w: 1, note: "进阶用户看重引导程序与预设强度,是两强的软性黏性" },
];

const WHY = [
  { text: "选 Theragun 的用户多冲着「打得透」的深层力度 —— 评测里「重压不顿转」的失速力测试是决策临门一脚;但复购评论里「高档太吵」同样高频,力度优势伴随噪音代价。", n: 6 },
  { text: "选 Hypervolt 的多看重「安静」与握持手感 —— 「能边看电视边用」出现在多条好评首句;这类用户往往先被 Theragun 的噪音劝退后回头。", n: 5 },
  { text: "选中端/我方定位的用户复述最多的是「这个价位力度够用又安静」—— 但几乎没人提 App 或预设程序,说明生态是被牺牲掉的一环,也是两强的护城河所在。", n: 6 },
];

const RISKS = [
  { t: "FDA 医疗功效宣称", d: "不得宣称「治疗/治愈/替代理疗」;多个卖家因 medical claims 收到警告信,Listing 话术是硬合规项,不是文案偏好问题。", sev: "hi" },
  { t: "失速力虚标", d: "重压下顿挫/停转是差评最集中引爆点;宣称的失速力(kg)必须有实测支撑,否则退货与差评双杀。", sev: "hi" },
  { t: "锂电池运输与安全", d: "航空携带与运输申报是硬门槛;过热保护、充电安全需在设计阶段解决,虚标容量会放大投诉。", sev: "md" },
  { t: "使用伤害提示", d: "力度过大致淤青、骨突与颈动脉部位禁用 —— 缺少明确使用提示易引发安全投诉与平台下架风险。", sev: "md" },
];

const ACTIONS = [
  { stage: "① 立即确认", items: ["实测失速力(kg)/各档噪音(dB)/续航,拿到可宣称的数字", "核对 Listing 话术,去掉一切「治疗/替代理疗」医疗宣称"] },
  { stage: "② 开发前验证", items: ["降噪结构与失速力兼顾的电机方案(别只堆振幅数字)", "握持配重与长时间使用的震手反馈测试"] },
  { stage: "③ 上线前优化", items: ["Listing 按档位标注实测噪音与失速力,不给虚标话柄", "补 App 或预设强度程序,对标两强的软性黏性", "FAQ 预答「和 Theragun / Hypervolt 怎么选」"] },
  { stage: "④ 上线后监测", items: ["评论按「力度/噪音/续航/做工」四主题归类", "盯两强差评走势 —— Theragun 噪音、Hypervolt 深层力度,即我方夺单窗口"] },
];

const SOURCES = [
  { type: "媒体评测", name: "Wirecutter 按摩枪年度横评(样例)", time: "2026-05", rel: "高", backs: "力度/静音需求、竞品定位" },
  { type: "视频评测", name: "RTINGS / Project Farm 噪音与失速力实测(样例)", time: "2026-06", rel: "中高", backs: "期望落差、失速力虚标" },
  { type: "社区讨论", name: "Reddit r/homegym 恢复装备讨论串(样例)", time: "2026-04", rel: "中", backs: "购买动机、选择原因" },
  { type: "监管", name: "FDA warning letters(医疗宣称,样例)", time: "2026-03", rel: "高", backs: "宣称合规风险" },
  { type: "官方资料", name: "Therabody / Hyperice 规格页与说明书(样例)", time: "2025-12", rel: "高", backs: "参数口径、认证宣称" },
  { type: "问答", name: "商品问答区高赞问题汇总(样例)", time: "2025-10 起", rel: "中", backs: "续航焦虑、力度疑问" },
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

function Pips({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="rcs-pips">
      {[1, 2, 3].map((i) => <i key={i} className={i <= level ? "" : "off"} />)}
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

export function FullSample() {
  const [ds, setDs] = useState(true);
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rr-page">
        <SiteLink className="tool-breadcrumb" href="/crossborder/research/"><ArrowLeft size={13} /> 深度研究</SiteLink>

        <div className="rr-sample-banner">
          <Info size={15} />
          <span><b>这是一份综合研究样例</b> —— 需求 + 口碑 + 期望落差 + 风险 + 竞品差异矩阵一次研究完。数据为演示编写,正式报告结构与证据标注方式与此完全一致。</span>
        </div>

        <div className="rr-cat-toggle" role="tablist" aria-label="样例类型">
          <SiteLink role="tab" href="/crossborder/research/sample/">口碑与需求洞察</SiteLink>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=rival">商品与竞品对比</SiteLink>
          <button role="tab" aria-selected className="on">商品综合研究</button>
          <SiteLink role="tab" href="/crossborder/research/sample/?type=tiktok">TikTok Shop 平台</SiteLink>
          <span>最全的一档:洞察的深度 + 竞品对比的差异矩阵,顶部一页决策摘要拍板</span>
        </div>

        <header className="rr-head">
          <h1><Microscope size={22} strokeWidth={1.8} style={{ verticalAlign: "-4px", marginRight: 8, color: TEAL }} />筋膜枪 @ 亚马逊美国</h1>
          <div className="rr-meta">
            {META.map((m) => <div key={m.k}><span>{m.k}</span><b>{m.v}</b></div>)}
          </div>
        </header>




        {/* 一页决策摘要:置顶承载全部结论(不入目录,与正式报告一致);下方各章只做证据展开 */}
        <div className="rr-decision">
          <div className="rr-decision-head">
            <b>一页决策摘要</b>
            <button className="rr-decision-toggle" onClick={() => setDs((v) => !v)}>{ds ? "收起" : "展开"}</button>
          </div>
          <div className="rr-verdicts" style={{ marginTop: 0 }}>
            {VERDICTS.map((v) => (
              <div key={v.tag} className={`rr-verdict${v.neg ? " is-neg" : ""}`}
                style={v.dim ? { borderLeftColor: "#8a95a1" } : undefined}>
                <em style={v.dim ? { color: "#8a95a1" } : undefined}>{v.tag}</em>
                <p>{v.text}</p>
                <span><Dots n={v.n} neg={v.neg} /></span>
              </div>
            ))}
          </div>
          {ds && (
            <div className="rr-decision-body">
              <p><b>品类定位</b>:冲击式按摩枪属于健身恢复 / 久坐肩颈 / 居家理疗品类,价格从入门白牌到 Theragun、Hypervolt 高端;媒体横评体系成熟,公开讨论充分,可比性好。</p>
              <p><b>机会方向(公开证据指向的空缺位)</b>:深层力度是 Theragun 的护城河、静音是 Hypervolt 的标签 —— 二者中间「接近高端力度 + 更低噪音 + 中价 + 完整认证」是被横评与用户共同点名的清晰空缺(见第 7 章差异矩阵)。</p>
              <p><b>主要风险</b>:FDA 对「治疗/替代理疗」宣称的执法;失速力虚标是差评引爆点;锂电池运输与力度过大致伤的安全提示缺失 —— 宣称口径本身就是本品类最大经营风险。</p>
              <p><b>关键权衡与方向性倾向</b>(不替你下「能不能做」的终判):</p>
              <ul>
                <li><b className="rr-dt改">改</b> — 产品力往「提升失速力 + 降噪」走,别只堆振幅数字(依据:失速力/噪音双高频负面 + 差异矩阵)。</li>
                <li><b className="rr-dt留">留</b> — 定价守中端,避开与白牌拼低价(依据:中端用户价格敏感但认力度)。</li>
                <li><b className="rr-dt改">改</b> — 宣传去掉一切「治疗/替代理疗」医疗话术(依据:FDA 警告信 + 合规红线)。</li>
                <li><b className="rr-dt改">改</b> — 补 App / 预设强度程序,对标两强黏性(依据:生态是我方唯一「劣」向)。</li>
                <li><b className="rr-dt去">去</b> — 放弃无认证白牌走量款(依据:力度虚标 + 安全风险双杀)。</li>
              </ul>
              <p className="rc-note">本报告延续「只核对、不下终判」原则:以上是<b>公开证据指向的空缺位与风险</b>,不是「该不该做」的结论 —— 我们没有你的成本、毛利与供应链数据,这个判断只能由你来下。要收敛判断,还需要 ASIN 级销量与失速力实测。</p>
            </div>
          )}
        </div>

        <div className="rr-body">
          <nav className="rr-toc" aria-label="报告目录">
            {TOC.map((t) => <SiteLink key={t.id} href={`#${t.id}`}>{t.t}</SiteLink>)}
          </nav>

          <article className="rr-article">
            <section id="scope">
              <h2>1 商品与主体范围</h2>
              <p>
                本报告研究「筋膜枪」<b>商品方向</b>(冲击式按摩枪),并把两个公开讨论度最高的竞品纳入对比:
                <b>Theragun Prime</b>(Therabody,深层力度心智占位者)与 <b>Hypervolt 2</b>(Hyperice,静音标签代表)。
                综合研究覆盖需求、口碑、期望落差、品类风险与竞品格局<b>五束</b>证据,各束独立采集后汇总 ——
                结论都收敛在顶部决策摘要,以下各章只做证据展开。
              </p>
              <div className="rr-assume">
                <AlertTriangle size={14} />
                <span><b>系统假设</b>:目标市场 Amazon 美国站;时间范围近 24 个月。本次提供了 2 个竞品,故第 7 章为逐主体<b>差异矩阵</b>(而非轻量格局);矩阵第一行为我方定位。</span>
              </div>
            </section>

            <section id="coverage">
              <h2>2 数据覆盖与可信度</h2>
              <div className="rcs-cov">
                <div>
                  <div className="rcs-hero"><b>51</b><span>有效公开来源<br />我方 16 / Theragun 19 / Hypervolt 16</span></div>
                  <div className="rcs-miss"><em>未获得:</em><i>完整 Amazon 评论库</i><i>销量与退货数据</i><i>广告数据</i></div>
                </div>
                <CoverageBars counts={COVERAGE} />
              </div>
              <div className="rr-limits">
                <b>本报告做不到的事(先说清,再看结论):</b>
                <ul>
                  <li>综合研究是五束证据的<b>广度</b>覆盖 —— 单束深度不及专项研究;负面主题的真实占比无法验证。</li>
                  <li>差异矩阵里的<b>空格代表「资料不足」,不代表「无差异」</b> —— 不为凑满矩阵而脑补。</li>
                  <li>无销量、退货率与广告数据 —— 不对市场规模与投入产出做任何测算。</li>
                </ul>
              </div>
              <EvidenceLine support={13} against={0} level="较好" />
            </section>

            <section id="demand">
              <h2>3 用户需求与购买动机</h2>
              <MotivationBars demand={findings.demand} />
              <p>
                证据细节:「运动后肌肉恢复」是购买第一动因(健身、跑步、力量训练场景反复出现);
                值得注意的是「久坐肩颈放松」以 9 个来源坐上第二位 —— 说明用户群已从运动人群外溢到
                办公人群,这也是「静音」成为高权重决策属性的根因(办公场景不能吵)。
              </p>
              <EvidenceLine support={13} against={1} level="较好" />
            </section>

            <section id="voice">
              <h2>4 正面口碑与负面问题</h2>
              <DivergingThemes themes={THEMES} />
              <PriorityMatrix negatives={findings.voice?.negatives} />
              <p>
                证据细节:「失速力虚标」的 10 个来源里有 7 个出现「重压就顿转/停机」类实测描述 ——
                差评的引信是<b>标称力度与实际堵转</b>的落差(见下一章期望落差);「高档噪音」8 个来源里
                多条把它和 Theragun 直接对比,说明噪音已是可被竞品化的口碑战场。
              </p>
              <EvidenceLine support={10} against={2} level="较好" />
            </section>

            <section id="gap">
              <h2>5 期望落差(宣称 vs 实测)</h2>
              <ClaimGap gaps={findings.claimGaps} />
              <p>
                证据细节:两处落差都不是「造假」那么简单 —— 失速力的 30kg 是<b>空载堵转口径</b>、
                用户按「重压使用」理解;噪音的 45dB 是<b>最低档口径</b>、用户按「最高档」感知。
                口径差本身就能制造差评,改 Listing 的标注口径比改硬件便宜得多。两端数值均有实测出处。
              </p>
              <EvidenceLine support={7} against={1} level="中高" />
            </section>

            <section id="risk">
              <h2>6 高频问题与品类风险</h2>
              <div className="rr-risks">
                {RISKS.map((r) => (
                  <div key={r.t} className="rr-risk"><b><i className={`rcs-sev is-${r.sev}`} />{r.t}</b><span>{r.d}</span></div>
                ))}
              </div>
              <p className="rc-note" style={{ marginTop: 10 }}>品类维度:电子电器 + 个人健康器械(力度/噪音/续航/认证/医疗宣称)。FDA 警告与召回信息来自公开监管公告,证据等级高。</p>
              <EvidenceLine support={8} against={0} level="高" />
            </section>

            <section id="matrix">
              <h2>7 竞品差异矩阵(核心)</h2>
              <DiffMatrix diff={findings.diffMatrix} />
              <PositionMap rivalMap={findings.rivalMap} />
              <p>
                读法:我方的两个「优」(噪音、性价比)与 Theragun 的「失速力·优」错位而非正面冲突 ——
                这不是同质化混战,而是三条路线各守阵地。信号在空格与「劣」:Theragun 的噪音与性价比双
                「劣」是它高端定位的结构性代价;定位图印证 —— 没有任何一家同时占住「力度够 + 够静 + 中价」,
                这就是清晰的夺单空缺位。
              </p>
              <EvidenceLine support={11} against={2} level="较好" />
            </section>

            <section id="profiles">
              <h2>8 竞品侧写与决策因子</h2>
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
              <p style={{ marginTop: 12 }}>用户在三家之间做决策时,哪些因子真正起作用(按样本内讨论热度定性排序):</p>
              <div className="rcs-ranks" style={{ marginBottom: 14 }}>
                {FACTORS.map((f) => (
                  <div key={f.f}><b>{f.f}</b><Pips level={f.w as 1 | 2 | 3} /><small>{f.note}</small></div>
                ))}
              </div>
              <p>各家用户「为什么最终选了它」的公开表述归纳:</p>
              <ul>
                {WHY.map((w, i) => (
                  <li key={i}>{w.text}<small style={{ color: "#8a95a1" }}> · {w.n} 来源</small></li>
                ))}
              </ul>
              <EvidenceLine support={9} against={1} level="中高" />
            </section>

            <section id="actions">
              <h2>9 行动优先级</h2>
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
              <h2>10 证据与来源附录</h2>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>类型</th><th>来源</th><th>时间</th><th>可靠度</th><th>支持的结论</th></tr></thead>
                  <tbody>
                    {SOURCES.map((s) => (
                      <tr key={s.name}><td>{s.type}</td><td>{s.name}</td><td>{s.time}</td><td>{s.rel}</td><td>{s.backs}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rr-tabnote">样例节选 6 条,不含真实链接。正式报告含全部 51 条来源、逐主体证据分布、逐结论证据绑定与「原始/转载/商业合作」性质标注。</p>
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
