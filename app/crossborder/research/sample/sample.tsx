"use client";

/**
 * 样例报告(静态写死)—— P1:品类切换(电子/家居)+ 改用真实图表组件。
 *
 * 样例即活规范:图表全部经 report/charts.tsx 的真实组件渲染,数据形状与
 * report_json 一致 —— 正式报告长什么样,这里就长什么样。
 * 品类切换只改变三样:风险维度、专属图(电子哑铃图)、定位图的轴 ——
 * 其余骨架与图表语言完全一致,这本身就是「品类不换版式,换槽位」的产品承诺。
 * 数据为演示编写;来源附录不放假链接。
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import { RivalSample } from "./rival";
import { FullSample } from "./full";
import { TikTokSample } from "./tiktok";
import { SampleLifecycle, SampleRescan } from "./sample-ops";
import type { ReportFindings, ReportTheme } from "../../../../lib/crossborder/research/types";
import {
  ClaimGap, CoverageBars, DivergingThemes, MotivationBars, PositionMap, PriorityMatrix,
} from "../report/charts";

const TEAL = "#0c9488";
const NEG = "#b45309";

/** 演示证据 id 组:图表只读长度与计数。 */
const mk = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

type CatKey = "electronics" | "home";

type SampleData = {
  product: string;
  market: string;                  // 标题用的干净市场名(商品 @ 市场)
  meta: Array<{ k: string; v: string }>;
  verdicts: Array<{ tag: string; text: string; n: number; neg?: boolean; dim?: boolean }>;
  scopeText: string;
  coverage: Partial<Record<string, number>>;
  totalSources: number;
  timeband: number[];              // 五个半年的来源数(时间分布条)
  miss: string[];
  themes: ReportTheme[];
  findings: ReportFindings;
  ranks: Array<{ label: string; level: 1 | 2 | 3; word: string }>;
  scenes: string[];
  gapNote: string;
  risks: Array<{ t: string; d: string; sev: "hi" | "md" }>;
  riskFoot: string;
  rivalRows: Array<{ t: string; good: string; bad: string; chance: string }>;
  actions: Array<{ stage: string; items: string[] }>;
  sources: Array<{ type: string; name: string; time: string; rel: string; backs: string }>;
};

const ELectronics: SampleData = {
  product: "挂脖风扇",
  market: "亚马逊美国",
  meta: [
    { k: "研究对象", v: "挂脖风扇(商品方向)" },
    { k: "市场", v: "美国 · Amazon 为主" },
    { k: "研究档次", v: "需求洞察" },
    { k: "研究目标", v: "新品进入验证" },
    { k: "有效来源", v: "37" },
    { k: "研究截止", v: "2026-07-18" },
    { k: "品类", v: "电子电器" },
  ],
  verdicts: [
    { tag: "用户最重视", text: "安静与佩戴舒适 —— 噪音与颈部压力才是差评分水岭,不是「风大」。", n: 12 },
    { tag: "最大问题", text: "续航虚标感知:高档位实测远低于宣传口径,负面讨论的最高频主题。", n: 9, neg: true },
    { tag: "最值得做", text: "长发卷入防护 + 低档静音:两者同时做好的产品仍是公开讨论中的空缺。", n: 6 },
    { tag: "最大不确定", text: "无完整平台评论库,负面主题的真实占比无法验证;季节性需求缺数据。", n: 0, dim: true },
  ],
  scopeText: "本报告研究的是「挂脖风扇」商品方向(Neck Fan),而非某个具体 ASIN。手持、夹式与桌面风扇已排除;半导体制冷挂脖设备因讨论高度重叠,纳入范围。",
  coverage: { video: 10, media: 9, forum: 8, official: 6, news: 4 },
  totalSources: 37,
  timeband: [4, 6, 8, 11, 8],
  miss: ["完整 Amazon 评论库", "销量与退货数据", "广告数据"],
  themes: [
    { theme: "解放双手", sentiment: "positive", ids: mk(11) },
    { theme: "即时降温体验", sentiment: "positive", ids: mk(8) },
    { theme: "轻便随身", sentiment: "positive", ids: mk(6) },
    { theme: "续航与宣传不符", sentiment: "negative", ids: mk(9) },
    { theme: "高档位噪音", sentiment: "negative", ids: mk(8) },
    { theme: "长发卷入", sentiment: "negative", ids: mk(6) },
    { theme: "出风衰减", sentiment: "negative", ids: mk(5) },
    { theme: "充电接口松动", sentiment: "negative", ids: mk(2) },
  ],
  findings: {
    demand: {
      motivations: [
        { text: "解放双手", ids: mk(11) },
        { text: "即时降温", ids: mk(8) },
        { text: "轻便随身", ids: mk(6) },
      ],
      decisionAttrs: ["续航(按档位)", "噪音", "重量", "头发安全", "出风方式"],
    },
    voice: {
      negatives: [
        { theme: "续航虚标", freq: "high", impact: "high", ids: mk(9) },
        { theme: "高档噪音", freq: "high", impact: "mid", ids: mk(8) },
        { theme: "长发卷入", freq: "mid", impact: "high", ids: mk(6) },
        { theme: "出风衰减", freq: "mid", impact: "mid", ids: mk(5) },
        { theme: "接口松动", freq: "low", impact: "mid", ids: mk(1) },
      ],
    },
    claimGaps: [{
      attr: "续航", claimedText: "宣传 8h(最低档口径)", claimedValue: 8,
      observedText: "实测 ≈3h(最高档)", observedValue: 3, unit: "h",
      note: "同一个数字,两种档位口径 —— 落差即差评", ids: mk(7),
    }],
    rivalMap: {
      x: "价格", y: "静音与安全",
      reason: "噪音与卷发安全是本品类公开讨论的两大分水岭",
      points: [
        { label: "经典叶片款", x: "low", y: "low", note: "价格低、噪音与卷发是公开缺陷", ids: mk(6) },
        { label: "无叶环形款", x: "high", y: "high", note: "安全安静但贵,「风感弱」质疑常见", ids: mk(5) },
        { label: "半导体制冷款", x: "mid", y: "mid", note: "传播力强,重量/续航/发热抱怨集中", ids: mk(4) },
      ],
    },
  },
  ranks: [
    { label: "续航(按档位)", level: 3, word: "高" },
    { label: "噪音", level: 3, word: "高" },
    { label: "重量", level: 2, word: "中" },
    { label: "头发安全", level: 2, word: "中" },
    { label: "出风方式", level: 1, word: "较低" },
  ],
  scenes: ["通勤", "户外作业", "厨房", "运动观赛", "术后与更年期人群"],
  gapNote: "不少「续航差评」并非电池不合格,而是宣传用最低档续航、用户按最高档理解 —— 改 Listing 口径比改电池便宜得多。",
  risks: [
    { t: "头发卷入安全", d: "有公开媒体讨论与用户抱怨;无防护网罩的外露叶片风险最高。", sev: "hi" },
    { t: "电池与出行限制", d: "锂电池涉航空携带与运输申报;容量虚标会放大投诉。", sev: "hi" },
    { t: "认证宣称", d: "FCC/UL/CE 标注须与证书一致;「静音 25dB」等需实测支撑。", sev: "md" },
    { t: "发热与低温烫伤", d: "半导体制冷款贴肤温控被问答区反复追问,需要温度数据。", sev: "md" },
  ],
  riskFoot: "品类维度:电子电器(续航/噪音/发热/认证/安全)。本次未检索到召回或监管处罚记录 —— 外部舆情章节省略,不注水。",
  rivalRows: [
    { t: "经典叶片", good: "价格低、风量直接", bad: "噪音 / 卷发", chance: "静音电机+护发网罩" },
    { t: "无叶环形", good: "安全、外观", bad: "风感弱、贵", chance: "风感实测对比" },
    { t: "半导体制冷", good: "「贴脖即凉」传播力", bad: "重、续航、发热", chance: "350g 内+温度曲线" },
  ],
  actions: [
    { stage: "① 立即确认", items: ["实测各档续航与噪音,对齐宣称口径", "电池规格与运输合规文件"] },
    { stage: "② 开发前验证", items: ["长发用户试戴(卷入防护)", "目标克重与半小时佩戴压力"] },
    { stage: "③ 上线前优化", items: ["Listing 按档位标注实测续航", "FAQ 预答噪音/头发/航空三问"] },
    { stage: "④ 上线后监测", items: ["评论按「续航/噪音/头发」归类", "退货原因收集,验证问题排序"] },
  ],
  sources: [
    { type: "媒体评测", name: "科技媒体夏季随身风扇横评(样例)", time: "2026-05", rel: "中高", backs: "噪音、续航、竞品对比" },
    { type: "社区讨论", name: "Reddit 通勤装备版块讨论串(样例)", time: "2026-04", rel: "中", backs: "购买动机、噪音抱怨" },
    { type: "视频评测", name: "YouTube 实测视频与置顶评论(样例)", time: "2026-06", rel: "中", backs: "续航实测、佩戴舒适度" },
    { type: "官方资料", name: "头部品牌规格页与说明书(样例)", time: "2025-11", rel: "高", backs: "参数口径、认证宣称" },
  ],
};

const HOME: SampleData = {
  product: "免安装折叠鞋架",
  market: "亚马逊美国",
  meta: [
    { k: "研究对象", v: "免安装折叠鞋架(商品方向)" },
    { k: "市场", v: "美国 · Amazon 为主" },
    { k: "研究档次", v: "需求洞察" },
    { k: "研究目标", v: "新品进入验证" },
    { k: "有效来源", v: "31" },
    { k: "研究截止", v: "2026-07-18" },
    { k: "品类", v: "家居家具" },
  ],
  verdicts: [
    { tag: "用户最重视", text: "稳固不晃 + 免工具安装 —— 「好装」和「装完不晃」是购买评价的分水岭。", n: 10 },
    { tag: "最大问题", text: "层板承重与变形:鞋放多即塌、层板下弯,是负面讨论的最高频主题。", n: 8, neg: true },
    { tag: "最值得做", text: "金属加固 + 可调层高的中价位免工具款,公开讨论中仍是供给空缺。", n: 5 },
    { tag: "最大不确定", text: "无退货率数据,承重投诉的真实占比不可验证;运输破损率缺数据。", n: 0, dim: true },
  ],
  scopeText: "本报告研究的是「免安装折叠鞋架」商品方向(No-assembly Shoe Rack),含卡扣式与折叠式;需螺丝组装的传统层架已排除。",
  coverage: { media: 8, forum: 7, video: 6, official: 6, news: 4 },
  totalSources: 31,
  timeband: [3, 5, 7, 9, 7],
  miss: ["完整 Amazon 评论库", "退货率数据", "运输破损统计"],
  themes: [
    { theme: "免工具安装快", sentiment: "positive", ids: mk(8) },
    { theme: "不占地易收纳", sentiment: "positive", ids: mk(6) },
    { theme: "性价比", sentiment: "positive", ids: mk(5) },
    { theme: "承重不足变形", sentiment: "negative", ids: mk(8) },
    { theme: "晃动不稳", sentiment: "negative", ids: mk(6) },
    { theme: "板材异味", sentiment: "negative", ids: mk(4) },
    { theme: "尺寸与描述不符", sentiment: "negative", ids: mk(3) },
  ],
  findings: {
    demand: {
      motivations: [
        { text: "玄关收纳", ids: mk(9) },
        { text: "租房免打孔", ids: mk(7) },
        { text: "搬家易拆装", ids: mk(5) },
      ],
      decisionAttrs: ["承重", "安装难度", "尺寸适配", "稳固性", "外观"],
    },
    voice: {
      negatives: [
        { theme: "承重变形", freq: "high", impact: "high", ids: mk(8) },
        { theme: "晃动不稳", freq: "mid", impact: "high", ids: mk(6) },
        { theme: "板材异味", freq: "mid", impact: "mid", ids: mk(4) },
        { theme: "五金件缺失", freq: "low", impact: "mid", ids: mk(1) },
      ],
    },
    // 家居品类无 claim_gap 槽位 —— 品类差异的直观展示。
    claimGaps: [],
    rivalMap: {
      x: "价格", y: "安装易度",
      reason: "免工具安装是本品类购买决策的第一分水岭",
      points: [
        { label: "金属螺接款", x: "low", y: "low", note: "便宜结实,但要拧几十颗螺丝", ids: mk(5) },
        { label: "塑料卡扣款", x: "mid", y: "high", note: "免工具,但承重与异味被集中抱怨", ids: mk(6) },
        { label: "实木成品款", x: "high", y: "high", note: "免安装高颜值,价格与运费翻倍", ids: mk(4) },
      ],
    },
  },
  ranks: [
    { label: "承重", level: 3, word: "高" },
    { label: "安装难度", level: 3, word: "高" },
    { label: "尺寸适配", level: 2, word: "中" },
    { label: "稳固性", level: 2, word: "中" },
    { label: "外观", level: 1, word: "较低" },
  ],
  scenes: ["玄关", "租房", "宿舍", "衣帽间", "搬家频繁人群"],
  gapNote: "「承重差评」有相当部分是期望落差:详情页按「单层均布 5kg」宣传,用户按「塞满靴子」理解 —— 按鞋型给出容量示例,比换板材便宜得多。",
  risks: [
    { t: "承重与变形", d: "层板下弯、塌陷是最高频结构性抱怨;标称承重需实测支撑。", sev: "hi" },
    { t: "运输破损", d: "板材与卡扣件在长途运输中破损率高,差评集中在开箱环节。", sev: "hi" },
    { t: "板材异味与甲醛担忧", d: "问答区反复追问材质与认证;「无味」宣称需检测报告。", sev: "md" },
    { t: "尺寸适配", d: "美式男鞋偏大,层高与深度不足导致「放不下」差评。", sev: "md" },
  ],
  riskFoot: "品类维度:家居家具(尺寸/安装/稳定性/异味/承重/运输破损)。本次未检索到召回或监管处罚记录 —— 外部舆情章节省略,不注水。",
  rivalRows: [
    { t: "金属螺接款", good: "便宜、结实", bad: "安装劝退", chance: "免工具 + 金属承重" },
    { t: "塑料卡扣款", good: "免工具、轻", bad: "承重 / 异味", chance: "加固层板 + 材质认证" },
    { t: "实木成品款", good: "免安装、颜值", bad: "贵、运费高", chance: "可平板包装的准成品" },
  ],
  actions: [
    { stage: "① 立即确认", items: ["逐层实测承重,对齐宣称口径", "板材检测报告与认证文件"] },
    { stage: "② 开发前验证", items: ["满载晃动测试(靴子/男鞋)", "平板包装跌落与运输测试"] },
    { stage: "③ 上线前优化", items: ["Listing 按鞋型给容量示例", "FAQ 预答承重/异味/尺寸三问"] },
    { stage: "④ 上线后监测", items: ["评论按「承重/晃动/异味」归类", "开箱破损率单独跟踪"] },
  ],
  sources: [
    { type: "媒体评测", name: "家居媒体入门鞋架横评(样例)", time: "2026-04", rel: "中高", backs: "承重、安装、竞品对比" },
    { type: "社区讨论", name: "Reddit 租房收纳版块讨论串(样例)", time: "2026-03", rel: "中", backs: "购买动机、晃动抱怨" },
    { type: "视频评测", name: "YouTube 开箱安装实测(样例)", time: "2026-05", rel: "中", backs: "安装时长、开箱破损" },
    { type: "官方资料", name: "头部品牌详情页与说明书(样例)", time: "2025-12", rel: "高", backs: "承重口径、材质宣称" },
  ],
};

const SAMPLES: Record<CatKey, SampleData> = { electronics: ELectronics, home: HOME };

const TOC = [
  "1 商品与范围确认", "2 数据覆盖与可信度", "3 用户需求与购买动机",
  "4 正面口碑与负面问题", "5 问题优先级与期望落差", "6 高频问题与品类风险",
  "7 竞品方向与机会", "8 行动优先级", "9 证据与来源附录",
];
const TOC_IDS = ["scope", "coverage", "demand", "voice", "matrix", "risk", "rivals", "advice", "sources"];

function Dots({ n, neg }: { n: number; neg?: boolean }) {
  if (!n) return <>局限说明,不设证据数</>;
  return (
    <span className="rc-dots" title={`${n} 个来源`}>
      {Array.from({ length: Math.min(n, 14) }).map((_, i) => <i key={i} style={{ background: neg ? NEG : TEAL }} />)}
      <small>{n} 来源</small>
    </span>
  );
}

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
      <p>正式报告中,这里可展开每条来源的链接、发布时间与可靠度评级;样例不含真实链接。反向证据指与该结论方向相反的公开讨论 —— 保留它们,结论才可信。</p>
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

export function SampleReport() {
  const [cat, setCat] = useState<CatKey>("electronics");
  // 静态导出:?type= 只能客户端读,挂载前当口碑洞察样例渲染(默认),读到 rival 再切。
  const [type, setType] = useState<string>("");
  useEffect(() => {
    setType(new URLSearchParams(window.location.search).get("type") || "");
  }, []);
  const d = SAMPLES[cat];

  if (type === "rival") return <RivalSample />;
  if (type === "full") return <FullSample />;
  if (type === "tiktok") return <TikTokSample />;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rr-page">
        <a className="tool-breadcrumb" href="/crossborder/research/"><ArrowLeft size={13} /> 深度研究</a>

        <div className="rr-sample-banner">
          <Info size={15} />
          <span><b>这是一份样例报告</b> —— 数据为演示编写,不是真实研究结论。你生成的正式报告,结构、图表与证据标注方式与此完全一致。</span>
        </div>

        {/* 样例类型切换:口碑洞察(当前)| 竞品对比 */}
        <div className="rr-cat-toggle" role="tablist" aria-label="样例类型">
          <button role="tab" aria-selected className="on">口碑与需求洞察</button>
          <a role="tab" href="/crossborder/research/sample/?type=rival">商品与竞品对比</a>
          <a role="tab" href="/crossborder/research/sample/?type=full">商品综合研究</a>
          <a role="tab" href="/crossborder/research/sample/?type=tiktok">TikTok Shop 平台</a>
          <span>三种深度研究骨架一致;TikTok Shop 那档额外接入平台真实评价</span>
        </div>

        {/* 品类切换:只改变风险维度、专属图、定位图的轴 —— 骨架完全一致 */}
        <div className="rr-cat-toggle" role="tablist" aria-label="样例品类">
          <button role="tab" aria-selected={cat === "electronics"} className={cat === "electronics" ? "on" : ""} onClick={() => setCat("electronics")}>电子电器 · 挂脖风扇</button>
          <button role="tab" aria-selected={cat === "home"} className={cat === "home" ? "on" : ""} onClick={() => setCat("home")}>家居家具 · 折叠鞋架</button>
          <span>品类只改变:风险维度 · 专属图 · 定位图的轴 —— 骨架与图表语言完全一致</span>
        </div>

        <header className="rr-head">
          <h1>{d.product} @ {d.market}</h1>
          <div className="rr-meta">
            {d.meta.map((m) => <div key={m.k}><span>{m.k}</span><b>{m.v}</b></div>)}
          </div>
        </header>

        <SampleLifecycle />
        <SampleRescan />

        <div className="rr-verdicts">
          {d.verdicts.map((v) => (
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
            {TOC.map((t, i) => <a key={t} href={`#${TOC_IDS[i]}`}>{t}</a>)}
          </nav>

          <article className="rr-article">
            <section id="scope">
              <h2>1 商品与范围确认</h2>
              <p>{d.scopeText}</p>
              <div className="rr-assume">
                <AlertTriangle size={14} />
                <span><b>系统假设</b>:目标市场 Amazon 美国站;时间范围近 24 个月;研究目标为新品进入验证。结论不应外推到其他市场。</span>
              </div>
            </section>

            <section id="coverage">
              <h2>2 数据覆盖与可信度</h2>
              <div className="rcs-cov">
                <div>
                  <div className="rcs-hero"><b>{d.totalSources}</b><span>有效公开来源<br />时间覆盖 2024-07 至 2026-07</span></div>
                  <figure className="rc-fig">
                    <svg viewBox="0 0 440 46" role="img" aria-label="来源发布时间分布">
                      <line x1="8" y1="30" x2="432" y2="30" stroke="#e2e7ea" strokeWidth="2" />
                      <g fill={TEAL}>
                        {d.timeband.map((n, i) => (
                          <rect key={i} x={20 + i * 58} y={30 - n * 2} width="34" height={n * 2} rx="2">
                            {/* title 用单一字符串子节点:多子节点会触发 SSR 水合不一致 */}
                            <title>{`${["24H2", "25H1", "25H2", "26H1", "26H2"][i]} · ${n} 个来源`}</title>
                          </rect>
                        ))}
                      </g>
                      <g fontSize="9.5" fill="#8a95a1">
                        {["24H2", "25H1", "25H2", "26H1", "26H2"].map((t, i) => (
                          <text key={t} x={37 + i * 58} y="42" textAnchor="middle">{t}</text>
                        ))}
                      </g>
                      <text x="330" y="27" fontSize="10" fill="#4a5866">近一年来源更密,时效可用</text>
                    </svg>
                  </figure>
                  <div className="rcs-miss"><em>未获得:</em>{d.miss.map((m) => <i key={m}>{m}</i>)}</div>
                </div>
                <CoverageBars counts={d.coverage} />
              </div>
              <div className="rr-limits">
                <b>本报告做不到的事(先说清,再看结论):</b>
                <ul>
                  <li>未获得完整 Amazon 评论库 —— 负面主题的<b>真实占比无法验证</b>,频率只代表已收集样本内的观察。</li>
                  <li>无销量、退货率与广告数据 —— 不对市场规模与投入产出做任何测算。</li>
                  <li>公开发声的用户存在选择偏差;测评可能含商业合作,来源附录已分类标注。</li>
                </ul>
              </div>
            </section>

            <section id="demand">
              <h2>3 用户需求与购买动机</h2>
              <div className="rcs-cov">
                <div>
                  <MotivationBars demand={d.findings.demand} />
                  <div className="rc-chips">{d.scenes.map((s) => <i key={s}>{s}</i>)}</div>
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 650, color: "#16212c", marginBottom: 10 }}>决策关键属性 · 样本内讨论热度(定性)</p>
                  <div className="rcs-ranks">
                    {d.ranks.map((r) => (
                      <div key={r.label}><b>{r.label}</b><Pips level={r.level} /><small>{r.word}</small></div>
                    ))}
                  </div>
                  <p className="rc-note">点阶为定性分级(高/中/低),不是精确占比。</p>
                </div>
              </div>
              <EvidenceLine support={cat === "electronics" ? 12 : 10} against={2} level="中高" />
            </section>

            <section id="voice">
              <h2>4 正面口碑与负面问题</h2>
              <DivergingThemes themes={d.themes} />
              <EvidenceLine support={cat === "electronics" ? 9 : 8} against={1} level="中高" />
            </section>

            <section id="matrix">
              <h2>5 问题优先级与期望落差</h2>
              <div className="rcs-cov">
                <PriorityMatrix negatives={d.findings.voice?.negatives} />
                <div>
                  {cat === "electronics"
                    ? <ClaimGap gaps={d.findings.claimGaps} />
                    : (
                      <div className="rr-assume" style={{ marginBottom: 10 }}>
                        <Info size={14} />
                        <span><b>品类差异</b>:期望落差哑铃图是电子品类的专属图(需要宣称值与观察值的数值出处);家居品类的落差以文字归因呈现。</span>
                      </div>
                    )}
                  <p>{d.gapNote}</p>
                </div>
              </div>
              <EvidenceLine support={7} against={2} level="中" />
            </section>

            <section id="risk">
              <h2>6 高频问题与品类风险</h2>
              <div className="rr-risks">
                {d.risks.map((r) => (
                  <div key={r.t} className="rr-risk">
                    <b><i className={`rcs-sev is-${r.sev}`} />{r.t}</b>
                    <span>{r.d}</span>
                  </div>
                ))}
              </div>
              <p className="rc-note" style={{ marginTop: 10 }}>{d.riskFoot}</p>
            </section>

            <section id="rivals">
              <h2>7 竞品方向与机会</h2>
              <div className="rcs-cov">
                <PositionMap rivalMap={d.findings.rivalMap} />
                <div className="rr-table-wrap">
                  <table className="rr-table">
                    <thead><tr><th>方向</th><th>口碑重心</th><th>公开缺陷</th><th>可争夺点</th></tr></thead>
                    <tbody>
                      {d.rivalRows.map((r) => (
                        <tr key={r.t}><td><b>{r.t}</b></td><td>{r.good}</td><td>{r.bad}</td><td>{r.chance}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section id="advice">
              <h2>8 行动优先级</h2>
              <div className="rr-actions">
                {d.actions.map((a) => (
                  <div key={a.stage} className="rr-action">
                    <b>{a.stage}</b>
                    <ul>{a.items.map((it) => <li key={it}>{it}</li>)}</ul>
                  </div>
                ))}
              </div>
            </section>

            <section id="sources">
              <h2>9 证据与来源附录</h2>
              <div className="rr-table-wrap">
                <table className="rr-table">
                  <thead><tr><th>类型</th><th>来源</th><th>时间</th><th>可靠度</th><th>支持的结论</th></tr></thead>
                  <tbody>
                    {d.sources.map((s) => (
                      <tr key={s.name}><td>{s.type}</td><td>{s.name}</td><td>{s.time}</td><td>{s.rel}</td><td>{s.backs}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="rr-tabnote">样例节选 4 条,不含真实链接。正式报告含全部来源:原始 URL、发布与采集时间、「原始/转载/商业合作」性质标注,且每条结论可展开对应来源。</p>
            </section>
          </article>
        </div>

        <div className="rr-sample-cta">
          <p>想对你的商品做一份?正式研究先扫描预览范围与消耗,你确认后才开始。</p>
          <a href="/crossborder/research/product-insight/">开始扫描 →</a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
