"use client";

/** 「我的商品」—— 商品档案列表(实体优先),早期零散记录归入历史区。
 *
 * 商品卡:名字 · 站点 · 记录数 · 事实完成度;打开 = 设为当前商品并回工具。
 * 合并:R3 的另一半 —— 归并权在用户,选一个源商品并入目标商品,版本不丢。
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import { Bookmark, ClipboardList, ExternalLink, GitMerge, Loader2, MessagesSquare, Package, Telescope, CloudUpload, Trash2 } from "lucide-react";
import { BackTo, SiteFooter, SiteHeader } from "../../site-chrome";
import { LoginModal } from "../../auth/login-modal";
import { authApi, useAuth, type MeFull } from "../../../lib/auth";
import { itemsApi, type DeletedItem, type SavedItem } from "../../../lib/items";
import { useServerView } from "../../../lib/crossborder/use-server-view";
import {
  ensureLoaded, isLoose, isTouched, listProducts, markOpened, mergeProducts, PRODUCT_SORTS, reconcileCloud,
  recordCount, restoreDeleted,
  removeProduct, renameProduct, setCloudEnabled, setCurrent, sortProducts,
  subscribeProducts, schedulePush, getSyncState, type Product, type ProductSort,
} from "../../../lib/crossborder/products";
import { ensureExampleSeed, isExampleProduct } from "../../../lib/crossborder/example-product";
import { baseCost } from "../../../lib/crossborder/product-model";
import { OpenWithMenu } from "./open-with-menu";
import { EditableName, mktLabel, ProductDetail } from "./product-detail";
import { describeSync, syncNeedsAttention } from "../../../lib/crossborder/sync-status";
import { deleteSample, listSamples } from "../../../lib/crossborder/review-samples";

const TOOL_META: Record<string, { slug: string; name: string }> = {
  profit: { slug: "profit-calculator", name: "利润测算" },
  pricing: { slug: "pricing-calculator", name: "定价" },
  landed: { slug: "landed-cost", name: "到岸成本" },
  acos: { slug: "acos-break-even", name: "ACoS 盈亏平衡" },
  dimweight: { slug: "dimensional-weight", name: "体积重" },
  listing_project: { slug: "", name: "Listing 项目(旧)" },
};

function toolLabel(tool: string | null): string {
  return (tool && TOOL_META[tool]?.name) || "其他";
}
function openHref(it: SavedItem): string | null {
  if (it.tool === "listing_project") return `/crossborder/workbench/listing-doctor?item=${it.item_id}`;
  const meta = it.tool ? TOOL_META[it.tool] : null;
  if (!meta) return null;
  return `/crossborder/tools/${meta.slug}?s=${encodeURIComponent(JSON.stringify(it.payload))}`;
}
function when(ts: number | string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}-${p(d.getDate())}`
    : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function factSummary(p: Product): string | null {
  const facts = p.project?.facts;
  if (!facts?.length) return null;
  const ok = facts.filter((f) => f.status === "confirmed").length;
  return `事实 ${ok}/${facts.length} 已确认`;
}

export default function MyItemsPage() {
  const { user, loading } = useAuth();
  /*
   * 配额与「最近删除」都是**服务端派生**的,跟着本地仓的变更信号重取。
   * 原来各自 useEffect 拉一次、依赖里只有 user —— 删一个档案:
   * 列表当场少一张卡,配额还是旧数、被删的也不出现在「最近删除」里,
   * 非得刷新页面才对得上。见 use-server-view.ts 里的说明。
   */
  // 同步状态跟着本地仓的变更信号刷新 —— persist 与推送完成都会 notify。
  const [sync, setSync] = useState(getSyncState());
  useEffect(() => subscribeProducts(() => setSync(getSyncState())), []);
  const syncStatus = describeSync(sync, !!user);

  const { data: quota } = useServerView<MeFull["archives"]>(
    async () => (await authApi.meFull()).archives, !!user);
  const { data: trash, reload: reloadTrash } = useServerView(
    async () => await itemsApi.deleted(), !!user);

  const [, force] = useReducer((x: number) => x + 1, 0);
  const [hydrated, setHydrated] = useState(false);
  const [legacy, setLegacy] = useState<SavedItem[]>([]);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);   // 拖拽中的独立结果 id
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);


  async function purge(it: DeletedItem) {
    if (!window.confirm(
      `彻底删除「${it.title || "未命名商品"}」?\n\n`
      + "这条档案的全部内容与历史都会被抹掉,之后**再也无法恢复**。")) return;
    setRestoring(it.item_id);
    try { await itemsApi.purge(it.item_id); reloadTrash(); }
    catch (e) { window.alert(e instanceof Error ? e.message : "清除失败,请稍后重试。"); }
    finally { setRestoring(null); }
  }

  async function undelete(it: DeletedItem) {
    setRestoring(it.item_id);
    try {
      await restoreDeleted(it.item_id);
      reloadTrash();
      force();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "恢复失败,请稍后重试。");
    } finally { setRestoring(null); }
  }

  /**
   * 打开档案前先把详情从云端取下来。
   *
   * 档案多的用户在新设备上拿到的是**卡片**(见 Product.stub):records 是空数组、
   * finance 是占位值。直接把它摆进详情抽屉,用户看到的是一份**空档案** ——
   * 那和数据丢了长得一模一样,而且没有任何提示。
   */
  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    const p = listProducts().find((x) => x.id === id);
    if (!p?.stub) return;
    setLoadingDetail(true);
    try { await ensureLoaded(id); } finally { setLoadingDetail(false); force(); }
  }, [force]);
  // 排序偏好记在本机:它是个人习惯,不该跟着档案同步到别的设备
  const [sortBy, setSortBy] = useState<ProductSort>("updated");
  useEffect(() => {
    const saved = window.localStorage.getItem("xm_cb_product_sort") as ProductSort | null;
    if (saved && PRODUCT_SORTS.some((s) => s.key === saved)) setSortBy(saved);
  }, []);
  function changeSort(v: ProductSort) {
    setSortBy(v);
    try { window.localStorage.setItem("xm_cb_product_sort", v); } catch { /* 无痕模式忽略 */ }
  }

  useEffect(() => {
    setHydrated(true);
    return subscribeProducts(force);
  }, []);

  // 登录:开云开关 → 拉云端并本地 → 把本地攒的推上去;顺带拉旧零散记录。
  const loadLegacy = useCallback(async () => {
    setLegacyBusy(true);
    try {
      const d = await itemsApi.list("crossborder");
      setLegacy(d.items.filter((it) => it.tool !== "product"));
    } catch { setLegacy([]); }
    finally { setLegacyBusy(false); }
  }, []);

  useEffect(() => {
    setCloudEnabled(!!user);
    if (loading || !user) return;
    (async () => {
      await reconcileCloud().catch(() => {});
      // 注册用户「我的商品」为空时,注入一份默认示例商品档案(可改名/删除,删了不回灌)。
      ensureExampleSeed();
      schedulePush();
      force();
      loadLegacy();
    })();
  }, [user, loading, loadLegacy]);

  // 与门口「接着算」同一口径:没动过的惰性空档案不陈列 ——
  // 新用户不该在这里看到系统自动生成的「未命名商品」空卡。
  //
  // 判据必须走 isTouched:详情还没从云端取下来的档案(存根)records 是空数组,
  // 直接读数组会把一份有十条记录的老档案判成空档案而不陈列 ——
  // 用户看到的是「老商品不见了」,而且没有任何报错。
  const products = hydrated ? sortProducts(listProducts().filter(isTouched), sortBy) : [];

  async function openProduct(p: Product, slug: string) {
    markOpened(p.stableId);
    // 切成当前商品之前必须补齐 —— 各工具会直接读它的财务模型,
    // 而存根的财务模型是默认值:用户会看到自己填过的成本变回默认。
    if (p.stub) await ensureLoaded(p.id);
    setCurrent(p.id);
    window.location.href = slug;
  }
  // 深度研究的上下文入口:切为当前商品再进启动页,名称/ASIN/站点/竞品自动带入。
  async function research(p: Product) {
    // 存根的竞品/事实库是占位值,不补齐就带着一份空上下文进启动页
    if (p.stub) await ensureLoaded(p.id).catch(() => { /* 拉不到就照走,启动页自己会提示 */ });
    setCurrent(p.id);
    window.location.href = "/crossborder/research/product-insight/?from=product";
  }
  function rename(p: Product, name: string) {
    renameProduct(p.id, name, true);   // 用户亲手命名 → 从「独立结果」转正为商品档案
    if (user) schedulePush();
  }
  async function remove(p: Product) {
    // 存根读 p.records 会说成「0 条记录」—— 十条记录的档案被这么一说,
    // 用户会放心删掉。计数必须走 recordCount。
    /*
     * 评论样本存在**服务端**,不在这条本地档案里 —— 删档案不连带清掉的话:
     * 用户删了档案、重新采集同一个商品,旧的样本批次会按 externalId+marketplace
     * 又挂回来。实测(2026-08-02):删掉重采之后仍显示「3 批 · 共 9 条」,
     * 而他以为自己是从零开始的。
     * 所以先数清楚、在确认框里说明,再一起删。
     */
    let samples: Awaited<ReturnType<typeof listSamples>> = [];
    try { samples = await listSamples(p); } catch { /* 数不出来就不提,不拦着删 */ }
    const extra = samples.length
      ? `\n\n同时会删掉服务端保存的 ${samples.length} 批评论样本(共 ${
          samples.reduce((n, x) => n + x.reviewCount, 0)} 条)—— 不可恢复。`
      : "";
    if (!window.confirm(
      `删除商品「${p.name.trim() || "未命名商品"}」及其名下 ${recordCount(p)} 条记录?${extra}`)) return;
    if (p.cloudId) itemsApi.remove(p.cloudId).catch(() => {});
    // 样本删失败不拦着档案删除 —— 但要让它有机会删掉,而不是从来不删
    await Promise.allSettled(samples.map((x) => deleteSample(x.batchId)));
    removeProduct(p.id);
    setDetailId(null);
  }
  async function doMergeInto(srcId: string, targetId: string) {
    const src = products.find((x) => x.id === srcId);
    const tgt = products.find((x) => x.id === targetId);
    if (!src || !tgt || srcId === targetId) return;
    if (!window.confirm(`把「${src.name.trim() || "独立结果"}」并入「${tgt.name.trim() || "未命名商品"}」?记录与版本都会保留。`)) return;
    // 两边都得是完整档案 —— 存根的内容是占位值,合并会把真内容丢掉
    // 并顺手删掉云端那份(mergeProducts 里有守卫,这里负责先补齐)
    if (src.stub || tgt.stub) {
      await Promise.all([src.stub ? ensureLoaded(src.id) : null, tgt.stub ? ensureLoaded(tgt.id) : null]);
    }
    if (!mergeProducts(srcId, targetId)) {
      window.alert("合并没能完成 —— 档案详情还没取下来,请稍后重试。");
      return;
    }
    if (user) schedulePush();
    setMergeSource(null); setDragId(null);
  }
  function doMerge(targetId: string) { if (mergeSource) doMergeInto(mergeSource, targetId); }

  const docs = products.filter((p) => !isLoose(p));      // 商品档案
  const loose = products.filter((p) => isLoose(p));      // 独立结果 · 散记录


  function card(p: Product, looseCard: boolean) {
    /*
     * 存根的 records/rivals 是空数组(详情还没从云端取下来)。
     * 直接读它们,一份有十条记录的老档案在新设备上会显示成「还没有记录」、
     * 竞品不显示、报告计 0 —— 列表判据修过了(isTouched),卡片正文没修,
     * 用户看到的还是「数据丢了」。计数走 stubCounts。
     */
    const n = recordCount(p);
    const stubRivals = p.stub ? (p.stubCounts?.rivals ?? 0) : (p.rivals?.length ?? 0);
    const facts = factSummary(p);
    const researches = (p.records ?? []).filter((r) => r.tool === "research");
    const voices = (p.records ?? []).filter((r) => r.tool === "voice");
    const isExample = isExampleProduct(p);
    const researchCount = researches.length + (isExample ? 1 : 0);
    const voiceCount = voices.length + (isExample ? 1 : 0);
    const filled = p.finance.updatedAt > 0;
    const toolName = TOOL_META[p.records?.[0]?.tool ?? ""]?.name;
    const topTag = looseCard
      ? (toolName ?? "散记录")
      : (mktLabel(p.marketplace) || toolName || "商品档案");   // 未设站点的档案不显示空标签
    // 只能并入「商品档案」:合并中(点选)或拖拽中,doc 卡才是可落点的目标。
    const isMergeTarget = !!mergeSource && mergeSource !== p.id && !looseCard;
    const isDropTarget = !!dragId && dragId !== p.id && !looseCard;
    return (
      <div className={`my-card is-clickable${looseCard ? " is-loose" : ""}${isDropTarget ? " is-drop" : ""}${isExample ? " is-example" : ""}`}
        key={p.id} role="button" tabIndex={0}
        draggable={looseCard || undefined}
        onDragStart={looseCard ? () => setDragId(p.id) : undefined}
        onDragEnd={looseCard ? () => setDragId(null) : undefined}
        onDragOver={isDropTarget ? (e) => e.preventDefault() : undefined}
        onDrop={isDropTarget ? () => doMergeInto(dragId as string, p.id) : undefined}
        onClick={() => void openDetail(p.id)}
        onKeyDown={(e) => { if (e.key === "Enter") void openDetail(p.id); }}>
        <div className="my-card-top">
          <span className="my-tool">{topTag}</span>
          {isExample && <span className="my-example">示例</span>}
          <span className="my-when">{when(p.updatedAt)}</span>
        </div>
        {isExample && (
          <p className="my-example-note">
            这是一份<b>示例商品档案</b> —— 带你看看平台事实与口碑样本、财务模型、事实库、工作台快照和研究报告在这里怎么用。
          </p>
        )}
        <EditableName value={p.name} onSave={(name) => rename(p, name)} />
        {filled && (
          <div className="my-finance">售价 ${p.finance.price} · 单件固定成本 ${baseCost(p.finance).toFixed(2)}</div>
        )}
        <div className="my-stats">
          <span>{n ? `${n} 条记录` : "还没有记录"}</span>
          {facts && <span>{facts}</span>}
          {researchCount > 0 && <span>研究报告 {researchCount} 份{isExample ? " · 含示例" : ""}</span>}
          {voiceCount > 0 && <span>用户声音报告 {voiceCount} 份{isExample ? " · 含示例" : ""}</span>}
          {stubRivals > 0 && <span>竞品 {stubRivals} 个</span>}
          <span>{p.cloudId && user ? "云端" : "本机"}</span>
        </div>
        {isMergeTarget ? (
          <div className="my-card-actions">
            <button className="my-act my-merge-target" onClick={(e) => { e.stopPropagation(); doMerge(p.id); }}>
              <GitMerge size={13} /> 并入此商品
            </button>
          </div>
        ) : (
          <div className="my-card-actions">
            <OpenWithMenu compact onOpen={(slug) => openProduct(p, slug)} />
            {looseCard && docs.length > 0 && (
              <button className={`my-act${mergeSource === p.id ? " on" : ""}`}
                onClick={(e) => { e.stopPropagation(); setMergeSource(mergeSource === p.id ? null : p.id); }}>
                <GitMerge size={13} /> {mergeSource === p.id ? "取消" : "并入商品档案"}
              </button>
            )}
            {!looseCard && products.length > 1 && (
              <button className={`my-act${mergeSource === p.id ? " on" : ""}`}
                onClick={(e) => { e.stopPropagation(); setMergeSource(mergeSource === p.id ? null : p.id); }}>
                <GitMerge size={13} /> {mergeSource === p.id ? "取消合并" : "合并"}
              </button>
            )}
            {looseCard && <span className="my-open-hint">起名即转成商品档案 →</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-col">
      <SiteHeader active="crossborder" />
      <main className="my-wrap">
        {/* 从工作区点进来的,得能一步走回去 —— 原来只能靠左上角菜单绕 */}
        <BackTo />
        <div className="my-head">
          <span className="my-kicker"><Package size={13} /> 我的商品</span>
          <h1>商品档案</h1>
          <p>一个商品一份档案:平台事实、口碑样本与主题、财务模型、事实库、竞品组和每一次测算都在它名下。打开即回到工具、带着档案继续。</p>
          <div className="my-reports-nav">
            <a href="/crossborder/research/report/"><Telescope size={14} /> 我的研究报告</a>
            <a href="/crossborder/report"><MessagesSquare size={14} /> 我的用户声音报告<em>你上传的评论 · 主题与竞品洞察</em></a>
          </div>
          {!user && !loading && (
            <div className="my-guest-tip">
              档案目前存在本机 · <button onClick={() => setModal(true)}>登录后云端保存、多设备接续</button>
            </div>
          )}
          {/*
            同步状态必须在这里也说一次。
            syncState 里记着「N 项未同步」「本地已满,有丢失风险」「额度已满」,
            而它此前全站只有一个读取方 —— 工具页下拉旁边那枚胶囊。
            于是最该看到的地方看不到:用户就在这一页改名、合并、删除,
            推送失败时页面上没有任何变化,他以为存上了就走了。
            而本地仓现在只是缓存、云端才是主本,没推上去的改动离被冷淘汰只差一步。
          */}
          {user && syncNeedsAttention(syncStatus) && (
            <div className={`my-sync my-sync-${syncStatus.tone}`} role="alert">
              <CloudUpload size={14} />
              <span><b>{syncStatus.label}</b> —— {syncStatus.alarm?.text ?? syncStatus.title}</span>
            </div>
          )}
          {/* 额度就摆在管理档案的地方 —— 用户在这里才会问「我还能建几个」。
              用量来自服务端(云端才是主本),本地条数会因为存根/未同步而对不上。 */}
          {quota && (
            <div className={`my-quota${quota.used >= quota.limit ? " is-full" : ""}`}>
              商品档案 <b>{quota.used}</b>{quota.limit >= quota.proLimit ? " 份" : ` / ${quota.limit.toLocaleString()} 份`}
              {quota.used >= quota.limit
                ? (quota.limit >= quota.proLimit
                  ? <em>已达安全上限 —— 已有档案照常使用与同步。如果这是正常使用,<a href="/feedback">联系我们</a>即可放开。</em>
                  : <em>已达额度 —— 已有档案照常使用与同步,只是不能再新建。删掉一些用不到的,或升级 Pro 不限量。</em>)
                : <em>免费 {quota.freeLimit} 份 · Pro 不限量;云端同步与多设备免费</em>}
            </div>
          )}
        </div>

        {!hydrated || loading ? (
          <div className="my-empty"><Loader2 size={20} className="my-spin" /><span>加载中…</span></div>
        ) : products.length === 0 ? (
          <div className="my-empty">
            <span className="my-empty-ic"><Package size={22} /></span>
            <b>还没有商品档案</b>
            <p>去任意计算器或 Listing 工作台开始,档案会自动建立;用浏览器扩展在商品页采集,确认后也会建成档案。</p>
            <a className="primary-cta" href="/crossborder">去工具中心</a>
          </div>
        ) : (
          <>
            {docs.length > 1 && (
              <div className="my-sort">
                <label htmlFor="my-sort-sel">排序</label>
                <select id="my-sort-sel" value={sortBy}
                  onChange={(e) => changeSort(e.target.value as ProductSort)}>
                  {PRODUCT_SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                {/* 把散记录一并报出来:上面的配额条数的是**全部**保存对象,
                    这里只数档案,两个数摆在同一屏上对不上会被当成 bug(实测)。 */}
                <span>共 {docs.length} 份档案{loose.length > 0 ? ` · ${loose.length} 条散记录` : ""}</span>
              </div>
            )}
            {docs.length > 0 && <div className="my-grid">{docs.map((p) => card(p, false))}</div>}
            {loose.length > 0 && (
              <>
                <div className="my-sec-head my-loose-head">
                  <ClipboardList size={14} /> 独立结果 · 散记录
                  <small>随手测算(可能是测试数据)。给它起个名、或拖到 / 并入某个商品档案,就收编成档案。</small>
                </div>
                <div className="my-grid">{loose.map((p) => card(p, true))}</div>
              </>
            )}
          </>
        )}
        {mergeSource && <p className="my-merge-hint">选择要并入的目标商品档案;并入后记录与版本都会保留在目标名下。</p>}
        {dragId && <p className="my-merge-hint">拖到某个商品档案卡上松手即并入。</p>}

        {user && (legacy.length > 0 || legacyBusy) && (
          <>
            <div className="my-sec-head"><Bookmark size={14} /> 早期零散记录<small>商品实体之前存的,可打开回填;新保存都会进商品档案</small></div>
            {legacyBusy ? (
              <div className="my-empty"><Loader2 size={18} className="my-spin" /></div>
            ) : (
              <div className="my-grid">
                {legacy.map((it) => {
                  const href = openHref(it);
                  return (
                    <div className="my-card" key={it.item_id}>
                      <div className="my-card-top">
                        <span className="my-tool">{toolLabel(it.tool)}</span>
                        <span className="my-when">{when(it.updated_at)}</span>
                      </div>
                      <b className="my-title">{it.title || "未命名"}</b>
                      <div className="my-card-actions">
                        {href
                          ? <a className="my-act" href={href}><ExternalLink size={13} /> 打开</a>
                          : <span className="my-act disabled">无法打开</span>}
                        <button className="my-act danger" onClick={async () => {
                          if (!window.confirm(`删除「${it.title || "未命名"}」?`)) return;
                          await itemsApi.remove(it.item_id).catch(() => {});
                          setLegacy((xs) => xs.filter((x) => x.item_id !== it.item_id));
                        }}><Trash2 size={13} /> 删除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {!!trash?.items.length && (
          <details className="my-trash">
            <summary>最近删除 · {trash.items.length} 份</summary>
            <div className="my-trash-body">
              {trash.items.map((it) => (
                <div className="my-trash-row" key={it.item_id}>
                  <span className="my-trash-name">{it.title || "未命名商品"}</span>
                  <time>{new Date(it.deletedAt).toLocaleString("zh-CN", { hour12: false }).slice(0, 16)} 删除</time>
                  <button disabled={restoring !== null} onClick={() => void undelete(it)}>
                    {restoring === it.item_id ? "恢复中…" : "恢复"}
                  </button>
                  {/* 「删除」只是移进回收站的话,用户就没有真正删干净的手段 ——
                      竞品、成本、评论这类东西不该只能等 30 天。 */}
                  <button className="is-purge" disabled={restoring !== null}
                    onClick={() => void purge(it)}>彻底删除</button>
                </div>
              ))}
              <p className="my-trash-note">
                删除的档案保留 {trash.keepDays} 天,到期自动清空;恢复会占用一个档案名额。
                不想等的可以「彻底删除」—— 那之后就再也找不回来了。
              </p>
            </div>
          </details>
        )}
      </main>
      <SiteFooter />
      {(() => {
        const dp = detailId ? products.find((x) => x.id === detailId) : null;
        return dp ? (
          <ProductDetail
            product={dp}
            loading={loadingDetail}
            isCloud={!!user}
            onClose={() => setDetailId(null)}
            onRename={(name) => rename(dp, name)}
            onResearch={() => void research(dp)}
            onDelete={() => void remove(dp)}
          />
        ) : null;
      })()}
      <LoginModal open={modal} onClose={() => setModal(false)} onDone={() => window.location.reload()} />
    </div>
  );
}
