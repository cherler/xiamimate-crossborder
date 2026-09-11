"use client";

/**
 * 「当前商品」切换器 —— 商品实体模型的 R1:你永远知道自己在为哪个商品干活。
 *
 * - 默认新建:新的工作上下文就是一个新商品(惰性创建),归并权在用户;
 * - 切换 / 新建 / 重命名;切换后整页刷新,让所有工具从新商品的档案重新挂载;
 * - 同时是云同步驾驶员:登录 → 开云开关、拉云端并本地、把本地商品推上去;
 *   支持 ?product=<cloudId> 从「我的商品」打开指定商品。
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { Check, ChevronDown, CloudUpload, Link2, Package, Pencil, Plus, Telescope } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import {
  adoptCloudProduct, createProduct, createProductFromRef, currentProduct, ensureLoaded, listProducts, productLabel,
  getSyncState, reconcileCloud, schedulePush, setCloudEnabled, setCurrent, renameProduct, sortForPicker, subscribeProducts,
} from "../../../lib/crossborder/products";
import { parseListingRef } from "../../../lib/crossborder/asin";
import { describeSync } from "../../../lib/crossborder/sync-status";
import {
  reconcileCloud as reconcileTemplates, schedulePush as scheduleTemplatePush,
} from "../../../lib/crossborder/cost-templates";

export function ProductSwitcher() {
  const { user, loading } = useAuth();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [open, setOpen] = useState(false);
  const [sync, setSync] = useState(getSyncState());
  const status = describeSync(sync, !!user);
  const [hydrated, setHydrated] = useState(false);   // 商品名来自 localStorage,挂载后才读,避免水合不一致
  const ref = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  useEffect(() => {
    setHydrated(true);
    // setSync 也挂在同一个订阅上 —— pushAll 的每次状态变化都会 notify()
    return subscribeProducts(() => { force(); setSync(getSyncState()); });
  }, []);

  // 云同步驾驶:登录后拉云端合并 + 推本地;?product= 采用指定商品。
  useEffect(() => {
    setCloudEnabled(!!user);
    if (loading || !user || booted.current) return;
    booted.current = true;
    (async () => {
      const wanted = new URLSearchParams(window.location.search).get("product");
      if (wanted) {
        const ok = await adoptCloudProduct(wanted).catch(() => false);
        if (ok) {
          const url = new URL(window.location.href);
          url.searchParams.delete("product");
          window.history.replaceState(null, "", url.toString());
          force();
        }
      } else {
        await reconcileCloud().catch(() => {});
      }
      // 成本模板与商品共用这班「云同步车」:拉云端合并 + 推本地
      await reconcileTemplates().catch(() => {});
      schedulePush();   // 本地攒的商品(含游客期)推上云
      scheduleTemplatePush();
    })();
  }, [user, loading]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cur = hydrated ? currentProduct() : null;
  // 当前商品置顶,其余按更新时间倒序 —— 刚改动过的档案排在最前,不再沉到底部。
  const products = hydrated ? sortForPicker(listProducts(), cur?.id) : [];
  const curName = cur ? productLabel(cur) : "未命名商品";

  async function switchTo(id: string) {
    if (id === cur?.id) { setOpen(false); return; }
    /*
     * 详情还没取下来的档案(存根)先补齐再切。
     * 不补的话刷新后各工具读到的是**占位的默认财务模型** ——
     * 用户会看到自己填过的成本、售价全变回默认值,而且没有任何提示。
     */
    if (listProducts().find((p) => p.id === id)?.stub) {
      await ensureLoaded(id).catch(() => { /* 拉不到就照切,详情页会提示需要联网 */ });
    }
    setCurrent(id);
    // 整页刷新:所有工具从新商品的档案重新挂载,状态不串。
    window.location.reload();
  }
  function create() {
    const name = window.prompt("新商品的名字(可留空,之后随时改):", "");
    if (name === null) return;
    createProduct(name);
    if (user) schedulePush();
    window.location.reload();
  }
  function createFromLink() {
    const raw = window.prompt("贴商品链接或 ASIN(亚马逊各站点均可):", "");
    if (raw === null) return;
    const ref = parseListingRef(raw);
    if (!ref) {
      window.alert("没认出来 —— 支持亚马逊商品链接(含 /dp/ 的)或 10 位 ASIN,如 B08N5WRWNW。");
      return;
    }
    const { existed } = createProductFromRef(ref);
    if (existed) window.alert("这个 ASIN 已有档案,已切换过去。");
    if (user) schedulePush();
    window.location.reload();
  }
  function rename() {
    if (!cur) return;
    const name = window.prompt("商品名字:", cur.name || "");
    if (name === null) return;
    renameProduct(cur.id, name, true);
    if (user) schedulePush();
    setOpen(false);
  }

  return (
    <div className="psw" ref={ref}>
      {/*
        本地存储写不进去 = 用户此刻做的每一步都可能丢。
        这一条**不能只做成 hover 提示** —— 那要用户先怀疑出了事、再把鼠标移上来,
        而他并不知道该怀疑。数据丢失的警示必须自己撞到眼前,所以用常驻悬浮条。
        它没有关闭按钮:问题没解决就不该消失(解决了会自动撤,见 persist())。
      */}
      {status.alarm && (
        <div className="psw-alarm" role="alert">
          <strong>{status.alarm.title}</strong>
          <span>{status.alarm.text}</span>
        </div>
      )}
      <button className="psw-btn" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Package size={14} />
        <span className="psw-cur">{curName}</span>
        <ChevronDown size={13} />
      </button>
      {/* 胶囊此前只看"是否登录",与推送是否成功无关 —— 满额/离线/token 过期时
          用户以为存上了,换台设备才发现什么都没有。现在如实反映同步结果。

          三种坏状态**必须分开说**,因为用户该做的事完全不同:
            本地已满 → 只能他自己动手(整理档案/换浏览器),而且有丢数据的风险,最紧急;
            云端满   → 也得他动手,但本地那份是安全的,不急;
            没同步上 → 什么都不用做,等自动重试就行。
          原来三种都显示成「N 项未同步 · 正在自动重试」,前两种根本不会自愈,
          那句「正在自动重试」是假话。 */}
      <span className={`psw-cloud psw-cloud-${status.tone}`} title={status.title}>
        <CloudUpload size={12} /> {status.label}
      </span>
      {open && (
        <div className="psw-menu" role="menu">
          <div className="psw-sec">当前商品的档案会被所有工具共用</div>
          {products.map((p) => (
            <button className="psw-item" key={p.id} role="menuitem" onClick={() => void switchTo(p.id)}>
              <span className="psw-name">{productLabel(p)}</span>
              <span className="psw-meta">{(p.records?.length ?? 0) ? `${p.records!.length} 条记录` : ""}</span>
              {p.id === cur?.id && <Check size={14} className="psw-check" />}
            </button>
          ))}
          <div className="psw-foot">
            <button onClick={create}><Plus size={13} /> 新建商品</button>
            <button onClick={createFromLink}><Link2 size={12} /> 贴链接 / ASIN 建档</button>
            {cur && <button onClick={rename}><Pencil size={12} /> 重命名当前</button>}
            {/* 深度研究上下文入口:当前商品的档案(名称/ASIN/站点/竞品)自动带入启动页 */}
            {cur && (
              <button onClick={() => { window.location.href = "/crossborder/research/product-insight/?from=product"; }}>
                <Telescope size={12} /> 口碑与需求洞察
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
