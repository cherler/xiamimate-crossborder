"use client";
import { useState } from "react";
import { SiteHeader, SiteFooter } from "../../site-chrome";
import { SiteLink } from "../../site-link";
import { parseCaptureBundle, bundleTitle, bundleIdentity, MAX_CAPTURE_BYTES, type CaptureBundle } from "../../../shared/collector";
import { captureFingerprint, prepareCaptureProduct } from "../../../lib/crossborder/collector";
import { listProducts, commitImportedProduct } from "../../../lib/crossborder/products";
export function ImportCapture() {
  const [bundle, setBundle] = useState<CaptureBundle | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  async function upload(file?: File) {
    setBundle(null); setMessage(""); setDone(false);
    if (!file) return;
    try {
      if (file.size > MAX_CAPTURE_BYTES) throw new Error("请选择不超过 2 MB 的采集 JSON 文件。");
      setBundle(parseCaptureBundle(await file.text()));
    } catch (e) { setMessage(e instanceof Error ? e.message : "无法读取采集文件。"); }
  }
  async function confirm() {
    if (!bundle || busy) return;
    setBusy(true);
    try {
      const key = await captureFingerprint(bundle);
      const result = prepareCaptureProduct(listProducts(), bundle, key);
      commitImportedProduct(result.product);
      setMessage(result.duplicate ? "这份采集文件已经导入，没有重复添加。" : "已导入本地商品档案，成本与测算参数保持原值。");
      setDone(true);
    } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败，原有档案已保留。"); }
    finally { setBusy(false); }
  }
  const ref = bundle ? bundleIdentity(bundle) : null;
  return <main className="app-shell"><SiteHeader /><section className="tool-page collector-page">
    <SiteLink className="tool-breadcrumb" href="/extension/">← 浏览器采集助手</SiteLink>
    <div className="tool-page-head"><div><span>CROSSBORDER / IMPORT</span><h1>核对一次，再放进档案。</h1></div></div>
    <p className="local-note">选择采集助手导出的 JSON 文件。确认前不会写入；同一商品和站点会合并到已有档案，采集价格只作为观察资料。</p>
    <label className="local-field">采集 JSON 文件<input type="file" accept=".json,application/json" disabled={busy} onChange={e => void upload(e.target.files?.[0])} /></label>
    {message && <p className="local-notice" role="status">{message}</p>}
    {bundle && <section className="local-panel" data-testid="capture-preview"><h2>{bundleTitle(bundle)}</h2>
      <p>{ref?.marketplace} · {ref?.externalId} · 导出时间 {new Date(bundle.exportedAt).toLocaleString("zh-CN")}</p>
      {bundle.product && <><dl className="capture-facts">{Object.entries(bundle.product.fields).map(([k, v]) => <div key={k}><dt>{({ title:"标题",brand:"品牌",price:"页面价格",currency:"币种",rating:"评分",reviewCount:"评价数",soldCount:"已售",bulletPoints:"商品要点",categoryPath:"类目",mainImage:"主图链接",sellerName:"卖家",fulfillmentType:"履约",bsr:"排名",firstAvailable:"上架时间" } as Record<string,string>)[k] ?? k}</dt><dd>{Array.isArray(v) ? v.join("；") : String(v)}</dd></div>)}</dl>
      <p>商品来源：<SiteLink href={bundle.product.sourceUrl} target="_blank" rel="noreferrer">{bundle.product.sourceUrl}</SiteLink></p></>}
      {bundle.reviews && <><h3>已采评论：{bundle.reviews.reviews.length} 条</h3><p>仅为已打开页面的样本；页面标注的评价总数：{bundle.reviews.provenance.totalReviews ?? "未知"}。</p>
        <details><summary>查看采集页与筛选条件</summary><ul className="local-list">{bundle.reviews.pages.map((p,i) => <li key={i}><SiteLink href={p.sourceUrl} target="_blank" rel="noreferrer">来源页面</SiteLink> · 第 {p.pageNumber} 页 · {p.sampleType === "featured" ? "精选样本" : "列表样本"} · {p.starFilter || "未限定星级"} · {p.sortBy || "默认排序"} · {p.capturedAt}</li>)}</ul></details>
        <details><summary>查看评论原文</summary>{bundle.reviews.reviews.map((r,i) => <p key={i}>{r.rating || "未评"} 星 · {r.title} · {r.text}</p>)}</details></>}
      {bundle.insights && <><h3>平台口碑摘要</h3><p>{bundle.insights.summary || "未提供摘要原文"}</p><p>{bundle.insights.topics.map(t => t.name + "：" + t.mentions + " 次提及").join("；")}</p><p className="local-note">来自平台展示，非本工具计算；与上面的采集评论分开保存。</p></>}
      <div className="local-actions"><button className="primary" disabled={busy || done} onClick={() => void confirm()}>{busy ? "正在保存…" : done ? "已确认导入" : "确认导入本地档案"}</button></div>
    </section>}
    {done && <div className="local-actions"><SiteLink className="primary" href="/crossborder/research/workspace/">用这些资料做研究 →</SiteLink><SiteLink href="/crossborder/workbench/voice-insight/">分析评论样本 →</SiteLink><SiteLink href="/crossborder/my/">查看商品档案 →</SiteLink></div>}
  </section><SiteFooter /></main>;
}
