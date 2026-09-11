"use client";

/**
 * 深度研究落地页(hub)v2 —— 让报告自己说话。
 *
 * 改版原则(2026-07-19 评审):能用「迷你真报告」展示的不用文字描述;
 * 四步流程图标先行;长解释折进 <details>;文字量压到旧版三成。
 * 签名件 = 右侧轻微浮动的报告预览卡(结论卡+双向图+矩阵的缩样)。
 * 文案红线:不出现「计费」字眼,一律「消耗 AI 积分」。
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Ban, BarChart3, Check, ClipboardCheck, FileText,
  Link2, ScanSearch, Search,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../../site-chrome";
import {
  RESEARCH_PRODUCTS, STATUS_LABEL, researchStartPath, researchSamplePath,
} from "../../../lib/crossborder/registry";
import { listResearch } from "../../../lib/crossborder/research/api";

const STEPS = [
  { icon: Search, t: "识别商品", d: "名称或链接都行", tag: "免费", paid: false },
  { icon: ScanSearch, t: "扫描预览", d: "能研究什么、缺什么", tag: "2 积分", paid: false },
  { icon: ClipboardCheck, t: "确认消耗", d: "目录与积分摆在面前", tag: "你拍板", paid: true },
  { icon: FileText, t: "生成报告", d: "约数分钟,中断可续跑", tag: "消耗积分", paid: true },
];

const OATHS = [
  { icon: Link2, t: "结论可溯源", d: "每条结论点开见来源与等级" },
  { icon: BarChart3, t: "覆盖如实", d: "搜到多少、缺什么,开头写明" },
  { icon: Ban, t: "无证据不注水", d: "资料不足的章节降级或省略" },
  { icon: AlertTriangle, t: "假设标明", d: "系统默认范围在报告中注明" },
];

/** 签名件:迷你真报告预览 —— 用户第一眼看到买到的是什么。纯展示,数据写死。 */
function PreviewCard() {
  return (
    <div className="rv2-preview" aria-hidden="true">
      <span className="rv2-pv-badge"><i>●</i> 真实报告版式</span>
      <div className="rv2-pv-card">
        <div className="rv2-pv-head"><b>商品口碑与需求洞察 · 挂脖风扇</b><span>有效来源 37</span></div>
        <div className="rv2-pv-verdicts">
          <div className="rv2-pv-v"><em>用户最重视</em><span>安静与佩戴舒适,而非风量</span></div>
          <div className="rv2-pv-v is-neg"><em>最大问题</em><span>续航虚标是最高频差评主题</span></div>
          <div className="rv2-pv-v"><em>最值得做</em><span>护发 + 低档静音仍是空缺</span></div>
          <div className="rv2-pv-v is-neg"><em>最大不确定</em><span>无完整评论库,占比不可验证</span></div>
        </div>
        <div className="rv2-pv-charts">
          <div className="rv2-pv-chart">
            <small>正面 / 负面口碑(来源数)</small>
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
            <small>问题优先级(频率×影响)</small>
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
        <div className="rv2-pv-foot"><span>结论 → 证据 → 来源,层层可点开</span><b>查看完整样例 →</b></div>
      </div>
    </div>
  );
}

export function ResearchHub() {
  const [main] = RESEARCH_PRODUCTS;
  const live = main.status === "available";
  // 完成通知(站内未读):已完成但没打开过的报告数,给「我的研究报告」入口加角标。
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    listResearch()
      .then((runs) => setUnread(runs.filter((r) => r.status === "done" && !r.seen).length))
      .catch(() => { /* 未登录/失败:不显示角标 */ });
  }, []);
  const mineCta = (
    <a className="rv2-cta is-mine" href="/crossborder/research/report/">
      <FileText size={15} /> 我的研究报告{unread > 0 && <span className="rv2-unread">{unread > 99 ? "99+" : unread}</span>}
    </a>
  );

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rv2-page">
        <a className="tool-breadcrumb" href="/crossborder/"><ArrowLeft size={13} /> 虾米跨境</a>

        {/* Hero:左话右证 */}
        <div className="rv2-hero">
          <div>
            <div className="cb-brand">深度研究<em>DEEP RESEARCH</em></div>
            <h1>给一个商品名,<br />还你一份<b>有据可查</b>的研究。</h1>
            <p className="rv2-sub">AI 检索社区、问答、媒体与公开网页,把需求、差评与机会整理成报告 —— 每个结论都能点开看来源。</p>
            <div className="rv2-ctas">
              {live ? (
                <>
                  <a className="rv2-cta is-main" href="/crossborder/research/product-insight/">开始扫描 →</a>
                  <a className="rv2-cta is-ghost" href="/crossborder/research/sample/">看一份完整样例</a>
                  {mineCta}
                </>
              ) : (
                <>
                  <a className="rv2-cta is-main" href="/crossborder/research/sample/">看一份完整样例 →</a>
                  <span className="rv2-cta is-soon" title="正式研究即将开放">开始扫描 · 即将开放</span>
                  {mineCta}
                </>
              )}
            </div>
            <div className="rv2-trust">
              <span><Check size={13} /> 扫描 2 积分,正式研究确认后才消耗</span>
              <span><Check size={13} /> 约数分钟,消耗 AI 积分</span>
            </div>
          </div>
          <a href="/crossborder/research/sample/" className="rv2-preview-link" aria-label="查看完整样例报告"><PreviewCard /></a>
        </div>

        {/* 四步:图标先行 */}
        <div className="rv2-steps" aria-label="研究流程">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.t} className="rv2-step">
                <span className="rv2-step-ic"><Icon size={21} strokeWidth={1.9} /></span>
                <b>{s.t}</b>
                <span className="rv2-step-d">{s.d}</span>
                <i className={s.paid ? "is-paid" : "is-free"}>{s.tag}</i>
              </div>
            );
          })}
        </div>

        {/* 研究类型:每档各自的启动入口与样例(过稿要求:三档不共用一个入口/样例) */}
        <div className="cb-section-head rv2-gap"><h2>研究类型</h2></div>
        <div className="tc-grid">
          {RESEARCH_PRODUCTS.map((r) => {
            const Icon = r.icon;
            const rLive = r.status === "available";
            const start = researchStartPath(r);
            const sample = researchSamplePath(r);
            return (
              <div key={r.id} className={`tcard rc-tier${rLive ? "" : " is-locked"}`} aria-disabled={!rLive}>
                <div className="tc-head">
                  <span className="tc-icon"><Icon size={19} strokeWidth={1.8} /></span>
                  <span className="tc-title"><b>{r.name}</b><span>{r.pricingNote}</span></span>
                  {!rLive && <span className={`tool-card-badge ${r.status}`}>{STATUS_LABEL[r.status]}</span>}
                </div>
                <p>{r.short}</p>
                <div className="rc-tier-acts">
                  {start
                    ? <a className="rc-start" href={start}>开始研究 →</a>
                    : <span className="rc-plan">{STATUS_LABEL[r.status]}</span>}
                  {sample && <a className="rc-sample" href={sample}>看这档样例 →</a>}
                </div>
              </div>
            );
          })}
        </div>

        {/* 可信承诺:四联图形卡 */}
        <div className="cb-section-head rv2-gap"><h2>报告怎么保证可信</h2><small>写在这里的,报告里必须做到</small></div>
        <div className="rv2-oaths">
          {OATHS.map((o) => {
            const Icon = o.icon;
            return (
              <div key={o.t} className="rv2-oath">
                <Icon size={19} strokeWidth={1.9} />
                <b>{o.t}</b>
                <span>{o.d}</span>
              </div>
            );
          })}
        </div>

        {/* 边界:折叠,不吓人 */}
        <details className="rv2-bound">
          <summary><AlertTriangle size={14} /> 报告不包含什么?(点开看边界)</summary>
          <p>
            我们不爬取平台商品页 —— 这是产品承诺。亚马逊等以<b>公开资料洞察</b>为主:能看到讨论集中在哪里、
            问题指向什么,但不冒充完整评论样本,也不会给出「全网负面占 37.2%」这类伪精确数字。
            选 <b>TikTok Shop</b> 时,平台的真实商品评价会经第三方接口<b>采样</b>补入(已去除评价者个人身份、
            剔除被激励评论),在来源附录单独标注「平台评价」;仍是采样非全量。你后台导出的评论 CSV、
            供应商报价、说明书也可上传补充,同样单独标注。
          </p>
        </details>

        <div className="rr-sample-cta">
          <p><b>想对你的商品做一份?</b> 先扫描,看清能研究什么、消耗多少积分,再决定。</p>
          <a href={live ? "/crossborder/research/product-insight/" : "/crossborder/research/sample/"}>
            {live ? "开始扫描 →" : "先看样例报告 →"}
          </a>
        </div>

      </section>
      <SiteFooter />
    </main>
  );
}
