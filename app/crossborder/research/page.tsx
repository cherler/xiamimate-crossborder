import type { Metadata } from "next";
import { SiteHeader, SiteFooter, BackTo } from "../../site-chrome";
import { SiteLink } from "../../site-link";
import { siteUrl } from "../../../lib/site";
import { LOCAL_RESEARCH_TYPES } from "../../../lib/crossborder/research/local";
export const metadata: Metadata = { title: "深度研究 · 虾米跨境", description: "商品口碑、竞品对比与综合研究：报告样例、采集资料、本地分析与研究底稿。", alternates: { canonical: siteUrl("/crossborder/research/") } };
export default function ResearchHub() {
  return <main className="app-shell"><SiteHeader /><section className="tool-page research-hub"><BackTo />
    <div className="research-hero">
      <div><div className="cb-brand">深度研究<em>DEEP RESEARCH</em></div>
        <h1>每个判断，<br />都能回到依据。</h1>
        <p className="local-lead">从商品口碑、竞品差异，到一次完整的选品判断。</p>
        <p className="local-note">收集资料，核对原文，再把结论与待验证的问题放进同一份报告。</p>
        <div className="local-actions"><SiteLink className="primary" href="/crossborder/research/workspace/">整理我的研究资料 →</SiteLink><SiteLink href="/crossborder/research/sample/">查看完整报告样例</SiteLink></div>
      </div>
      <aside className="research-outline"><span>研究报告应该回答</span><ol><li>用户真正需要什么？</li><li>商品的问题在哪里？</li><li>竞品解决了什么？</li><li>哪些结论仍缺证据？</li></ol><small>结论 → 原文 → 来源 → 采集范围</small></aside>
    </div>
    <section aria-labelledby="research-types"><h2 id="research-types">三类研究</h2><div className="tc-grid">
      {LOCAL_RESEARCH_TYPES.map((t,i) => <article className="tcard research-card" key={t.id}><span className="research-number">0{i+1}</span><h3>{t.name}</h3><p>{t.description}</p>
        <div className="local-actions"><SiteLink href={"/crossborder/research/workspace/?type="+t.id}>整理这类研究 →</SiteLink><SiteLink href={"/crossborder/research/sample/"+t.sample}>查看报告样例</SiteLink></div></article>)}
    </div></section>
    <div className="local-grid">
      <section className="local-panel"><h2>当前可以直接使用</h2><ul className="local-list">
        <li>查看三类完整报告样例，以及 TikTok Shop 平台样例。</li>
        <li>用采集助手导入商品资料、评论原文和平台摘要。</li>
        <li>按关键词统计评论主题，对比两份商品档案的样本。</li>
        <li>补充来源链接、判断和行动项，保存或导出本地研究底稿。</li>
      </ul><div className="local-actions"><SiteLink href="/extension/">安装采集助手 →</SiteLink><SiteLink href="/crossborder/research/sample/?type=tiktok">TikTok Shop 样例 →</SiteLink></div></section>
      <section className="local-panel"><h2>原版的自动研究能力</h2><p>原版支持识别商品、扫描公开网页、检索社区与问答、整理带引用的 AI 报告，以及异步任务续跑。</p>
        <p>这些步骤需要在线检索和模型服务。当前 GitHub Pages 站点尚未接入，因此这里提供报告展示与本地资料研究，不会假装已经完成联网扫描。</p>
        <p className="local-note">报告样例使用演示数据；本地底稿依据你提供的资料生成固定结构，结论由你填写。</p>
      </section>
    </div>
  </section><SiteFooter /></main>;
}
