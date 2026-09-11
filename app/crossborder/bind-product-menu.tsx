"use client";

/**
 * 「归入商品档案」下拉 —— 深度研究报告与用户声音报告共用。
 *
 * 背景:历史上报告只能在**启动时**绑商品(从商品档案进研究/在启动卡选商品),
 * 别处启动的报告就永远挂不上档案。这里给已生成的报告补一个绑定/改绑/解绑入口。
 *
 * 可挂载目标与「我的商品」同一口径:
 *   ① 滤掉没动过的惰性空档案(打开计算器时自动建的「未命名商品」空壳);
 *   ② 滤掉独立结果/散记录 —— isLoose() 的定义本就含「无报告」,绑上去等于让它转正,
 *      而绑定接口只写后端 product_ref、不动本地 records,会造成「我的商品里仍是散记录、
 *      点进去却挂着报告」的前后不一致。要承接报告请先起名或并入档案转正。
 * 已绑目标从全量里找,保证历史绑到散记录的报告照常能显示归属与取消归属。
 */

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Package } from "lucide-react";
import { MARKET_LABEL } from "../../lib/crossborder/asin";
import {
  findOrCreateProduct, isLoose, listProducts, ownsRef, productLabel, sortForPicker, subscribeProducts,
  type Product,
} from "../../lib/crossborder/products";

export function BindProductMenu({ productRef, productName, marketplace, asin, onBind, onBound, menu }: {
  productRef: string | null;
  /** 报告上的商品名,用于「新建档案并归入」 */
  productName: string;
  /**
   * 报告的市场与 ASIN —— 新建档案时必须带上:商品档案的组合唯一键是「ASIN+市场」或
   * 「名+市场」,只按名字建会漏掉市场(展示成没有 @市场 的档案),更糟的是可能被去重
   * 到另一个市场的同名档案上 —— 而同名不同市场本就该是两个档案。
   */
  marketplace?: string | null;
  asin?: string | null;
  /** 真正落库的动作(两条报告线各自的 PATCH) */
  onBind: (productRef: string | null, productName?: string) => Promise<unknown>;
  onBound: (productRef: string | null) => void;
  /** 外层下拉容器(各页复用自己的 ActionMenu 实现,保持版式一致) */
  menu: (label: string, icon: ReactNode, children: ReactNode) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const all = useSyncExternalStore(subscribeProducts, listProducts, () => [] as Product[]);
  const touched = (p: Product) =>
    !!p.name.trim() || (p.records?.length ?? 0) > 0 || (p.rivals?.length ?? 0) > 0 || !!p.project;
  const products = all.filter((p) => touched(p) && !isLoose(p));
  // 用 ownsRef 而不是 stableId 直接比 —— 档案被合并过时,报告绑的是旧 id
  const bound = all.find((p) => ownsRef(p, productRef)) || null;

  async function bind(ref: string | null, name?: string) {
    setBusy(true);
    try {
      await onBind(ref, name);
      onBound(ref);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "操作失败,请稍后再试。");
    } finally { setBusy(false); }
  }

  const label = bound ? `已归入 ${bound.name.trim() || "未命名商品"}` : "归入商品档案";
  return <>{menu(label, <Package size={13} />, (
    <>
      {products.length === 0 && (
        <button disabled>
          {all.some(isLoose)
            ? "只有独立结果·散记录 —— 先在「我的商品」给它起名转正"
            : "还没有商品档案 —— 去「我的商品」建一个,或用浏览器扩展在商品页采集"}
        </button>
      )}
      {sortForPicker(products, bound?.id).slice(0, 12).map((p) => (
        <button key={p.id} disabled={busy} onClick={() => bind(p.stableId, p.name.trim() || undefined)}>
          {ownsRef(p, productRef) ? "✓ " : ""}{productLabel(p)}
        </button>
      ))}
      {!bound && products.length > 0 && productName.trim() && (
        <button disabled={busy}
          onClick={() => {
            const p = findOrCreateProduct({ name: productName.trim(), marketplace, asin });
            bind(p.stableId, p.name.trim() || undefined);
          }}>
          ＋ 新建「{productName.trim()}
          {marketplace ? ` @ ${MARKET_LABEL[marketplace] ?? marketplace}` : ""}」并归入
        </button>
      )}
      {bound && <button disabled={busy} onClick={() => bind(null)}>取消归属</button>}
    </>
  ))}</>;
}
