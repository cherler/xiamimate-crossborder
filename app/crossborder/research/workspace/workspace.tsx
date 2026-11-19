"use client";
import { useState, useSyncExternalStore } from "react";
import { SiteHeader, SiteFooter } from "../../../site-chrome";
import { SiteLink } from "../../../site-link";
import { ProductSwitcher } from "../../tools/product-switcher";
import { readStore, subscribeProducts, addRecord, getSyncState } from "../../../../lib/crossborder/products";
import { captureBundles, collectedReviews } from "../../../../lib/crossborder/collector";
import { downloadText } from "../../../../lib/crossborder/backup";
import { DEFAULT_TOPICS } from "../../../../lib/crossborder/local-workbench";
import { buildResearchDraft, LOCAL_RESEARCH_TYPES, type LocalResearchMode } from "../../../../lib/crossborder/research/local";
const subscribeLocation = () => () => {};
const queryMode = (): LocalResearchMode => {
  const type = new URLSearchParams(window.location.search).get("type");
  return type === "full" || type === "rival" ? type : "voice";
};
export function ResearchWorkspace() {
  const store = useSyncExternalStore(subscribeProducts, readStore, () => null);
  const initialMode = useSyncExternalStore(subscribeLocation, queryMode, () => "voice" as const);
  const [modeOverride, setMode] = useState<LocalResearchMode | null>(null), [rivalId, setRivalId] = useState("");
  const mode = modeOverride ?? initialMode;
  const [question, setQuestion] = useState(""), [evidence, setEvidence] = useState(""), [conclusion, setConclusion] = useState(""), [actions, setActions] = useState(""), [topics, setTopics] = useState(DEFAULT_TOPICS);
  const [report, setReport] = useState(""), [signature, setSignature] = useState(""), [message, setMessage] = useState("");
  const products = store?.products ?? [];
  const product = products.find(p => p.id === store?.currentId) ?? products[0] ?? null;
  const rival = products.find(p => p.id === rivalId && p.id !== product?.id);
  const inputSignature = JSON.stringify([product?.id, mode, rival?.id, question, evidence, conclusion, actions, topics,
    product?.platform, product?.finance, product ? captureBundles(product) : [], rival?.platform, rival ? captureBundles(rival) : []]);
  const stale = !!report && signature !== inputSignature;
  function generate() {
    if (!product) return;
    try {
      const text = buildResearchDraft({ product, rival, mode, question, evidence, conclusion, actions, topics });
      setReport(text); setSignature(inputSignature); setMessage("");
    } catch (e) { setMessage(e instanceof Error ? e.message : "请检查资料。"); }
  }
  function save() {
    if (!product || !report || stale) return;
    addRecord(product.id, { tool: "research", label: "本地研究底稿 · " + LOCAL_RESEARCH_TYPES.find(t => t.id === mode)?.name,
      values: { mode, question, evidence, conclusion, actions, topics, rivalRef: rival?.stableId ?? null, summary: report } });
    setMessage(getSyncState().localFull ? "浏览器空间不足，未能落盘。请立即导出底稿保存。" : "底稿已保存，可在「我的商品」查看和导出。");
  }
  return <main className="app-shell"><SiteHeader /><section className="tool-page research-notes">
    <SiteLink className="tool-breadcrumb" href="/crossborder/research/">← 深度研究</SiteLink>
    <div className="tool-page-head"><div><span>CROSSBORDER / RESEARCH NOTES</span><h1>我的研究资料</h1></div></div>
    <p className="local-note">本地整理，不自动联网或调用 AI。选择已有商品，将采集样本与补充证据整理成底稿；判断由你填写。</p>
    <ProductSwitcher />
    {!product ? <section className="local-panel"><h2>先准备一份商品档案</h2><div className="local-actions"><SiteLink href="/extension/import/">导入插件采集文件</SiteLink><SiteLink href="/crossborder/my/">建立商品档案</SiteLink></div></section> : <>
      <section className="local-panel"><h2>研究对象：{product.name || "未命名商品"}</h2><p>已采集 {captureBundles(product).length} 批资料，去重后 {collectedReviews(product).length} 条评论。</p>
        <div className="local-actions"><SiteLink href="/extension/import/">补充采集资料</SiteLink><SiteLink href="/crossborder/workbench/voice-insight/">查看评论统计与原文</SiteLink><SiteLink href="/crossborder/assess/">核对经营测算</SiteLink></div>
        <div className="local-grid"><label className="local-field">研究类型<select aria-label="研究类型" value={mode} onChange={e => setMode(e.target.value as LocalResearchMode)}>{LOCAL_RESEARCH_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {mode !== "voice" && <label className="local-field">竞品档案<select aria-label="竞品档案" value={rival?.id ?? ""} onChange={e => setRivalId(e.target.value)}><option value="">选择竞品{mode === "full" ? "（可选）" : ""}</option>{products.filter(p => p.id !== product.id).map(p => <option key={p.id} value={p.id}>{p.name} · {p.marketplace}</option>)}</select></label>}</div>
        <label className="local-field">这次想回答的问题<input aria-label="研究问题" value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：退货问题是否集中在尺寸，竞品如何描述适配范围？" maxLength={2000} /></label>
      </section>
      <div className="local-grid"><section className="local-panel"><h2>补充证据</h2><label className="local-field">每行一条：来源链接 | 摘录或备注<textarea aria-label="补充证据" value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="https://example.com/product | 已核对的材料、公开讨论或报价说明" maxLength={100000} /></label><p className="local-note">链接不会被自动访问。请自行核对来源日期、内容与适用范围；报告会标为用户提供。</p></section>
        <section className="local-panel"><h2>评论主题</h2><label className="local-field">每行一个主题：名称: 关键词, 关键词<textarea aria-label="研究主题" value={topics} onChange={e => setTopics(e.target.value)} /></label><p className="local-note">按关键词统计，只覆盖采集的样本。各主题可以重叠。</p></section></div>
      <div className="local-grid"><label className="local-field">我的判断（请注明依据）<textarea aria-label="我的判断" value={conclusion} onChange={e => setConclusion(e.target.value)} maxLength={20000} placeholder="说明你的判断，引用资料编号 S1 或评论原文，并标出尚未验证的假设。" /></label><label className="local-field">下一步验证<textarea aria-label="下一步验证" value={actions} onChange={e => setActions(e.target.value)} maxLength={20000} placeholder="补充多少样本、核实哪些参数、向供应商确认什么。" /></label></div>
      <div className="local-actions"><button className="primary" onClick={generate}>整理研究底稿</button></div>
    </>}
    {message && <p className="local-notice" role="status">{message}</p>}
    {stale && <p className="local-notice">资料已变化，请重新整理底稿后再保存或导出。</p>}
    {report && <section className="local-panel"><h2>研究底稿预览</h2><div className="local-actions"><button disabled={stale} onClick={save}>保存到商品档案</button><button disabled={stale} onClick={() => downloadText("xiamimate-research.md", report, "text/markdown")}>导出研究底稿</button><SiteLink href="/crossborder/my/">查看已保存记录</SiteLink></div><pre className="research-draft">{report}</pre></section>}
  </section><SiteFooter /></main>;
}
