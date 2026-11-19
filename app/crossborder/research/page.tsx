import type { Metadata } from "next";
import {
  AlertTriangle, Ban, BarChart3, Check, ClipboardCheck, FileText,
  GitCompare, Link2, Microscope, ScanSearch, Search, Telescope,
} from "lucide-react";
import { SiteHeader, SiteFooter, BackTo } from "../../site-chrome";
import { SiteLink } from "../../site-link";
import { siteUrl } from "../../../lib/site";
import { LOCAL_RESEARCH_TYPES } from "../../../lib/crossborder/research/local";

export const metadata: Metadata = {
  title: "深度研究 · 虾米跨境",
  description: "商品口碑、竞品对比与综合研究：报告样例、采集资料、本地分析与研究底稿。",
  alternates: { canonical: siteUrl("/crossborder/research/") },
};

const STEPS = [
  { icon: Search, title: "准备商品", description: "选择档案或导入采集文件", tag: "本地档案" },
  { icon: ScanSearch, title: "核对资料", description: "评论、原文与来源一起看", tag: "范围清楚" },
  { icon: ClipboardCheck, title: "整理研究", description: "补充判断与待验证问题", tag: "你来判断" },
  { icon: FileText, title: "保存底稿", description: "存入档案，或导出文件", tag: "随时继续" },
];
const RESEARCH_ICONS = { voice: Telescope, rival: GitCompare, full: Microscope };
const OATHS = [
  { icon: Link2, title: "保留来源", description: "评论原文、采集页与补充链接一起保存" },
  { icon: BarChart3, title: "覆盖如实", description: "样本数与采集范围明确标注" },
  { icon: Ban, title: "缺资料就留空", description: "没有样本时提示缺口，不补写结论" },
  { icon: AlertTriangle, title: "假设标明", description: "经营参数、用户判断与观察资料分开" },
];

/** Reuse the main site's report preview; all figures are explicitly illustrative. */
function PreviewCard() {
  return (
    <div className="rv2-preview" aria-hidden="true">
      <span className="rv2-pv-badge"><i>●</i> 报告版式 · 演示数据</span>
      <div className="rv2-pv-card">
        <div className="rv2-pv-head"><b>商品口碑与需求洞察 · 挂脖风扇</b><span>示例来源 37</span></div>
        <div className="rv2-pv-verdicts">
          <div className="rv2-pv-v"><em>用户最重视</em><span>安静与佩戴舒适，而非风量</span></div>
          <div className="rv2-pv-v is-neg"><em>最大问题</em><span>续航虚标是最高频差评主题</span></div>
          <div className="rv2-pv-v"><em>最值得做</em><span>护发 + 低档静音仍是空缺</span></div>
          <div className="rv2-pv-v is-neg"><em>最大不确定</em><span>无完整评论库，占比不可验证</span></div>
        </div>
        <div className="rv2-pv-charts">
          <div className="rv2-pv-chart">
            <small>正面 / 负面口碑（示例）</small>
            <svg viewBox="0 0 200 74">
              <line x1="100" y1="4" x2="100" y2="70" stroke="#e2e7ea" strokeWidth="1" />
              <g fill="#0c9488">
                <rect x="101" y="6" width="62" height="7" rx="2.5" />
                <rect x="101" y="19" width="45" height="7" rx="2.5" />
                <rect x="101" y="32" width="34" height="7" rx="2.5" />
              </g>
              <g fill="#b45309">
                <rect x="49" y="45" width="50" height="7" rx="2.5" />
                <rect x="60" y="58" width="39" height="7" rx="2.5" />
              </g>
            </svg>
          </div>
          <div className="rv2-pv-chart">
            <small>问题优先级（频率 × 影响）</small>
            <svg viewBox="0 0 150 74">
              <rect x="78" y="4" width="68" height="34" rx="5" fill="#fbf1e8" />
              <line x1="12" y1="66" x2="146" y2="66" stroke="#e2e7ea" />
              <line x1="12" y1="66" x2="12" y2="4" stroke="#e2e7ea" />
              <circle cx="112" cy="18" r="8" fill="#b45309" />
              <circle cx="120" cy="44" r="6.5" fill="#b45309" opacity=".8" />
              <circle cx="66" cy="26" r="6" fill="#b45309" opacity=".8" />
              <circle cx="58" cy="48" r="5" fill="#b45309" opacity=".55" />
              <circle cx="32" cy="52" r="4" fill="none" stroke="#b45309" strokeWidth="1.5" />
            </svg>
          </div>
        </div>
        <div className="rv2-pv-foot"><span>结论 → 证据 → 来源，层层可点开</span><b>查看完整样例 →</b></div>
      </div>
    </div>
  );
}

export default function ResearchHub() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader />
      <section className="tool-page rv2-page">
        <BackTo />
        <div className="rv2-hero">
          <div>
            <div className="cb-brand">深度研究<em>DEEP RESEARCH</em></div>
            <h1>围绕一个商品，<br />整理一份<b>有据可查</b>的研究。</h1>
            <p className="rv2-sub">把商品资料、评论原文与来源放在一起，梳理需求、问题与竞品差异，再留下你的判断和下一步验证。</p>
            <div className="rv2-ctas">
              <SiteLink className="rv2-cta is-main" href="/crossborder/research/workspace/">开始整理资料 →</SiteLink>
              <SiteLink className="rv2-cta is-ghost" href="/crossborder/research/sample/">看一份完整样例</SiteLink>
              <SiteLink className="rv2-cta is-mine" href="/crossborder/my/"><FileText size={15} /> 我的研究记录</SiteLink>
            </div>
            <div className="rv2-trust">
              <span><Check size={13} /> 本地资料整理可用</span>
              <span><AlertTriangle size={13} /> AI 联网研究尚未接入</span>
            </div>
          </div>
          <SiteLink href="/crossborder/research/sample/" className="rv2-preview-link" aria-label="查看完整样例报告（演示数据）">
            <PreviewCard />
          </SiteLink>
        </div>

        <div className="rv2-steps" aria-label="本地研究流程">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="rv2-step">
                <span className="rv2-step-ic"><Icon size={21} strokeWidth={1.9} /></span>
                <b>{step.title}</b>
                <span className="rv2-step-d">{step.description}</span>
                <i className="is-free">{step.tag}</i>
              </div>
            );
          })}
        </div>

        <section aria-labelledby="research-types">
          <div className="cb-section-head rv2-gap"><h2 id="research-types">研究类型</h2></div>
          <div className="tc-grid">
            {LOCAL_RESEARCH_TYPES.map((type) => {
              const Icon = RESEARCH_ICONS[type.id];
              return (
                <article key={type.id} className="tcard rc-tier">
                  <div className="tc-head">
                    <span className="tc-icon"><Icon size={19} strokeWidth={1.8} /></span>
                    <span className="tc-title"><b>{type.name}</b><span>本地资料整理 · 可保存与导出</span></span>
                  </div>
                  <p>{type.description}</p>
                  <div className="rc-tier-acts">
                    <SiteLink className="rc-start" href={"/crossborder/research/workspace/?type=" + type.id}>整理这类研究 →</SiteLink>
                    <SiteLink className="rc-sample" href={"/crossborder/research/sample/" + type.sample}>看这档样例 →</SiteLink>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="research-evidence">
          <div className="cb-section-head rv2-gap"><h2 id="research-evidence">让判断有据可查</h2><small>原文、范围与假设都留在底稿里</small></div>
          <div className="rv2-oaths">
            {OATHS.map((oath) => {
              const Icon = oath.icon;
              return (
                <div key={oath.title} className="rv2-oath">
                  <Icon size={19} strokeWidth={1.9} /><b>{oath.title}</b><span>{oath.description}</span>
                </div>
              );
            })}
          </div>
        </section>

        <details className="rv2-bound">
          <summary><AlertTriangle size={14} /> 当前能做什么？自动研究与样例有什么区别？</summary>
          <p>当前可导入采集资料、查看评论原文、按关键词统计主题、对比商品档案，并补充来源与判断。底稿按固定结构整理，<b>结论由你填写</b>，可保存到商品档案或导出。</p>
          <p>主站的商品识别、公开网页扫描、联网检索、AI 报告生成与任务续跑需要在线服务，当前站点<b>尚未接入</b>。完整报告样例使用演示数据，本地底稿不会自动生成样例中的 AI 分析与图表。</p>
          <p>评论只覆盖你实际采集或导入的样本；平台摘要、用户提供的来源和经营假设会分别标注，不能据此推断完整市场或真实销量。</p>
          <div className="ext-actions">
            <SiteLink className="rc-start" href="/extension/">安装采集助手 →</SiteLink>
            <SiteLink className="rc-sample" href="/crossborder/research/sample/?type=tiktok">TikTok Shop 样例 →</SiteLink>
          </div>
        </details>

        <div className="rr-sample-cta">
          <p><b>想对你的商品做一份？</b> 从已有档案开始，把证据、判断和下一步验证整理在一起。</p>
          <SiteLink href="/crossborder/research/workspace/">开始整理资料 →</SiteLink>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
