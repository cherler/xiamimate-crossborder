"use client";
import { useEffect, useRef, useState } from "react";
import { SiteHeader, SiteFooter, BackTo } from "../../site-chrome";
import { SiteLink } from "../../site-link";
import { CROSSBORDER_TOOLS } from "../../../lib/crossborder/registry";
import {
  createProduct,
  listProducts,
  productLabel,
  renameProduct,
  removeProduct,
  setCurrent,
  subscribeProducts,
  getSyncState,
  mergeProducts,
  type Product,
} from "../../../lib/crossborder/products";
import {
  createBackup,
  parseBackup,
  restoreBackup,
  downloadText,
} from "../../../lib/crossborder/backup";
import { sitePath } from "../../../lib/site";
import { RivalPanel } from "./rival-panel";

export default function MyProducts() {
  const [ready, setReady] = useState(false),
    [, refresh] = useState(0);
  const [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setReady(true);
    return subscribeProducts(() => refresh((v) => v + 1));
  }, []);
  const products = ready
    ? listProducts()
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
  function create() {
    const name = window.prompt("商品名称");
    if (name === null) return;
    createProduct(name);
    setMessage("商品档案已建立。");
  }
  function rename(p: Product) {
    const name = window.prompt("商品名称", p.name);
    if (name !== null) renameProduct(p.id, name, true);
  }
  function remove(p: Product) {
    if (
      window.confirm(
        "删除「" + productLabel(p) + "」及其测算记录？请先导出需要保留的资料。",
      )
    )
      removeProduct(p.id);
  }
  function merge(p: Product) {
    const id = window.prompt(
      "请输入要并入的商品档案编号：\n" +
        products
          .filter((x) => x.id !== p.id)
          .map((x, i) => i + 1 + ". " + productLabel(x))
          .join("\n"),
    );
    if (!id) return;
    const target = products.filter((x) => x.id !== p.id)[Number(id) - 1];
    if (
      target &&
      window.confirm(
        "把「" +
          productLabel(p) +
          "」的记录并入「" +
          productLabel(target) +
          "」？",
      )
    )
      mergeProducts(p.id, target.id);
  }
  function open(p: Product, url: string) {
    setCurrent(p.id);
    window.location.assign(sitePath(url));
  }
  function backup() {
    downloadText(
      "xiamimate-crossborder-" +
        new Date().toISOString().slice(0, 10) +
        ".json",
      JSON.stringify(createBackup(), null, 2),
    );
  }
  async function restore(f?: File) {
    if (!f) return;
    try {
      const data = parseBackup(await f.text());
      if (
        !window.confirm(
          "导入 " +
            data.products.length +
            " 份商品与 " +
            data.templates.length +
            " 份模板？同一档案保留较新版本，其他档案保留。",
        )
      )
        return;
      restoreBackup(localStorage, createBackup(), data);
      window.location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "导入失败，原有档案已保留。");
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="tool-page">
        <BackTo />
        <div className="tool-page-head">
          <div>
            <span>CROSSBORDER / ARCHIVE</span>
            <h1>我的商品</h1>
          </div>
        </div>
        <p className="local-note">
          商品、测算快照和工作台结果保存在当前浏览器。导出备份可以换设备继续使用；清除浏览器数据前请先备份。
        </p>
        <div className="local-actions">
          <button className="primary" onClick={create}>
            新建商品
          </button>
          <button onClick={backup} disabled={!ready}>
            导出全部备份
          </button>
          <button onClick={() => file.current?.click()}>导入备份</button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void restore(e.target.files?.[0])}
          />
        </div>
        {message && (
          <p className="local-notice" role="status">
            {message}
          </p>
        )}
        {ready && getSyncState().localFull && (
          <p className="local-notice" role="alert">
            浏览器空间不足，最新改动尚未写入。立即导出全部备份，备份包含当前页面中尚未落盘的改动。
          </p>
        )}
        <label className="local-field">
          搜索商品
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称或 ASIN"
          />
        </label>
        {ready && !products.length && (
          <div className="local-panel">
            <h2>从第一个商品开始</h2>
            <p>新建商品，或到计算器保存一次测算，即可在这里回看。</p>
            <SiteLink href="/crossborder/tools/profit-calculator/">
              去算一笔利润 →
            </SiteLink>
          </div>
        )}
        {products
          .filter((p) =>
            (p.name + " " + (p.asin ?? ""))
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .map((p) => (
            <article className="local-panel" key={p.id}>
              <h2>{productLabel(p)}</h2>
              <p className="local-note">
                {p.marketplace} · {(p.records ?? []).length} 条记录 ·{" "}
                {new Date(p.updatedAt).toLocaleString("zh-CN")}
              </p>
              <div className="local-actions">
                {CROSSBORDER_TOOLS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => open(p, "/crossborder/tools/" + t.slug)}
                  >
                    {t.name}
                  </button>
                ))}
                <button
                  onClick={() =>
                    open(p, "/crossborder/workbench/listing-doctor/")
                  }
                >
                  商品事实 / Listing
                </button>
                <button onClick={() => rename(p)}>改名</button>
                {products.length > 1 && (
                  <button onClick={() => merge(p)}>合并档案</button>
                )}
                <button onClick={() => remove(p)}>删除</button>
              </div>
              <RivalPanel product={p} />
              {(p.records ?? [])
                .slice()
                .sort((a, b) => b.ts - a.ts)
                .map((r) => (
                  <details className="local-record" key={r.id}>
                    <summary>
                      {r.label} · {new Date(r.ts).toLocaleString("zh-CN")}
                    </summary>
                    <pre>
                      {typeof r.values.summary === "string"
                        ? r.values.summary
                        : JSON.stringify(r.values, null, 2)}
                    </pre>
                    <div className="local-actions">
                      <button
                        onClick={() =>
                          downloadText(
                            r.tool + "-" + r.id + ".json",
                            JSON.stringify(r, null, 2),
                          )
                        }
                      >
                        导出这条记录
                      </button>
                      {CROSSBORDER_TOOLS.find((t) => t.id === r.tool) && (
                        <button
                          onClick={() =>
                            open(
                              p,
                              "/crossborder/tools/" +
                                CROSSBORDER_TOOLS.find((t) => t.id === r.tool)!
                                  .slug +
                                "/?s=" +
                                encodeURIComponent(JSON.stringify(r.values)),
                            )
                          }
                        >
                          恢复这次测算
                        </button>
                      )}
                    </div>
                  </details>
                ))}
            </article>
          ))}
      </section>
      <SiteFooter />
    </main>
  );
}
