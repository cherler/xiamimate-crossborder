import { SiteHeader, SiteFooter, BackTo } from "./site-chrome";
export default function NotFound() {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="tool-page">
        <h1>这个页面暂时找不到</h1>
        <p>回到工具首页继续使用。</p>
        <BackTo />
      </section>
      <SiteFooter />
    </main>
  );
}
