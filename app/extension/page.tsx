import type { Metadata } from "next";
import { SiteFooter, SiteHeader, BackTo } from "../site-chrome";
import { SiteLink } from "../site-link";
import { REPO_URL, siteUrl } from "../../lib/site";
import pkg from "../../extension/package.json";
export const metadata: Metadata = {
  title: "浏览器采集助手 · 虾米跨境",
  description: "采集 Amazon 与 TikTok Shop 当前页面的商品资料、评论样本和平台摘要，导出到本地商品档案。",
  alternates: { canonical: siteUrl("/extension/") },
};
export default function ExtensionPage() {
  return <main className="app-shell"><SiteHeader /><section className="tool-page collector-page"><BackTo />
    <div className="tool-page-head"><div><span>CROSSBORDER / COLLECTOR</span><h1>把看到的商品，带回工作台。</h1></div></div>
    <p className="local-lead">虾米跨境采集助手 · Amazon 与 TikTok Shop</p>
    <p className="local-note">在商品页点一下，保存商品资料、已展开的评论，以及页面展示的平台口碑摘要。导出文件后，在这里核对并加入本地商品档案。</p>
    <div className="local-actions">
      <SiteLink className="primary" href={"/downloads/xiamimate-collector-" + pkg.version + ".zip"} download>下载浏览器插件 v{pkg.version}</SiteLink>
      <SiteLink href="/extension/import/">导入采集文件 →</SiteLink>
      <SiteLink href={REPO_URL + "/tree/main/extension"} target="_blank" rel="noreferrer">查看插件源码</SiteLink>
    </div>
    <div className="local-grid">
      <section className="local-panel"><h2>能采集什么</h2><ul className="local-list">
        <li>商品标题、品牌、页面价格、评分、评价数和已展示的商品要点；没读到的字段会留空。</li>
        <li>当前已加载的评论原文、评分、款式与时间。手动翻页后再次采集，重复评论自动跳过，每篮最多 500 条。</li>
        <li>Amazon 页面展示的口碑摘要与主题计数，单独标注为平台内容。</li>
      </ul><p>评论样本只覆盖你实际打开的页面，不能推断完整评论库。页面改版、内容尚未加载或访问受限时可能无法采集。</p></section>
      <section className="local-panel"><h2>安装到浏览器</h2><ol className="local-list">
        <li>下载 ZIP，解压到一个固定文件夹。</li>
        <li>Chrome 地址栏输入 <code>chrome://extensions</code>；Edge 输入 <code>edge://extensions</code>。</li>
        <li>打开“开发者模式”，点“加载已解压的扩展程序”，选择含 <code>manifest.json</code> 的文件夹。</li>
        <li>将“虾米跨境采集助手”固定到工具栏，打开商品详情页后点击插件图标。</li>
      </ol><p className="local-note">这是手动安装包，没有商店自动更新。更新时替换原文件夹内容，并在扩展管理页点“重新加载”。</p></section>
    </div>
    <section className="local-panel"><h2>从采集到研究</h2><ol className="local-list">
      <li>打开商品页，展开想保留的评论，点击“采集本页商品”或“重新采集本页评论”。</li>
      <li>点击“导出商品与评论 JSON”，保存文件；插件内的采集结果仍会保留。</li>
      <li>打开“导入采集文件”，核对商品、站点和来源，再确认导入。</li>
      <li>到“评论与竞品样本分析”读取样本，或到“深度研究”整理资料、对比竞品和导出研究底稿。</li>
    </ol><div className="local-actions"><SiteLink href="/crossborder/research/">进入深度研究 →</SiteLink><SiteLink href="/crossborder/my/">查看我的商品 →</SiteLink></div></section>
    <section className="local-panel"><h2>资料留在哪里</h2><p>插件只在你点击采集时读取当前标签页，并保存在浏览器的扩展本地存储中。不会读取 Cookie、密码或浏览历史，不会自动翻页、后台采集或上传数据。导出的文件由你选择是否导入网页。</p><p>网页将确认过的资料保存在当前浏览器。清除浏览器数据或卸载扩展前，请先导出需要保留的文件。</p></section>
  </section><SiteFooter /></main>;
}
