"use client";
import { useEffect, useState } from "react";
import { Package, Plus } from "lucide-react";
import { SiteLink } from "../../site-link";
import {
  createProduct,
  currentProduct,
  getSyncState,
  listProducts,
  productLabel,
  setCurrent,
  subscribeProducts,
} from "../../../lib/crossborder/products";
export function ProductSwitcher() {
  const [ready, setReady] = useState(false);
  const [, refresh] = useState(0);
  useEffect(() => {
    setReady(true);
    return subscribeProducts(() => refresh((v) => v + 1));
  }, []);
  const products = ready ? listProducts() : [];
  const current = ready ? currentProduct() : null;
  function create() {
    const name = window.prompt("新商品名称", "");
    if (name === null) return;
    createProduct(name);
    window.location.reload();
  }
  return (
    <div className="local-product-switcher">
      <Package size={16} />
      <label>
        当前商品{" "}
        <select
          aria-label="当前商品"
          value={current?.id ?? ""}
          onChange={(e) => {
            setCurrent(e.target.value);
            window.location.reload();
          }}
        >
          <option value="" disabled>
            未命名商品
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {productLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <button onClick={create}>
        <Plus size={14} /> 新建商品
      </button>
      <SiteLink href="/crossborder/my/">管理档案</SiteLink>
      <small>保存在本机</small>
      {ready && getSyncState().localFull && (
        <p className="local-notice" role="alert">
          浏览器空间不足，最新改动尚未写入。请立即到「我的商品」导出备份，再整理档案。
        </p>
      )}
    </div>
  );
}
