"use client";

/**
 * 竞品组面板(#61)—— 挂在商品档案名下的对照名单。
 *
 * 竞品行可以只是手录的几个数字,也可以 productRef 绑定到另一份真实商品档案 ——
 * 绑定后名称/价格/评分读穿到对方的平台事实,声音洞察也能直接取它的评论。
 * 我们仍不抓取任何页面:对方档案的数据来自扩展在**用户自己打开的**页面上读取。
 * 「观察价」是记录当时看到的价,不是实时价 —— 直面这一点,标注记录日期。
 * 贴亚马逊链接会自动认出 ASIN,只当身份锚点用。
 */

import { useState } from "react";
import { Link2, Link2Off, Package, Plus, Swords, Trash2 } from "lucide-react";
import {
  addRival, linkRival, listProducts, removeRival, rivalView,
  type Product, type Rival,
} from "../../../lib/crossborder/products";
import { parseListingRef } from "../../../lib/crossborder/asin";

function gap(myPrice: number, theirs?: number | null): string | null {
  if (!theirs || !myPrice) return null;
  const d = ((theirs - myPrice) / myPrice) * 100;
  if (Math.abs(d) < 0.5) return "≈ 同价";
  return d > 0 ? `贵 ${d.toFixed(0)}%` : `便宜 ${Math.abs(d).toFixed(0)}%`;
}

function when(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

const num = (s: string): number | null => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function RivalPanel({ product }: { product: Product }) {
  /**
   * 默认展开。
   *
   * 这是档案抽屉里唯一会把自己藏起来的区块 —— 财务模型、测算记录、事实库
   * 都是直接摊开的。结果新用户根本不知道有竞品组这回事,更不会去点那个标题。
   * 一个需要先被发现才能用的功能,等于不存在。
   */
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", link: "", price: "", rating: "", reviews: "", note: "" });

  const [picking, setPicking] = useState(false);
  const rivals = product.rivals ?? [];
  const myPrice = product.finance?.price ?? 0;

  /**
   * 别的档案里,还没被这个商品列为竞品的那些。
   * 排除自己 —— 一个商品不能是自己的竞品。
   */
  const linkable = listProducts().filter((p) =>
    p.stableId !== product.stableId
    && !rivals.some((r) => r.productRef === p.stableId));

  /**
   * 把一份真实档案收编成竞品。
   *
   * 这是之前缺的那一环:数据结构(productRef)、按 ASIN 自动关联都做了,
   * 唯独没有「我想把商品 B 设成商品 A 的对手」这个入口 ——
   * 用户只能去点「合并」,而合并会把两个商品并成一个,是完全相反的操作。
   */
  function linkExisting(target: Product) {
    const rival = addRival(product.id, {
      name: target.name.trim() || "未命名商品",
      asin: target.asin ?? null,
      price: target.platform?.price ?? target.finance?.price ?? null,
      rating: target.platform?.rating ?? null,
      reviews: target.platform?.reviewCount ?? null,
      note: "",
    });
    linkRival(product.id, rival.id, target.stableId);
    setPicking(false);
  }

  function submit() {
    const name = f.name.trim();
    if (!name) return;
    const ref = f.link.trim() ? parseListingRef(f.link) : null;
    addRival(product.id, {
      name: name.slice(0, 60),
      asin: ref?.asin ?? null,
      price: num(f.price),
      rating: (() => { const r = num(f.rating); return r !== null && r <= 5 ? r : null; })(),
      reviews: num(f.reviews),
      note: f.note.trim().slice(0, 120),
    });
    setF({ name: "", link: "", price: "", rating: "", reviews: "", note: "" });
    setAdding(false);
  }

  return (
    <div className="rvl">
      <button className="rvl-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Swords size={13} /> 竞品组{rivals.length ? ` · ${rivals.length}` : ""}
      </button>
      {open && (
        <div className="rvl-body">
          {rivals.length > 0 && (
            <div className="rvl-table-wrap">
              <table className="rvl-table">
                <thead><tr><th>竞品</th><th>观察价</th><th>vs 我</th><th>评分</th><th>评论</th><th>记于</th><th /></tr></thead>
                <tbody>
                  {rivals.map((r: Rival) => {
                    // 绑定了档案就读穿到对方的平台事实 —— 手抄的数字会过期,采集回来的不会
                    const v = rivalView(r);
                    return (
                    <tr key={r.id} className={v.linked ? "rvl-linked" : ""}>
                      <td>
                        <b>{v.name}</b>
                        {v.linked && (
                          <small className="rvl-tag" title="已绑定商品档案:数据随对方档案更新,声音洞察可直接取它的评论">
                            <Link2 size={10} /> 已绑档案
                          </small>
                        )}
                        {v.asin && <small className="rvl-asin">{v.asin}</small>}
                        {r.note && <small className="rvl-note">{r.note}</small>}
                      </td>
                      <td>{v.price != null ? `$${v.price}` : "—"}</td>
                      <td className="rvl-gap">{gap(myPrice, v.price) ?? "—"}</td>
                      <td>{v.rating != null ? v.rating : "—"}</td>
                      <td>{v.reviews != null ? v.reviews.toLocaleString() : "—"}</td>
                      <td className="rvl-when">{v.linked ? "跟随档案" : when(r.updatedAt)}</td>
                      <td>
                        {v.linked && (
                          <button className="rvl-del" title="解除与商品档案的绑定(保留这一行)"
                            onClick={() => linkRival(product.id, r.id, null)}
                            aria-label={`解绑 ${v.name}`}><Link2Off size={12} /></button>
                        )}
                        <button className="rvl-del" onClick={() => removeRival(product.id, r.id)}
                          aria-label={`删除竞品 ${v.name}`}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {picking && (
            <div className="rvl-pick">
              <div className="rvl-pick-head">选一份已有档案当竞品</div>
              {linkable.length === 0 ? (
                <p className="rvl-pick-empty">没有其它商品档案可选 —— 先用插件采集对手的商品页，或手工新建。</p>
              ) : linkable.map((t) => (
                <button key={t.id} className="rvl-pick-row" onClick={() => linkExisting(t)}>
                  <Package size={13} />
                  <span className="rvl-pick-name">{t.name.trim() || "未命名商品"}</span>
                  <span className="rvl-pick-meta">
                    {t.asin ?? ""}{t.platform?.price != null ? ` · $${t.platform.price}` : ""}
                  </span>
                </button>
              ))}
              <button className="rvl-cancel" onClick={() => setPicking(false)}>取消</button>
            </div>
          )}

          {adding ? (
            <div className="rvl-form">
              <input placeholder="竞品名称(必填)" value={f.name} autoFocus
                onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input placeholder="商品链接 / ASIN(选填,只作锚点)" value={f.link}
                onChange={(e) => setF({ ...f, link: e.target.value })} />
              <div className="rvl-form-row">
                <input placeholder="观察价 $" inputMode="decimal" value={f.price}
                  onChange={(e) => setF({ ...f, price: e.target.value })} />
                <input placeholder="评分" inputMode="decimal" value={f.rating}
                  onChange={(e) => setF({ ...f, rating: e.target.value })} />
                <input placeholder="评论数" inputMode="numeric" value={f.reviews}
                  onChange={(e) => setF({ ...f, reviews: e.target.value })} />
              </div>
              <input placeholder="备注(如:主打差异、促销节奏)" value={f.note}
                onChange={(e) => setF({ ...f, note: e.target.value })} />
              <div className="rvl-form-actions">
                <button className="rvl-add" onClick={submit} disabled={!f.name.trim()}>记录竞品</button>
                <button className="rvl-cancel" onClick={() => setAdding(false)}>取消</button>
              </div>
            </div>
          ) : (
            <div className="rvl-actions">
              <button className="rvl-add" onClick={() => { setAdding(true); setPicking(false); }}>
                <Plus size={12} /> 手工记一个
              </button>
              {/* 从已有档案收编:插件采集过的对手就在这里,不用重新手抄一遍数字 */}
              <button className="rvl-add rvl-add-link" onClick={() => { setPicking((v) => !v); setAdding(false); }}>
                <Link2 size={12} /> 从我的商品档案选
              </button>
            </div>
          )}
          <p className="rvl-foot">
            手工记的竞品只有你填的那几个数字,「观察价」是记录当天看到的价。
            <b>从档案选的竞品会跟着对方档案更新</b>,声音洞察也能直接取它的评论 ——
            用浏览器扩展采集对方商品页,就能建出这样一份档案。
          </p>
        </div>
      )}
    </div>
  );
}
