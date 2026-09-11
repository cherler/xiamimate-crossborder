/**
 * 商品实体仓(Phase B)。
 *
 * 「商品」是一等实体:名字 + 站点 + 财务模型(计算器共享) + 事实库项目(工作台)。
 * 测算快照、洞察结果都挂在商品名下,而不是各存各的、同一商品存成两份。
 *
 * - 本地是权威副本(localStorage,SSR 安全);登录后每个商品镜像为云端一条
 *   saved_item(tool="product"),防抖推送,失败静默。
 * - 旧数据迁移:首次读取时把 xm:product-model / xm:product-project 合并成「商品 1」。
 * - 计算器与工作台不直接感知本仓:product-model.ts / product-facts.ts 的存取函数
 *   已改为委托到当前商品,原有调用方零改动。
 */

import { defaultModel, sanitizeModel, type ProductModel } from "./product-model";
import { type ProductProject } from "./product-facts";
import { MARKET_LABEL } from "./asin";
import { externalIdLabel } from "./platform-preset";
import { ItemConflictError, ItemQuotaError, itemsApi } from "../items";

export type Rival = {
  id: string;
  name: string;
  asin?: string | null;
  price?: number | null;            // 观察价(用户看到时记下的),不是实时价
  rating?: number | null;
  reviews?: number | null;
  note?: string;
  updatedAt: number;
  /**
   * 指向另一份商品档案(它的 stableId)。绑定后:
   *   - 名称/价格/评分**读穿到那份档案的平台事实**,不再是三个月前手抄的死数字
   *   - 口碑洞察的竞品槽能一键取到它的评论样本
   *
   * 可选,而且必须保持可选:你从供应商那儿听说一个对手、在报告里看到一个牌子,
   * 只想记一笔 —— 不该被迫建一份完整档案,把「我的商品」列表撑爆。
   */
  productRef?: string | null;
};

export type Product = {
  id: string;                       // localStorage 主键(每设备一份,非跨设备稳定)
  stableId: string;                 // 业务身份:创建即有、跨设备随 payload 一致、永不变 —— 报告绑它
  name: string;
  marketplace: string;
  asin?: string | null;             // 平台侧身份锚点(用户贴入/插件带回),不据此抓取
  rivals?: Rival[];                 // 竞品组:手录的对照名单,或 productRef 绑定到另一份档案(绑定后读穿对方的平台事实)
  finance: ProductModel;
  project: ProductProject | null;   // 事实库项目;没用过工作台的商品为 null
  records?: ProductRecord[];        // 名下记录(v1:测算快照 = 版本历史)
  named?: boolean;                  // 用户是否亲手命名/新建 —— 区分「商品档案」与「独立结果」(散记录)
  cloudId: string | null;
  updatedAt: number;
  /**
   * 合并进来的旧 stableId。
   * 合并档案时若把 source 的 stableId 丢掉,原本绑在它上面的报告会永久变成孤儿 ——
   * 商品页查不到、报告页显示成"从没绑过",而 report_run.product_ref 还写着那个死 id。
   */
  mergedFrom?: string[];
  /** 上次与云端同步到的版本号。冲突判定只看它,不看时钟。 */
  cloudVersion?: number;
  /**
   * 上一次**成功推上云**时的内容指纹。
   *
   * 它取代了原来的 `dirty` 布尔标记。`dirty` 要求每个改档案的地方都记得设一下,
   * 而实测已经漏了 —— autoLinkRivals 绑定竞品后直接 persist,没标 dirty,
   * 于是那次绑定既不会被推上云,冲突时还会被 mergeWithCloud 当成「我只是没拉」
   * 而被云端静默盖掉。**靠记性的机制迟早会漏,而漏了没有任何症状。**
   *
   * 指纹由 toPayload() 的内容算出,谁改的、改哪都躲不掉;
   * 也不会自激 —— 回写 cloudVersion/pushedHash 不进 payload,指纹不变。
   */
  pushedHash?: string;
  /** 扩展采集到的平台事实。没用过扩展的商品为 undefined。 */
  platform?: PlatformFacts;
  /**
   * **详情还没从云端取下来。**
   *
   * 本地是缓存、云端是主本之后,档案多的用户在新设备上只会先拿到卡片。
   * 这个标记存在的唯一目的是让「还没加载」和「本来就没有」**不可能被搞混** ——
   * 存根的 records 是空数组、finance 是默认值,任何直接读它们的地方
   * 都会得出一个自信的错答案:档案从「我的商品」里消失、竞品绑定被判为无、
   * 报告认领不到它。
   *
   * 所以:**读内容之前先 ensureLoaded**,写聚合判断时用 isTouched/recordCount
   * 这类明确处理过存根的函数,别直接摸 p.records。
   */
  stub?: true;
  /** 存根的计数事实(来自云端卡片)。有了它,列表判断不必先加载详情。 */
  stubCounts?: { records: number; rivals: number; hasProject: boolean };
};

/** 已删除档案的墓碑:云端删除可能失败(离线),没有它 reconcile 会把删掉的又收回来。 */
/**
 * 平台侧事实:浏览器扩展从商品页采集的公开信息。
 *
 * 与 finance **严格分开**。这两类数据长得像但性质相反:
 *   platform = 平台上摆着的客观事实,可以被下一次采集覆盖;
 *   finance  = 用户自己填的经营判断(成本、目标净利率),采集永远不能碰。
 * 混在一起的话,一次「更新采集」就会把用户填了半天的测算前提冲掉。
 */
export type PlatformFacts = {
  title?: string;
  brand?: string;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  categoryPath?: string;
  mainImage?: string;
  sellerName?: string;
  fulfillmentType?: string;
  bsr?: string;
  firstAvailable?: string;
  /** 累计已售件数。TikTok 独有 —— 亚马逊不公开销量,所以亚马逊档案里恒为空。 */
  soldCount?: number;
  sourceUrl?: string;
  /** 采集时间。平台事实会过期 —— 三个月前的价格不该被当成现价用。 */
  capturedAt: number;
  adapterVersion?: string;
};

export type Tombstone = { cloudId: string | null; stableId: string; at: number };

type Store = { currentId: string; products: Product[]; tombstones?: Tombstone[] };

const KEY = "xm:products:v1";
const LEGACY_MODEL_KEY = "xm:product-model";
const LEGACY_PROJECT_KEY = "xm:product-project";

let cache: Store | null = null;
const listeners = new Set<() => void>();

/**
 * 通知订阅者。**推迟到当前这一轮渲染之后**。
 *
 * 原来是同步调的，而 readStore() 在发现旧数据时会顺手 persist() —— 于是：
 *
 *   ContinueStrip 渲染中调 currentProduct()
 *     → readStore() → 迁移 → persist() → notify()
 *     → 同步调用所有订阅者的 setState（其中有 AssessCard）
 *
 * React 报「Cannot update a component (AssessCard) while rendering a different
 * component (ContinueStrip)」。真正的毛病是**读操作带了写副作用**，
 * 但改 readStore 的影响面大；推迟通知能一次盖住所有「渲染中触发写」的路径，
 * 而对正常的写操作只差一个微任务。
 *
 * 用 queueMicrotask 不用 setTimeout：后者会跨过一次绘制，
 * 表现是保存之后界面要闪一下才更新。
 */
let pending = false;
function notify() {
  if (pending) return;          // 一轮里写多次只通知一次
  pending = true;
  queueMicrotask(() => {
    pending = false;
    for (const l of listeners) l();
  });
}
export function subscribeProducts(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function newId() { return "prod_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function newStableId() { return "pid_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 11); }

function blankProduct(name = ""): Product {
  // 市场默认留空 —— 不主动替用户填「亚马逊美国」;做研究/舆情/Listing 时再由用户/上下文设。
  return { id: newId(), stableId: newStableId(), name, marketplace: "", finance: defaultModel(), project: null, named: !!name.trim(), cloudId: null, updatedAt: Date.now() };
}

/**
 * 这个商品是不是 ref 指向的那个 —— 含被合并进来的历史 stableId。
 * 报告绑的是 stableId;合并后必须继续认得旧 id,否则报告与档案就断链了。
 */
export function ownsRef(p: Product, ref: string | null | undefined): boolean {
  if (!ref) return false;
  return p.stableId === ref || (p.mergedFrom ?? []).includes(ref);
}

/**
 * 落盘。
 *
 * 这里原来是 `catch { /* quota *\/ }` —— **静默数据丢失**,比静默错值更狠一档。
 *
 * 机制:`cache = s` 在写盘之前,所以配额满之后界面照常显示「已保存」,
 * 而 localStorage 里还是旧的。又因为写的是**整仓**,一旦满了就不只是新建商品 ——
 * 改成本、加测算记录、重命名,全部静默失效。用户干一下午,关掉标签页,全没了。
 *
 * 现在:
 *  1. 先清掉过期的扫描缓存再重试一次 —— 5MB 是整个站点共用的,
 *     真正占地方的往往是那些带 TTL、早就该走的缓存,不是用户的档案。
 *  2. 还是不行就**如实报**(localFull),界面挂持久警示。
 *  3. **不回滚 cache** —— 回滚等于当着用户的面把他刚做的改动抹掉。
 *     内存里这份是他的劳动成果,留着,并立刻推云端:
 *     云端就是这时候的逃生口,推上去了数据就是安全的。
 */
function persist(s: Store) {
  cache = s;
  if (typeof window !== "undefined") {
    if (!writeStore(s)) {
      reclaimExpiredCaches();
      // 再腾不出来就把冷档案的详情卸掉(它们在云端有完整副本,随时取得回来)。
      // 顺序是先清垃圾再卸档案 —— 过期缓存本来就该走,档案是用户的东西。
      if (!writeStore(s)) evictColdProducts(true);
      if (writeStore(readStore())) {
        if (syncState.localFull) setSync({ localFull: false });
      } else {
        // 只在状态翻转时打点,否则每次改动都刷一条
        if (!syncState.localFull) setSync({ localFull: true });
        schedulePush();          // 逃生口:本地存不下,至少让云端存着
      }
    } else if (syncState.localFull) {
      setSync({ localFull: false });   // 腾出空间了,把警示撤掉
    }
  }
  /*
   * 自动推云端,**收口在这里**。
   *
   * 原来是每个改动入口自己记得调 schedulePush():writeProductModel 调了、
   * 竞品那几个调了、saveProductRecord 调了 —— 但 autoLinkRivals 就没调。
   * 「靠每个调用方记得」的机制迟早会漏,而漏掉的症状是**这条档案再也不上云**,
   * 悄无声息,直到用户换台设备才发现。
   *
   * 放在 persist 里,凡是落盘的改动都会被推。安全性由 pushAll 里的
   * needsPush() 保证:内容没变就不发请求,所以推送成功后的回写不会转回来。
   */
  schedulePush();
  notify();
}

function writeStore(s: Store): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); return true; }
  catch { return false; }
}

/**
 * 腾地方:只删**过期的、带 TTL 的**缓存,绝不碰用户数据。
 *
 * 判据是内容本身(有 `exp` 字段且已过期),不是键名前缀 —— 键名会变,
 * 而「我自己写着我该走了」这个约定不会。认不出的一律不动:
 * 为了腾空间误删用户的东西,比腾不出空间糟得多。
 */
function reclaimExpiredCaches(): number {
  let freed = 0;
  const now = Date.now();
  const doomed: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || k === KEY) continue;
    const raw = window.localStorage.getItem(k);
    if (!raw || raw.length < 200) continue;         // 小条目腾不出什么,不值得冒险
    try {
      const v = JSON.parse(raw) as { exp?: unknown };
      if (typeof v?.exp === "number" && v.exp < now) { doomed.push(k); freed += raw.length; }
    } catch { /* 不是 JSON,不认得,不动 */ }
  }
  for (const k of doomed) { try { window.localStorage.removeItem(k); } catch { /* ignore */ } }
  return freed;
}

/**
 * 跨标签页失效。
 *
 * 内存 cache 一旦建立就永不过期,而 persist 写的是**整仓**。于是:标签 A 存了一条
 * 测算记录 → 标签 B 的 cache 还是打开时那份 → 在 B 里改个商品名 → 整仓写回 →
 * A 刚存的记录在本地就没了,随后还会被推上云,把云端那份也覆盖掉。全程无提示。
 *
 * storage 事件只在**其它**标签页写入时触发(自己写不会收到),正好用来丢缓存。
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== KEY) return;   // key 为 null = 整个 storage 被清空
    cache = null;
    notify();
  });
}

/** 读仓(带旧数据迁移)。SSR 下返回空仓、不落盘。 */
export function readStore(): Store {
  if (cache) return cache;
  if (typeof window === "undefined") return { currentId: "", products: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (Array.isArray(s.products)) {
        // 迁移:老商品补 stableId —— 已上云的用 cloudId(两设备算出同值、不打架),否则新生成。
        // 同时补 named:有 ASIN/事实/报告、或名字不像自动名 → 算已命名(商品档案);否则独立结果。
        let changed = false;
        for (const p of s.products) {
          if (!p.stableId) { p.stableId = p.cloudId || newStableId(); changed = true; }
          if (p.named === undefined) {
            const hasReport = (p.records ?? []).some((r) => r.tool === "research" || r.tool === "voice");
            p.named = !!(p.asin && p.asin.trim()) || !!p.project || hasReport
              || (!!p.name.trim() && !looksAutoNamed(p.name));
            changed = true;
          }
        }
        cache = s;
        // 迁移写失败不致命(下次读还会再补一遍),但仍要如实标 —— 它是「盘已经满了」的第一个信号,
        // 而这时用户往往还没开始干活,提前告诉他比等他白干一下午强。
        if (changed && !writeStore(s) && !syncState.localFull) setSync({ localFull: true });
        return s;
      }
    }
  } catch { /* fallthrough to migration */ }

  // 迁移:把旧的单份模型/项目合并成第一个商品。
  const s: Store = { currentId: "", products: [] };
  try {
    const rawModel = window.localStorage.getItem(LEGACY_MODEL_KEY);
    const rawProject = window.localStorage.getItem(LEGACY_PROJECT_KEY);
    if (rawModel || rawProject) {
      const p = blankProduct();
      if (rawModel) p.finance = sanitizeModel(JSON.parse(rawModel));
      if (rawProject) {
        const proj = JSON.parse(rawProject) as ProductProject;
        p.project = proj;
        p.name = proj?.name || "";
        if (proj?.marketplace) p.marketplace = proj.marketplace;
      }
      s.products.push(p);
      s.currentId = p.id;
      window.localStorage.removeItem(LEGACY_MODEL_KEY);
      window.localStorage.removeItem(LEGACY_PROJECT_KEY);
    }
  } catch { /* 迁移失败就从空仓开始 */ }
  persist(s);
  return s;
}

export function listProducts(): Product[] { return readStore().products; }

/** 选择器/弹窗共用的排序:当前商品置顶,其余按更新时间倒序(最近改动的在前)。 */
/**
 * 「我的商品」列表排序。
 *
 * 不做手工拖拽:拖拽要引入一个持久的 order 字段,而这份数据在两台设备之间镜像 ——
 * 两边各拖一次就得处理顺序冲突,而顺序恰恰是最不值得为它写冲突合并的东西。
 * 用「打开过几次 / 最近打开」这类可自动推导的口径,换设备也一致。
 */
export type ProductSort = "updated" | "opened" | "hits" | "created" | "name";

export const PRODUCT_SORTS: { key: ProductSort; label: string }[] = [
  { key: "updated", label: "最近更新" },
  { key: "opened", label: "最近打开" },
  { key: "hits", label: "打开最多" },
  { key: "created", label: "最早建档" },
  { key: "name", label: "按名称" },
];

export function sortProducts(products: Product[], by: ProductSort): Product[] {
  const xs = [...products];
  switch (by) {
    case "opened": {
      const o = readOpens();
      return xs.sort((a, b) => (o[b.stableId]?.at ?? 0) - (o[a.stableId]?.at ?? 0)
        || b.updatedAt - a.updatedAt);
    }
    case "hits": {
      const o = readOpens();
      return xs.sort((a, b) => (o[b.stableId]?.n ?? 0) - (o[a.stableId]?.n ?? 0)
        || (o[b.stableId]?.at ?? 0) - (o[a.stableId]?.at ?? 0));
    }
    case "created":
      // 没有独立的创建时间字段;stableId 里含创建时序,按它升序即建档先后
      return xs.sort((a, b) => a.stableId.localeCompare(b.stableId));
    case "name":
      return xs.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    default:
      return xs.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/* ---------------- 打开记录(纯本机,不入档案、不上云) ----------------
 *
 * 刻意**不**存进 Product:
 * 1. updateProduct 会无条件 updatedAt=now + dirty=true —— 那样「最近更新」
 *    会退化成「最近打开」,而且光是浏览列表就会不停往云端推。
 * 2. 打开次数本来就是本机的事:你手机上点过几次,和电脑上那份档案无关。
 *    同步它只会平白制造冲突,而顺序是最不值得写冲突合并的东西。
 */

const OPEN_KEY = "xm_cb_product_opens";

type OpenStat = { at: number; n: number };

function readOpens(): Record<string, OpenStat> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(OPEN_KEY) || "{}") as Record<string, OpenStat>;
  } catch { return {}; }
}

/** 记一次打开。排序用的「最近打开 / 打开最多」全靠它。 */
export function markOpened(stableId: string) {
  if (typeof window === "undefined" || !stableId) return;
  const all = readOpens();
  const cur = all[stableId] ?? { at: 0, n: 0 };
  all[stableId] = { at: Date.now(), n: cur.n + 1 };
  try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(all)); } catch { /* 配额满了不影响主流程 */ }
}

export function sortForPicker(products: Product[], currentId: string | null | undefined): Product[] {
  return [...products].sort((a, b) => {
    if (currentId) { if (a.id === currentId) return -1; if (b.id === currentId) return 1; }
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * 五个计算器(利润/定价/落地/广告/体积重/保本)共用同一份财务模型 —— 故它们的星标
 * (=事实依据)是全组唯一,而非每工具一个。工作台工具各自独立成组。
 */
export const FINANCE_TOOLS = new Set(["profit", "pricing", "landed", "acos", "dimweight", "breakeven"]);
function starGroup(tool: string): string { return FINANCE_TOOLS.has(tool) ? "__finance__" : tool; }

export function currentProduct(): Product | null {
  const s = readStore();
  return s.products.find((p) => p.id === s.currentId) ?? s.products[0] ?? null;
}

/** 取当前商品,没有就建一个(首次使用任何工具时惰性创建)。 */
export function ensureCurrent(): Product {
  const s = readStore();
  const cur = s.products.find((p) => p.id === s.currentId) ?? s.products[0];
  if (cur) { if (s.currentId !== cur.id) persist({ ...s, currentId: cur.id }); return cur; }
  const p = blankProduct();
  persist({ currentId: p.id, products: [p] });
  return p;
}

export function setCurrent(id: string) {
  const s = readStore();
  if (s.products.some((p) => p.id === id)) persist({ ...s, currentId: id });
}

export function createProduct(name: string): Product {
  const s = readStore();
  const p = blankProduct(name.trim());
  persist({ currentId: p.id, products: [...s.products, p] });
  return p;
}

/** 整份导入一个已构建好的商品(示例档案注入用)。同 stableId 已存在则不重复注入。 */
export function importProduct(p: Product): Product {
  const s = readStore();
  const exist = s.products.find((x) => x.stableId === p.stableId);
  if (exist) return exist;
  persist({ currentId: s.currentId || p.id, products: [...s.products, p] });
  return p;
}

/** 新建一个「独立结果」(散记录)并置为当前:给了名也不算命名(named=false),留待日后收编成档案。 */
export function createLooseProduct(name: string): Product {
  const s = readStore();
  const p: Product = { ...blankProduct(name.trim()), named: false };
  persist({ currentId: p.id, products: [...s.products, p] });
  return p;
}

/**
 * 各来源的中文标签 —— 给自动建档的商品起「来源 · 时间」默认名,替代满屏「未命名商品」。
 * key 与工具 id / 报告 kind 对齐(profit/pricing/… / voice / research)。
 */
export const ORIGIN_LABEL: Record<string, string> = {
  profit: "利润测算",
  pricing: "定价测算",
  landed: "落地成本",
  acos: "广告测算",
  dimweight: "体积重",
  breakeven: "保本测算",
  listing: "Listing",
  voice: "用户声音报告",
  voice_theme: "评论主题分析",
  service: "客服回复",
  research: "深度研究",
  ident: "链接建档",
};

function nameStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 生成默认商品名,永不为空:有明确对象(研究对象名 / 舆情商品背景 / 项目名)就用它,
 * 否则退回「来源 · 时间」。规则见讨论稿「命名主题优先」。
 */
export function defaultProductName(origin: string, subject?: string | null): string {
  const s = (subject || "").trim();
  if (s) return s.slice(0, 60);
  return `${ORIGIN_LABEL[origin] || "商品"} · ${nameStamp()}`;
}

/** 名字是否像工具自动起的「来源 · MM-DD HH:mm」—— 迁移时据此判断老商品是否真被用户命名过。 */
function looksAutoNamed(name: string): boolean {
  const labels = Object.values(ORIGIN_LABEL).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^(${labels.join("|")}|商品) · \\d{2}-\\d{2} \\d{2}:\\d{2}$`).test(name.trim());
}

/**
 * 独立结果(散记录):只有测算记录、无 ASIN / 未用工作台(事实库)/ 无舆情或研究报告、
 * 且用户没亲手命名 —— 就是一次随手测算,不该当成「商品档案」摆出来。
 * 加 ASIN / 生成报告 / 用工作台 / 起名任一,即自动转正为商品档案。
 */
export function isLoose(p: Product): boolean {
  const hasReport = (p.records ?? []).some((r) => r.tool === "research" || r.tool === "voice");
  return !p.named && !(p.asin && p.asin.trim()) && !p.project && !hasReport;
}

/**
 * 按名字取商品实体,没有就新建 —— 舆情/研究启动时用,保证报告「有档可挂、能溯源」。
 * 同名(去空白后精确匹配)复用,不造重复档案;命中后置为当前商品。
 */
/** 商品的展示身份:名 @ 市场(ASIN)—— 同名不同市场靠这个区分,别只显示名字。 */
export function productLabel(p: Pick<Product, "name" | "marketplace" | "asin">): string {
  const name = p.name.trim() || "未命名商品";
  const mkt = p.marketplace ? (MARKET_LABEL[p.marketplace] || p.marketplace) : "";   // 未设站点则不加「@ 市场」
  const asin = p.asin?.trim();
  const base = mkt ? `${name} @ ${mkt}` : name;
  return asin ? `${base}（${asin}）` : base;
}

/**
 * 组合唯一键(用户定):有 ASIN 用「asin|市场」(平台上全球唯一、最准),
 * 否则「名|市场」。同名不同市场天然是两个档案,组合起来仍唯一。
 */
function productKey(p: { name?: string; marketplace?: string | null; asin?: string | null }): string {
  const mkt = (p.marketplace || "amazon-us").toLowerCase();
  const asin = (p.asin || "").trim().toLowerCase();
  return asin ? `a:${asin}|${mkt}` : `n:${(p.name || "").trim().toLowerCase()}|${mkt}`;
}

/**
 * 按组合键取商品,没有就新建 —— 舆情/研究启动时用,保证报告「有档可挂、能溯源」。
 * 命中(同 名+市场 或 ASIN+市场)复用、不造重复档案;命中后置为当前商品。
 */
export function findOrCreateProduct(input: { name: string; marketplace?: string | null; asin?: string | null }): Product {
  const name = input.name.trim();
  if (name || input.asin) {
    const key = productKey(input);
    const s = readStore();
    const hit = s.products.find((p) => productKey(p) === key);
    if (hit) {
      /*
       * 命中已有档案时**回填站点** —— 只补空,不覆盖用户已选的。
       *
       * 站点决定佣金口径、字段说法和该算哪几块成本(如 TikTok 的达人佣金)。
       * 而它此前只在**新建**档案时写入:一条早先建好的空站点档案,
       * 后来被深度研究或插件采集绑上来,站点仍然是空的 ——
       * 用户在计算器里永远看不到平台预设,而系统其实早就知道答案了。
       */
      if (!hit.marketplace && input.marketplace) {
        updateProduct(hit.id, (x) => ({ ...x, marketplace: input.marketplace! }));
      }
      if (s.currentId !== hit.id) persist({ ...s, currentId: hit.id });
      return readStore().products.find((x) => x.id === hit.id) ?? hit;
    }
  }
  const p = blankProduct(name);
  if (input.marketplace) p.marketplace = input.marketplace;
  if (input.asin?.trim()) p.asin = input.asin.trim();
  const s = readStore();
  persist({ currentId: p.id, products: [...s.products, p] });
  return p;
}

/**
 * 只查不建:按组合键(名+市场 或 ASIN+市场)找现有商品,没有返回 null。
 * 扫描确认时探测「同商品是否已有报告」用 —— 不能像 findOrCreateProduct 那样
 * 提前造档,否则用户只是扫一眼没启动也会落一个空档案。
 */
export function findProduct(input: { name?: string; marketplace?: string | null; asin?: string | null }): Product | null {
  if (!input.name?.trim() && !input.asin?.trim()) return null;
  const key = productKey(input);
  return readStore().products.find((p) => productKey(p) === key) ?? null;
}

/** 旧签名:仅按名字(默认市场)—— 保留给只有名字的调用方。 */
export function findOrCreateProductByName(name: string): Product {
  return findOrCreateProduct({ name });
}

/**
 * 工作台「保存本次快照」= 在当前商品名下记一个版本(与计算器同一套语义)。
 * values 里约定带一个可读的 `summary` 字段,商品档案里直接展开就能看到当时的输入/输出。
 * 无名商品自动起「来源 · 时间」名;登录后随商品档案防抖上云。
 */
export function saveProductRecord(tool: string, label: string, values: Record<string, unknown>): Product {
  const p = ensureCurrent();
  if (!p.name.trim()) renameProduct(p.id, defaultProductName(tool));
  addRecord(p.id, { tool, label, values });
  if (cloudEnabled) schedulePush();
  return currentProduct() ?? p;
}

/**
 * 当前商品的一句话背景:商品名 + 已确认事实(材质/尺寸/容量…)。
 * 喂给工作台的「商品背景」字段 —— 让舆情、客服 Copilot 天然带上商品档案的上下文,
 * 不用每次手打。事实库空着就只给商品名。
 */
export function productContextSummary(p: Product | null = currentProduct()): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.name.trim()) parts.push(p.name.trim());
  const facts = (p.project?.facts ?? []).filter((f) => f.status === "confirmed" && f.value.trim());
  for (const f of facts.slice(0, 6)) parts.push(`${f.label} ${f.value.trim()}`);
  return parts.join(" · ").slice(0, 200);
}

/**
 * 从链接/ASIN 建档(#57 插件 step-0)。同 ASIN + 站点已有档案则直接切过去,
 * 不造重复商品;建档来源记进名下记录(provenance),插件后续填充对着同一锚点。
 */
export function createProductFromRef(ref: { asin: string; marketplace: string; url: string | null }): { product: Product; existed: boolean } {
  const s = readStore();
  const hit = s.products.find((p) => p.asin === ref.asin && p.marketplace === ref.marketplace);
  if (hit) {
    persist({ ...s, currentId: hit.id });
    return { product: hit, existed: true };
  }
  // 「ASIN」是亚马逊的词 —— TikTok 商品建成「ASIN 1731873437826453780」会像是认错了平台
  const p: Product = { ...blankProduct(""), name: `${externalIdLabel(ref.marketplace)} ${ref.asin}`,
                       marketplace: ref.marketplace, asin: ref.asin };
  persist({ currentId: p.id, products: [...s.products, p] });
  addRecord(p.id, {
    tool: "ident", label: "链接/ASIN 建档",
    values: { asin: ref.asin, marketplace: ref.marketplace, url: ref.url, source: "user_paste" },
  });
  return { product: readStore().products.find((x) => x.id === p.id) ?? p, existed: false };
}

/** byUser=true(用户亲手改名)会把商品标记为已命名 → 从「独立结果」转正为「商品档案」。
 *  工具保存时的自动起名(来源·时间)传 false,不算命名,保持独立结果。 */
export function renameProduct(id: string, name: string, byUser = false) {
  updateProduct(id, (p) => ({ ...p, name: name.trim(), named: byUser ? !!name.trim() : p.named }));
}

export function removeProduct(id: string) {
  const s = readStore();
  const gone = s.products.find((p) => p.id === id);
  const rest = s.products.filter((p) => p.id !== id);
  /**
   * 记墓碑。
   *
   * 云端删除是调用方各自补的、且都吞掉失败;而 reconcileCloud 遍历的是云端条目 ——
   * 云端没删掉的话,下次拉取就把这条"本地没有的"当新档案收回来,**删除自动撤销**。
   * 墓碑让 reconcile 认得"这是我删的,别再捡回来",同时给 pushAll 一个重试删除的凭据。
   */
  const tombstones = gone
    ? [...(s.tombstones ?? []).filter((t) => t.stableId !== gone.stableId),
       { cloudId: gone.cloudId, stableId: gone.stableId, at: Date.now() }].slice(-200)
    : (s.tombstones ?? []);
  persist({ currentId: s.currentId === id ? (rest[0]?.id ?? "") : s.currentId,
            products: rest, tombstones });
}

export function updateProduct(id: string, fn: (p: Product) => Product) {
  const s = readStore();
  const target = s.products.find((p) => p.id === id);
  /*
   * **绝不往存根里写。**
   *
   * 存根的 records/rivals/finance 是占位值(见 Product.stub)。往上面写等于
   * 拿占位值当基础做变换:加一条记录会得到「只有这一条」的档案,
   * 而它又因为 stub 标记不会被推上云,等到 ensureLoaded 从云端补齐时
   * 这次写入直接消失 —— 全程无提示。
   *
   * 所以推迟到补齐之后再写。fn 是对档案的纯变换,在补齐后的档案上跑
   * 才是它本来的语义;写入不丢,只是晚一拍。
   */
  if (target?.stub) {
    void ensureLoaded(id)
      .then((p) => {
        if (p && !p.stub) { updateProduct(id, fn); return; }
        // 补齐没成功(离线/云端 5xx):写入没地方落,如实报出来
        if (!syncState.localFull) setSync({ failed: syncState.failed + 1, lastError: "档案详情没取下来,这次改动还没保存" });
      })
      .catch((e) => {
        /*
         * 拒绝必须接住。原来是 `void ensureLoaded(...).then(...)` ——
         * 离线时 itemsApi.get 抛错,这笔写入连同错误一起蒸发:
         * 用户点了「保存本次快照」、改了成本、改了名字,界面零提示,
         * 而注释里承诺的是「写入不丢,只是晚一拍」。失败分支不兑现就是空话。
         */
        setSync({ failed: syncState.failed + 1, lastError: errText(e) });
      });
    return;
  }
  // 不再手工标 dirty:「有没有未推的改动」由内容指纹算(见 Product.pushedHash)。
  const products = s.products.map((p) => (p.id === id ? { ...fn(p), updatedAt: Date.now() } : p));
  persist({ ...s, products });
}

/* ---------------- 给 product-model / product-facts 的适配点 ---------------- */

export function currentFinance(): ProductModel | null {
  return currentProduct()?.finance ?? null;
}
export function writeCurrentFinance(m: ProductModel) {
  const p = ensureCurrent();
  updateProduct(p.id, (x) => ({ ...x, finance: m }));
}
export function resetCurrentFinance() {
  const p = currentProduct();
  if (p) updateProduct(p.id, (x) => ({ ...x, finance: defaultModel() }));
}

export function currentProject(): ProductProject | null {
  return currentProduct()?.project ?? null;
}
export function writeCurrentProject(proj: ProductProject) {
  const p = ensureCurrent();
  updateProduct(p.id, (x) => ({
    ...x,
    project: proj,
    // 项目里的名字/站点是用户亲手确认的,商品实体跟着走。
    name: proj.name?.trim() ? proj.name.trim() : x.name,
    marketplace: proj.marketplace || x.marketplace,
  }));
}
export function clearCurrentProject() {
  const p = currentProduct();
  if (p) updateProduct(p.id, (x) => ({ ...x, project: null }));
}

/* ---------------- 云端镜像(登录后调用;失败静默) ---------------- */

/*
 * 上云的内容。
 *
 * platform / mergedFrom / named 是**后来补进来的**,补之前它们只活在本机:
 *   - platform(扩展采集的平台事实):换台设备打开就没有,而且不报错;
 *   - mergedFrom:丢了它,原本绑在被合并那个 stableId 上的报告会永久变成孤儿
 *     (Product.mergedFrom 的注释里写着这件事,但字段本身从来没上过云);
 *   - named:决定这份档案算「商品档案」还是「散记录」,影响它在列表里露不露面。
 *
 * 本地降级成缓存之后这三样必须上云 —— 否则一旦卸载本地详情,
 * 它们就**彻底没了**,云端根本没有可以取回的副本。
 */
type CloudPayload = {
  stableId?: string; name: string; marketplace: string; asin?: string | null; finance: ProductModel;
  project: ProductProject | null; records?: ProductRecord[]; rivals?: Rival[];
  platform?: PlatformFacts; mergedFrom?: string[]; named?: boolean;
};

/**
 * 记录并集(按 id 去重,新的覆盖旧的)。
 *
 * 原来 reconcile 是整条记录 last-write-wins:`records: pay.records ?? p.records`,
 * 覆盖而非合并。笔记本上跑的研究记录、手机上存的测算快照,谁后同步谁把对方抹掉,
 * 而且不报错。记录本来就是「只增不改」的追加流,天然可以并集。
 */
function unionRecords(a: ProductRecord[] = [], b: ProductRecord[] = []): ProductRecord[] {
  const by = new Map<string, ProductRecord>();
  for (const r of [...a, ...b]) {
    const prev = by.get(r.id);
    if (!prev || (r.ts ?? 0) >= (prev.ts ?? 0)) by.set(r.id, { ...prev, ...r });
  }
  return [...by.values()].sort((x, y) => (y.ts ?? 0) - (x.ts ?? 0)).slice(0, RECORD_CAP);
}

/** 竞品并集:按 asin 优先、否则按名字去重。 */
function unionRivals(a: Rival[] = [], b: Rival[] = []): Rival[] {
  const out = [...a];
  for (const r of b) {
    if (!out.some((t) => (r.asin && t.asin === r.asin) || t.name === r.name)) out.push(r);
  }
  return out.slice(0, RIVAL_CAP);
}

/**
 * 本地与云端合并成一条。
 *
 * 标量字段(名字、市场、财务模型、事实库)以 `preferLocal` 那一侧为准 —— 它们是
 * 「整体替换」语义,没法字段级三方合并;数组字段一律取并集,因为它们是追加流,
 * 丢一条就是丢一条。
 */
function mergeWithCloud(local: Product, pay: CloudPayload, preferLocal: boolean): Product {
  const win = preferLocal
    ? { name: local.name, marketplace: local.marketplace, asin: local.asin ?? null,
        finance: local.finance, project: local.project }
    : { name: pay.name || local.name, marketplace: pay.marketplace || local.marketplace,
        asin: pay.asin ?? local.asin ?? null,
        finance: sanitizeModel(pay.finance), project: pay.project ?? null };
  return {
    ...local, ...win,
    records: unionRecords(local.records, pay.records),
    rivals: unionRivals(local.rivals, pay.rivals),
    /*
     * mergedFrom 永远取**并集**,两边都不能丢。
     * 少一个旧 stableId,原本绑在它上面的报告就永久变成孤儿 ——
     * 商品页查不到、报告页显示成「从没绑过」,而后端 report_run.product_ref
     * 还写着那个死 id。这是不可逆的,所以这里不做取舍。
     */
    mergedFrom: [...new Set([...(local.mergedFrom ?? []), ...(pay.mergedFrom ?? [])])],
    // 平台事实按采集时间新者胜 —— 它整块来自一次采集,混合两次的结果没有意义
    platform: pickNewerFacts(local.platform, pay.platform),
    // 只要有一边认为它是正经档案,就是 —— 反过来会让它从「我的商品」里消失
    named: local.named || pay.named,
  };
}

function pickNewerFacts(a?: PlatformFacts, b?: PlatformFacts): PlatformFacts | undefined {
  if (!a) return b;
  if (!b) return a;
  return (b.capturedAt ?? 0) > (a.capturedAt ?? 0) ? b : a;
}

/**
 * 列表卡片。**服务端不解析内容**(sql/006 的设计),所以放什么由这里决定。
 *
 * 只放两类东西:身份(显示与匹配需要的)和**计数**。计数不是装饰 ——
 * 「我的商品」要靠它判断这份档案动过没有,没有计数就只能去读 records,
 * 而存根的 records 是空的,结果就是把有内容的老档案判成空档案然后不陈列。
 */
function toSummary(p: Product): Record<string, unknown> {
  return {
    stableId: p.stableId,
    name: p.name,
    marketplace: p.marketplace,
    asin: p.asin ?? null,
    named: !!p.named,
    records: (p.records ?? []).length,
    rivals: (p.rivals ?? []).length,
    hasProject: !!p.project,
  };
}

type CloudSummary = ReturnType<typeof toSummary>;

/**
 * 这份档案「动过」吗 —— 列表陈列与否的判据。
 *
 * 抽成一个函数而不是散在页面里,就是为了让存根这件事只需要在一处处理对。
 * 页面里原来是 `(p.records?.length ?? 0) > 0 || ...`,直接读数组;
 * 存根的数组是空的,于是一份有十条记录的老档案在新设备上**不会出现在列表里**,
 * 而且不报错 —— 用户只会觉得「老商品不见了」。
 */
export function isTouched(p: Product): boolean {
  if (p.name.trim()) return true;
  if (p.stub) {
    const c = p.stubCounts;
    return !!c && (c.records > 0 || c.rivals > 0 || c.hasProject);
  }
  if ((p.records?.length ?? 0) > 0 || (p.rivals?.length ?? 0) > 0 || p.project) return true;
  /*
   * 财务模型与平台事实也算「动过」。
   *
   * 漏掉它们的后果不是少显示一张卡,而是**一份用户看不见、又删不掉的档案**:
   * 它照样被推上云、照样占额度,但列表按这个判据把它过滤了。
   * 在计算器里填了半天数字却没起名的商品,就正好落在这个缝里。
   *
   * defaultModel() 的 updatedAt 是 0,用户改过才会盖上时间戳 —— 现成的判据。
   */
  if ((p.finance?.updatedAt ?? 0) > 0) return true;
  if (p.platform) return true;
  return false;
}

/** 记录条数。存根读卡片上的计数,不读空数组。 */
export function recordCount(p: Product): number {
  return p.stub ? (p.stubCounts?.records ?? 0) : (p.records ?? []).length;
}

function toPayload(p: Product): Record<string, unknown> {
  return {
    stableId: p.stableId, name: p.name, marketplace: p.marketplace, asin: p.asin ?? null,
    finance: p.finance, project: p.project, records: p.records ?? [], rivals: p.rivals ?? [],
    platform: p.platform, mergedFrom: p.mergedFrom, named: p.named,
  } satisfies CloudPayload;
}

/**
 * 内容指纹 —— 「这条要不要推上云」的唯一判据。
 *
 * djb2 + 长度。不是密码学哈希,也不需要是:它只用来回答「和上次推上去的一样吗」,
 * 猜错的代价是多推一次(无害)或漏推一次。带上长度是为了让最常见的碰撞
 * (改了一个字符)不可能发生。
 */
function payloadHash(p: Product): string {
  const s = JSON.stringify(toPayload(p));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36) + ":" + s.length;
}

/** 没上过云,或内容与上次推上去的不一致 */
function needsPush(p: Product): boolean {
  return !p.cloudId || p.pushedHash !== payloadHash(p);
}

/** 本地有未推上云的改动 —— 合并冲突时据此决定谁优先。 */
export function hasUnpushedChanges(p: Product): boolean { return needsPush(p); }

let cloudEnabled = false;
export function setCloudEnabled(on: boolean) { cloudEnabled = on; }
export function isCloudEnabled() { return cloudEnabled; }

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖把「有改动的商品」推上云。多处挂载也只有一个定时器。 */
export function schedulePush() {
  // 未登录不排推送:排了也只会对每条档案打一串 401,还让定时器空转。
  // (mergeProducts 等几处是无条件调用的,守卫放在这里才收得干净。)
  if (!cloudEnabled) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAll, 1500);
}

/**
 * 同步状态。
 *
 * 原来推送失败是 `catch { 下次改动再试 }` —— 无重试、无提示,而界面上的「云端同步」
 * 胶囊只看"是否登录"。于是满额 / 离线 / token 过期时,用户以为存上了,换台设备才发现
 * 什么都没有(线上真出过:报告绑着一个云端根本不存在的档案)。
 * 这里把失败暴露出来,并自动退避重试。
 */
export type SyncState = {
  pushing: boolean; failed: number; lastError: string | null; at: number;
  /**
   * 云端额度已满。与 failed 分开记,因为**性质完全不同**:
   * failed 是「等一会儿会好」,blocked 是「等到天荒地老也不会好」。
   * 混在一起就会出现那个最坏的组合 —— 永远重试 + 界面写着「正在自动重试」。
   */
  blocked: { limit: number; used: number; upgradable: boolean } | null;
  /** 本地 localStorage 写不进去了。见 persist() 上方的长注释。 */
  localFull: boolean;
};
let syncState: SyncState = {
  pushing: false, failed: 0, lastError: null, at: 0, blocked: null, localFull: false,
};
export function getSyncState(): SyncState { return syncState; }
function setSync(patch: Partial<SyncState>) {
  syncState = { ...syncState, ...patch, at: Date.now() };
  notify();
}

let pushRunning = false;
let retryDelay = 0;

async function pushAll() {
  pushTimer = null;
  // 上一轮还没跑完就再排一次 —— 并发跑会让同一个新档案被 create 两次
  // (cloudId 还没写回,两轮都走 create 分支),云端多出一条永不显示的孤儿。
  if (pushRunning) { schedulePush(); return; }
  pushRunning = true;
  setSync({ pushing: true });
  let failed = 0;
  let lastError: string | null = null;
  let blocked: SyncState["blocked"] = null;
  try {
    const s = readStore();
    // 先补做没删干净的云端删除(离线时删的),否则 reconcile 会把它们捡回来
    for (const t of s.tombstones ?? []) {
      if (!t.cloudId) { dropTombstone(t.stableId); continue; }
      try { await itemsApi.remove(t.cloudId); dropTombstone(t.stableId); }
      catch (e) { if (isNotFound(e)) dropTombstone(t.stableId); else { failed++; lastError = errText(e); } }
    }
    for (const p of readStore().products) {
      /*
       * 只推**变过的**。
       *
       * 原来是无条件遍历全部档案,每轮防抖都对每一条打一个 PATCH ——
       * 200 条档案就是 200 个请求,而其中 199 个内容一个字都没变。
       * 云端上限一旦放开到几千,这就从「浪费」变成「打垮自己」。
       *
       * 这一句同时是 persist() 里那个自动推送的**收敛保证**:
       * 推送成功后的回写只动 cloudVersion/pushedHash,不进 payload,
       * 指纹不变 → 下一轮 needsPush 为假 → 停。否则
       * 「回写→persist→排推送→回写」会转个没完。
       */
      /*
       * 存根一律不推。它的 records/finance 是占位值,推上去就是**把云端
       * 那份真内容抹成空** —— 而云端现在是唯一的主本,抹了就真没了。
       * 这是整个卡片化改造里最危险的一条路径,放在最前面挡住。
       */
      if (p.stub) continue;

      /*
       * 空占位不上云,已经上了的清掉。
       *
       * 打开任意计算器都会惰性创建一份「未命名商品」。它被推上云之后:
       * 额度算它、「我的商品」按 isTouched 过滤掉它、用户于是**看不见也删不掉** ——
       * 攒够 30 个就是一堵清不掉的额度墙。线上已经出现了一条(1/30 却看不到档案)。
       *
       * 空占位按定义没有任何用户内容(无名、无记录、无竞品、无事实库、
       * 财务模型没动过、没采集过平台事实),所以删云端那份不会丢东西。
       * 用户真开始填了,isTouched 立刻为真,下一轮就正常上云。
       */
      if (!isTouched(p)) {
        if (p.cloudId) {
          try {
            await itemsApi.remove(p.cloudId);
            updateProductSilent(p.id, (x) => ({ ...x, cloudId: null, cloudVersion: undefined, pushedHash: undefined }));
          } catch (e) {
            if (isNotFound(e)) {
              updateProductSilent(p.id, (x) => ({ ...x, cloudId: null, cloudVersion: undefined, pushedHash: undefined }));
            }
            // 删不掉不算失败:下一轮再试,它也不影响用户任何操作
          }
        }
        continue;
      }
      if (!needsPush(p)) continue;
      const title = p.name.trim() || "未命名商品";
      try {
        if (p.cloudId) {
          try {
            const r = await itemsApi.update(p.cloudId, {
              title, payload: toPayload(p), summary: toSummary(p), base_version: p.cloudVersion,
            });
            /*
             * 记**被推上去的那份快照**的指纹,不能记 payloadHash(x)。
             *
             * 推的是循环开始时的 toPayload(p),而 x 是**请求回来那一刻**的档案 ——
             * 1.5s 防抖 + 网络往返这段时间里用户又改了一笔(在计算器里连着输数字
             * 是常态),记 hash(x) 就等于宣布「新改动也推过了」:下一轮 needsPush 为假,
             * 云端永远停在旧内容,而胶囊显示「云端同步」。换台设备那笔改动就没了,
             * 冲突合并时本地还会被判成「没改过」而被云端盖掉。
             */
            updateProductSilent(p.id, (x) => ({ ...x, cloudVersion: r.item.version ?? 1, pushedHash: payloadHash(p) }));
          } catch (e) {
            if (e instanceof ItemConflictError) {
              /**
               * 另一台设备在我之后写过。不能直接覆盖(那就等于没做乐观锁),
               * 也不能直接放弃(本地这份是用户刚做的)。按并集合并后带着服务端
               * 的版本号重试一次:数组取并集、标量以本地为准。
               */
              const merged = mergeWithCloud(p, e.current.payload as unknown as CloudPayload, true);
              const r = await itemsApi.update(p.cloudId, {
                title, payload: toPayload(merged), summary: toSummary(merged),
                base_version: e.current.version ?? 1,
              });
              /*
               * 合到**当前**档案上,不能整体替换成 merged。
               *
               * merged 是由「循环开始时的快照」与云端算出来的;直接 `() => merged`
               * 会把请求在途期间用户做的改动当场回滚 —— 比漏推更狠,是眼看着改的东西
               * 自己变回去。这里拿当前 x 重新与云端并一次(本地优先),
               * 云端的新内容进得来、在途改动也留得住。
               * 指纹仍记我们**实际推上去的**那份,所以 x 若更新,下一轮会自然再推。
               */
              updateProductSilent(p.id, (x) => ({
                ...mergeWithCloud(x, e.current.payload as unknown as CloudPayload, true),
                cloudVersion: r.item.version ?? 1, pushedHash: payloadHash(merged),
              }));
            } else if (isNotFound(e)) {
              // 云端那条被别的设备删了 → PATCH 恒 404,原来会永远静默失败,
              // 这条档案从此只活在这台浏览器里。退回 create 重新上云。
              const r = await itemsApi.create({ module: "crossborder", tool: "product", title,
                payload: toPayload(p), summary: toSummary(p), stable_id: p.stableId });
              updateProductSilent(p.id, (x) => ({ ...x, cloudId: r.item.item_id, cloudVersion: r.item.version ?? 1, pushedHash: payloadHash(p) }));
            } else { throw e; }
          }
        } else {
          const r = await itemsApi.create({ module: "crossborder", tool: "product", title,
            payload: toPayload(p), summary: toSummary(p), stable_id: p.stableId });
          updateProductSilent(p.id, (x) => ({ ...x, cloudId: r.item.item_id, cloudVersion: r.item.version ?? 1, pushedHash: payloadHash(p) }));
        }
      } catch (e) {
        // 额度满是**永久**失败:这一轮剩下的档案全都会撞同一堵墙,
        // 继续试只是白白发几十个必然 409 的请求。记下来,跳出。
        if (e instanceof ItemQuotaError) {
          blocked = { limit: e.limit, used: e.used, upgradable: e.upgradable };
          lastError = e.message;
          break;
        }
        failed++;
        lastError = errText(e);
      }
    }
  } finally {
    pushRunning = false;
    setSync({ pushing: false, failed, lastError, blocked });
  }
  /*
   * 只有**可能自愈**的失败才排重试。
   *
   * 额度满不排 —— 退避封顶 5 分钟,一天就是 288 次注定 409 的请求,
   * 而界面上那句「正在自动重试」会一直挂着骗人。
   * 这种情况要用户动手(删档案或合并),所以停下来、把话说清楚,
   * 等他真的删了一条(那会走 schedulePush)再自然重试。
   */
  if (!failed && !blocked) {
    // 全部推完 = 此刻没有未推改动,可卸的候选最多,也最安全。
    evictColdProducts();
  }
  if (blocked) {
    retryDelay = 0;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  } else if (failed > 0) {
    // 指数退避重试,封顶 5 分钟。离线改完就走的场景全靠它自愈。
    retryDelay = Math.min(retryDelay ? retryDelay * 2 : 5_000, 300_000);
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushAll, retryDelay);
  } else {
    retryDelay = 0;
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function isNotFound(e: unknown): boolean {
  return /(^|\D)404(\D|$)|不存在/.test(errText(e));
}
function dropTombstone(stableId: string) {
  const s = readStore();
  persist({ ...s, tombstones: (s.tombstones ?? []).filter((t) => t.stableId !== stableId) });
}

function updateProductSilent(id: string, fn: (p: Product) => Product) {
  const s = readStore();
  persist({ ...s, products: s.products.map((p) => (p.id === id ? fn(p) : p)) });
}

/** 登录后拉云端商品并入本地:cloudId 相同的以更新时间新者为准;本地没有的收进来。 */
/** 一次拉完整内容的条数。其余走卡片,用时再拉。 */
const EAGER_LIMIT = 30;
/** 卡片翻页的保险丝:一页 200 张,最多翻这么多页(够 10000 份档案)。 */
const MAX_CARD_PAGES = 50;

export async function reconcileCloud(): Promise<void> {
  /*
   * 两段式:**最近 30 份拉完整内容,其余只拉卡片。**
   *
   * 原来是一次 `list(..., 500)` 把全部 payload 拉下来 —— 一份档案十几 KB,
   * 几百份就是几 MB,而客户端还要把它整包写进 5MB 的 localStorage。
   * 档案上限放开之后这条路必炸。
   *
   * 分成两段而不是全部卡片化,是为了**把存根的影响面限死在长尾**:
   * 档案少于 30 份的用户一个存根都不会有,行为与改动前完全一致。
   * 存根是有风险的东西(见 Product.stub),能少造就少造。
   */
  const first = await itemsApi.list("crossborder", "product", EAGER_LIMIT);
  const cards: { item: typeof first.items[number]; summary: CloudSummary }[] = [];
  let cursor = first.next_cursor ?? null;
  for (let page = 0; cursor && page < MAX_CARD_PAGES; page++) {
    const d = await itemsApi.listCards("crossborder", "product", 200, cursor);
    for (const it of d.items) cards.push({ item: it as never, summary: (it.summary ?? {}) as CloudSummary });
    cursor = d.next_cursor ?? null;
  }
  const d = first;
  const s = readStore();
  const tombCloud = new Set((s.tombstones ?? []).map((t) => t.cloudId).filter(Boolean) as string[]);
  const tombStable = new Set((s.tombstones ?? []).map((t) => t.stableId));
  const byCloudId = new Map(s.products.filter((p) => p.cloudId).map((p) => [p.cloudId as string, p]));
  const byStableId = new Map(s.products.filter((p) => p.stableId).map((p) => [p.stableId, p]));
  let products = [...s.products];
  for (const it of d.items) {
    const pay = it.payload as unknown as CloudPayload;
    // 墓碑命中 = 这条是本机删掉的、云端删除还没成功。跳过,别把它捡回来
    // (否则"删了又回来"),交给 pushAll 重试删除。
    if (tombCloud.has(it.item_id) || (pay.stableId && tombStable.has(pay.stableId))) continue;
    const cloudTime = new Date(it.updated_at).getTime() || 0;
    const cloudVersion = it.version ?? 1;
    // 优先按 cloudId 配;P2:同 stableId 也算同一个,避免重复档案。
    const local = byCloudId.get(it.item_id) || (pay.stableId ? byStableId.get(pay.stableId) : undefined);
    if (!local) {
      const adopted: Product = {
        id: newId(), stableId: pay.stableId || it.item_id,
        // 市场留空就留空 —— 不再强塞「亚马逊美国」(否则散记录会莫名显示 @ 亚马逊美国)。
        name: pay.name || it.title || "", marketplace: pay.marketplace || "",
        asin: pay.asin ?? null,
        finance: sanitizeModel(pay.finance), project: pay.project ?? null,
        records: pay.records ?? [],
        rivals: pay.rivals ?? [],
        platform: pay.platform, mergedFrom: pay.mergedFrom, named: pay.named,
        cloudId: it.item_id, cloudVersion, updatedAt: cloudTime,
      };
      // 刚从云端取下来 = 与云端一致,记下指纹,否则会被立刻原样推回去一轮。
      products.push({ ...adopted, pushedHash: payloadHash(adopted) });
    } else {
      /**
       * 冲突判定只看版本号,不看时钟。
       *
       * 原来是 `cloudTime > local.updatedAt` —— 一边服务器时钟、一边客户端时钟。
       * 设备时间慢十分钟的用户,本地恒小于云端,每次同步都被云端盖掉自己未推的改动;
       * 时钟快则反过来,云端的改动永远进不来。两种都不报错,只是悄悄丢数据。
       *
       * `cloudVersion` 是"我上次同步到的是第几版",与任何时钟无关:
       *   云端版本 > 我记的版本 → 云端在我之后被改过,要处理;否则我已是最新。
       * 再用内容指纹区分「我改过没推」(合并,本地优先) 与「我只是没拉」(直接取云端)。
       */
      const cloudAhead = cloudVersion > (local.cloudVersion ?? 0);
      if (cloudAhead) {
        const localAhead = needsPush(local);
        const merged = mergeWithCloud(local, pay, localAhead);
        products = products.map((p) => (p.id === local.id
          ? { ...merged,
              stableId: p.stableId || pay.stableId || it.item_id,
              cloudId: p.cloudId || it.item_id,
              cloudVersion,
              // 本地有未推改动 → 合并结果还得推上去,所以**不**记指纹(留着让 needsPush 为真);
              // 本地本来就是干净的 → 合并结果 == 云端,记下指纹,免得白推一轮。
              pushedHash: localAhead ? undefined : payloadHash(merged),
              updatedAt: Math.max(local.updatedAt, cloudTime) }
          : p));
      }
    }
  }
  // 长尾:只建**存根**。本地已经有的一律不动 —— 卡片没有 payload,
  // 拿它去覆盖一份完整的本地档案就是把内容抹成空。
  const known = new Set(products.map((p) => p.cloudId).filter(Boolean) as string[]);
  const knownStable = new Set(products.map((p) => p.stableId));
  for (const { item, summary } of cards) {
    if (known.has(item.item_id)) continue;
    const stableId = (summary.stableId as string) || item.stable_id || item.item_id;
    if (knownStable.has(stableId) || tombCloud.has(item.item_id) || tombStable.has(stableId)) continue;
    knownStable.add(stableId);
    products.push({
      id: newId(), stableId,
      name: (summary.name as string) || item.title || "",
      marketplace: (summary.marketplace as string) || "",
      asin: (summary.asin as string | null) ?? null,
      named: !!summary.named,
      // 占位值 —— 绝不能当真。stub 标记就是为了让人读到这里之前先想一下。
      finance: defaultModel(), project: null, records: [], rivals: [],
      cloudId: item.item_id, cloudVersion: item.version ?? 1,
      updatedAt: new Date(item.updated_at).getTime() || Date.now(),
      stub: true,
      stubCounts: {
        records: Number(summary.records ?? 0),
        rivals: Number(summary.rivals ?? 0),
        hasProject: !!summary.hasProject,
      },
    });
  }
  const currentId = products.some((p) => p.id === s.currentId) ? s.currentId : (products[0]?.id ?? "");
  /*
   * **墓碑必须带上。**
   *
   * 原来是 persist({ currentId, products }) —— 没写 tombstones 这个字段,
   * 整仓写回时它就被抹掉了。而墓碑的作用正是「这条是我删的,别再捡回来」:
   * 离线删掉一份档案(或云端删除失败)后,只要跑一次 reconcileCloud,
   * 墓碑没了 → 下一次拉取又把它当新档案收回来 —— **删除自动撤销**,
   * 而且没有任何提示。墓碑注释里警告的就是这件事,结果自己把它丢了。
   */
  persist({ currentId, products, tombstones: s.tombstones });
}

// ---------------- 冷档案卸载(本地缓存淘汰) ----------------

/** 本地占用超过这个数才开始卸。不紧张时一份都不卸 —— 用户完全无感。 */
const EVICT_START_BYTES = 3 * 1024 * 1024;
/** 卸到这个数以下就停,留出余量,免得每次改动都要卸一份。 */
const EVICT_TARGET_BYTES = 2 * 1024 * 1024;
/** 这么久没打开过才算「冷」。 */
const COLD_MS = 30 * 24 * 3600 * 1000;

/**
 * 这份档案可以只留卡片吗。
 *
 * 每一条都是**不可退让**的:任何一条判错,卸载就等于删数据。
 * 顺序按「最致命的先挡」排。
 */
function evictable(p: Product, currentId: string, now: number, opens: Record<string, OpenStat>): boolean {
  if (p.stub) return false;                       // 已经是卡片了
  if (p.id === currentId) return false;           // 当前商品,各工具正在读它
  if (!p.cloudId) return false;                   // 云端没有这一份 —— 卸了就是销毁
  if (needsPush(p)) return false;                 // 有没推上去的改动,同上
  if (isExampleSeed(p)) return false;             // 示例档案本来就没上云
  const lastOpen = opens[p.stableId]?.at ?? 0;
  // 从没打开过的档案:用 updatedAt 兜底,别把刚建好还没点开的档案当冷的
  const idle = now - Math.max(lastOpen, p.updatedAt);
  return idle > COLD_MS;
}

/** 示例档案是本地种下的演示数据,没有云端副本。 */
function isExampleSeed(p: Product): boolean {
  return p.stableId.startsWith("pid_example") || p.cloudId === null;
}

/**
 * 本地缓存淘汰:把冷档案的详情卸掉,只留卡片。
 *
 * 这是「5MB 也能放下无限档案」的最后一块 —— 卡片约 250 字节,
 * 完整档案 4-13KB,压缩 20-50 倍。
 *
 * 三条设计约束:
 *  1. **容量不紧张时一份都不卸。** 用户完全无感是默认状态,
 *     不是「省着点用」的产品。
 *  2. **只卸确认在云端、且没有未推改动的。** 卸载不是删除的前提是
 *     「随时能取回来」,取不回来的一律不动。
 *  3. **从最久没碰的开始。** 卸错的代价是下次打开要等一下网络,
 *     所以宁可卸得慢一点。
 *
 * 返回卸掉的份数。
 */
export function evictColdProducts(force = false): number {
  if (typeof window === "undefined" || evicting) return 0;
  const s = readStore();
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return 0;
  // force = 配额已经写不进去了。这时本仓可能并不大(占地方的是别人),
  // 但能腾一点是一点 —— 阈值是「平时别打扰用户」,不是「满了也不许动」。
  if (!force && raw.length < EVICT_START_BYTES) return 0;

  const now = Date.now();
  const opens = readOpens();
  const cold = s.products
    .filter((p) => evictable(p, s.currentId, now, opens))
    .sort((a, b) => (opens[a.stableId]?.at ?? a.updatedAt) - (opens[b.stableId]?.at ?? b.updatedAt));
  if (!cold.length) return 0;

  /*
   * force 时目标是 0 = 能卸的全卸。
   *
   * 原来 force 只跳过了「开始卸」的阈值,却仍拿 EVICT_TARGET_BYTES 收手 ——
   * 而配额真失败时本仓可能只有几百 KB(占地方的是别的键),
   * 一上来就已经低于目标,于是一份都不卸,force 形同虚设(实测如此)。
   * 走到 force 说明用户的改动已经写不进去了,这时候客气没有意义。
   */
  const target = force ? 0 : EVICT_TARGET_BYTES;
  const victims = new Set<string>();
  let size = raw.length;
  for (const p of cold) {
    if (size <= target) break;
    victims.add(p.id);
    size -= JSON.stringify(p).length;
  }
  if (!victims.size) return 0;

  // persist 会在配额失败时回头调本函数,不挡住就是无限递归
  evicting = true;
  try {
    persist({
      ...s,
      products: s.products.map((p) => (victims.has(p.id) ? toStub(p) : p)),
    });
  } finally { evicting = false; }
  return victims.size;
}

let evicting = false;

/**
 * 完整档案 → 卡片。
 *
 * 保留的东西分两类,少一样都会出事:
 *   **身份** —— stableId / mergedFrom / cloudId / asin:少了就认不回来,
 *               mergedFrom 少了绑在旧 id 上的报告直接变孤儿;
 *   **计数** —— 让 isTouched/recordCount 不必加载详情就能答对,
 *               否则这份档案会从「我的商品」里消失(见 Product.stub)。
 */
function toStub(p: Product): Product {
  const stub: Product = {
    id: p.id, stableId: p.stableId, name: p.name, marketplace: p.marketplace,
    asin: p.asin ?? null, named: p.named,
    mergedFrom: p.mergedFrom,
    finance: defaultModel(), project: null, records: [], rivals: [],
    cloudId: p.cloudId, cloudVersion: p.cloudVersion,
    pushedHash: p.pushedHash,
    updatedAt: p.updatedAt,
    stub: true,
    stubCounts: {
      records: (p.records ?? []).length,
      rivals: (p.rivals ?? []).length,
      hasProject: !!p.project,
    },
  };
  return stub;
}

/**
 * 恢复一份已删档案。
 *
 * **必须先清掉本地墓碑。** 墓碑的语义是「这条是我删的,reconcile 别再捡回来」——
 * 云端恢复了而墓碑还在的话,下一次 reconcileCloud 会照旧跳过它,
 * 用户看到的是「点了恢复,什么也没发生」;更糟的是 pushAll 还会拿墓碑
 * 去把刚恢复的那条**再删一次**。
 */
export async function restoreDeleted(cloudItemId: string): Promise<boolean> {
  const d = await itemsApi.restore(cloudItemId);
  const stableId = (d.item.payload as { stableId?: string } | null)?.stableId
    ?? d.item.stable_id ?? null;
  const s = readStore();
  persist({
    ...s,
    tombstones: (s.tombstones ?? []).filter(
      (t) => t.cloudId !== cloudItemId && (!stableId || t.stableId !== stableId)),
  });
  await reconcileCloud();
  return true;
}

/**
 * 把一份存根的详情从云端取下来。已经是完整的直接返回。
 *
 * 打开档案、切成当前商品、任何要读 records/finance/project 的地方,
 * 都得先过这一关 —— 否则读到的是占位值。
 */
const loading = new Map<string, Promise<Product | null>>();

export async function ensureLoaded(id: string): Promise<Product | null> {
  const p = readStore().products.find((x) => x.id === id);
  if (!p) return null;
  if (!p.stub || !p.cloudId) return p;
  /*
   * 同一条只飞一次。入口有好几个(打开详情、切当前商品、写入时的推迟路径、合并),
   * 很容易并发触发;不去重的话两次请求各自回来各写一遍,后到的那次覆盖先到的。
   */
  const inflight = loading.get(id);
  if (inflight) return inflight;
  const task = (async () => {
    const d = await itemsApi.get(p.cloudId!);
    const pay = d.item.payload as unknown as CloudPayload;
    updateProductSilent(id, (x) => {
      /*
       * **await 之后必须重查一次。**
       *
       * 网络先发后至是五五开的常事:#1 慢、#2 快,#2 补齐之后用户往里写了一笔,
       * #1 才回来 —— 这里若无条件用云端 payload 覆盖,那笔写入当场没了,
       * 而且 pushedHash 被记成干净,它连"以后再推"的机会都没有。
       * 已经不是存根 = 别人补齐过了,这次的结果作废,不动它。
       */
      if (!x.stub) return x;
      const filled: Product = {
      ...x,
      name: pay.name || x.name,
      marketplace: pay.marketplace || x.marketplace,
      asin: pay.asin ?? x.asin ?? null,
      finance: sanitizeModel(pay.finance),
      project: pay.project ?? null,
      records: pay.records ?? [],
      rivals: pay.rivals ?? [],
      platform: pay.platform ?? x.platform,
      mergedFrom: [...new Set([...(x.mergedFrom ?? []), ...(pay.mergedFrom ?? [])])],
      named: x.named || pay.named,
      cloudVersion: d.item.version ?? x.cloudVersion ?? 1,
      };
      delete filled.stub;
      delete filled.stubCounts;
      // 刚从云端取下来 = 与云端一致。不记指纹的话它会被立刻原样推回去一轮。
      return { ...filled, pushedHash: payloadHash(filled) };
    });
    return readStore().products.find((x) => x.id === id) ?? null;
  })();
  loading.set(id, task);
  try { return await task; } finally { loading.delete(id); }
}

/** 按云端条目 id 采用某个商品为当前商品(「我的商品」打开用)。返回是否成功。 */
export async function adoptCloudProduct(cloudItemId: string): Promise<boolean> {
  await reconcileCloud().catch(() => {});
  const s = readStore();
  const hit = s.products.find((p) => p.cloudId === cloudItemId);
  if (!hit) return false;
  persist({ ...s, currentId: hit.id });
  return true;
}

/* ---------------- 名下记录(v1:测算快照 = 版本) ---------------- */

export type ProductRecord = {
  id: string;
  tool: string;               // profit / pricing / landed / acos / dimweight
  label: string;
  values: Record<string, unknown>;
  starred?: boolean;          // 星标 = 商品档案的事实依据(取值来源);星标记录不允许删除
  ts: number;
};

/** 把测算入参写回财务模型(计算器共用一份模型)—— 星标即「参数随之变化」。 */
function applyValuesToFinance(finance: ProductModel, v: Record<string, unknown>): ProductModel {
  const next: Record<string, unknown> = { ...finance };
  for (const k of ["price", "cost", "domestic", "head", "lastMile", "commission", "refund", "ads", "target"]) {
    const n = typeof v[k] === "number" ? (v[k] as number) : Number(v[k]);
    if (Number.isFinite(n)) next[k] = n;
  }
  if (typeof v.blocks === "string") { try { next.blocks = JSON.parse(v.blocks); } catch { /* keep */ } }
  next.updatedAt = Date.now();
  return sanitizeModel(next);
}

/**
 * 星标一条记录 = 设为商品档案的「事实依据」(取值来源)。星组唯一:五个计算器共用一份
 * 财务模型 → 全组只一个星标;工作台工具各自独立成组。星标计算器记录时把它的入参写回
 * 财务模型(选定即「财务参数随之变化」)。星标记录不允许删除(由调用方拦)。再点即取消。
 */
export function toggleStar(productId: string, recordId: string) {
  updateProduct(productId, (p) => {
    const rec = (p.records ?? []).find((r) => r.id === recordId);
    if (!rec) return p;
    const willStar = !rec.starred;
    const grp = starGroup(rec.tool);
    const records = (p.records ?? []).map((r) =>
      r.id === recordId ? { ...r, starred: willStar }
        : (willStar && starGroup(r.tool) === grp ? { ...r, starred: false } : r));
    const finance = (willStar && FINANCE_TOOLS.has(rec.tool))
      ? applyValuesToFinance(p.finance, rec.values) : p.finance;
    return { ...p, records, finance };
  });
}

const RECORD_CAP = 50;        // 每商品记录上限,防 payload 失控

export function addRecord(productId: string, rec: Omit<ProductRecord, "id" | "ts">) {
  updateProduct(productId, (p) => ({
    ...p,
    records: [
      { ...rec, id: "rec_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() },
      ...(p.records ?? []),
    ].slice(0, RECORD_CAP),
  }));
}

export function recordsOf(productId: string, tool?: string): ProductRecord[] {
  const p = readStore().products.find((x) => x.id === productId);
  const rs = p?.records ?? [];
  return tool ? rs.filter((r) => r.tool === tool) : rs;
}

/** 删除单条记录(星标=事实依据的除外,由调用方拦)。 */
export function removeRecord(productId: string, recordId: string) {
  updateProduct(productId, (p) => ({ ...p, records: (p.records ?? []).filter((r) => r.id !== recordId) }));
}

export function removeToolRecords(productId: string, tool: string) {
  updateProduct(productId, (p) => ({ ...p, records: (p.records ?? []).filter((r) => r.tool !== tool) }));
}

/**
 * 合并商品:source 并入 target(用户显式决定「这是同一个商品」时)。
 * 版本不丢:source 的记录全部并入;source 的财务模型作为一条「合并前版本」快照留档;
 * 事实库:target 已有项目则保留 target(source 的留在其快照里),否则收下 source 的。
 */
/* ---------------- 竞品组(#61):用户自录的对照名单 ---------------- */

const RIVAL_CAP = 12;

export function addRival(productId: string, r: Omit<Rival, "id" | "updatedAt">): Rival {
  const rival: Rival = { ...r, id: "rv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), updatedAt: Date.now() };
  updateProduct(productId, (p) => ({ ...p, rivals: [rival, ...(p.rivals ?? [])].slice(0, RIVAL_CAP) }));
  if (cloudEnabled) schedulePush();
  return rival;
}

export function updateRival(productId: string, rivalId: string, patch: Partial<Omit<Rival, "id">>) {
  updateProduct(productId, (p) => ({
    ...p,
    rivals: (p.rivals ?? []).map((r) => (r.id === rivalId ? { ...r, ...patch, updatedAt: Date.now() } : r)),
  }));
  if (cloudEnabled) schedulePush();
}

/** 把竞品行绑到一份真实档案上(传 null 解绑)。 */
export function linkRival(productId: string, rivalId: string, targetStableId: string | null) {
  updateProduct(productId, (p) => ({
    ...p,
    rivals: (p.rivals ?? []).map((r) =>
      r.id === rivalId ? { ...r, productRef: targetStableId, updatedAt: Date.now() } : r),
  }));
}

/**
 * 按 ASIN 自动接上还没绑定的竞品行。
 *
 * 用户手录竞品时通常会填 ASIN;后来他用插件把那个 ASIN 采集建档了 ——
 * 这两件事之间不该还要他手动去连一次。插件导入后调一次这个就够了。
 */
export function autoLinkRivals(): number {
  const s = readStore();
  const byAsin = new Map<string, string>();
  for (const p of s.products) {
    const key = p.asin && p.marketplace ? `${p.asin}|${p.marketplace}`.toLowerCase() : null;
    if (key) byAsin.set(key, p.stableId);
  }
  let linked = 0;
  const products = s.products.map((p) => {
    if (!p.rivals?.length) return p;
    const rivals = p.rivals.map((r) => {
      if (r.productRef || !r.asin) return r;
      const hit = byAsin.get(`${r.asin}|${p.marketplace}`.toLowerCase());
      // 不能把商品绑到它自己身上
      if (!hit || hit === p.stableId) return r;
      linked += 1;
      return { ...r, productRef: hit, updatedAt: Date.now() };
    });
    return linked ? { ...p, rivals } : p;
  });
  if (linked) persist({ ...s, products });
  return linked;
}

/** 竞品行指向的那份档案(没绑或已被删则 null)。 */
export function rivalTarget(r: Rival): Product | null {
  if (!r.productRef) return null;
  return readStore().products.find((p) => p.stableId === r.productRef) ?? null;
}

/**
 * 竞品的展示值:绑定了就读穿到对方档案的平台事实,否则用手填值。
 * 手抄的数字会过期,采集回来的不会 —— 有真档案就别用副本。
 */
export function rivalView(r: Rival): {
  name: string; asin: string | null; price: number | null;
  rating: number | null; reviews: number | null; linked: Product | null;
} {
  const t = rivalTarget(r);
  if (!t) return {
    name: r.name, asin: r.asin ?? null, price: r.price ?? null,
    rating: r.rating ?? null, reviews: r.reviews ?? null, linked: null,
  };
  const f = t.platform;
  return {
    name: t.name || r.name,
    asin: t.asin ?? r.asin ?? null,
    price: f?.price ?? r.price ?? null,
    rating: f?.rating ?? r.rating ?? null,
    reviews: f?.reviewCount ?? r.reviews ?? null,
    linked: t,
  };
}

export function removeRival(productId: string, rivalId: string) {
  updateProduct(productId, (p) => ({ ...p, rivals: (p.rivals ?? []).filter((r) => r.id !== rivalId) }));
  if (cloudEnabled) schedulePush();
}

export function mergeProducts(sourceId: string, targetId: string): boolean {
  const s = readStore();
  const src = s.products.find((p) => p.id === sourceId);
  const tgt = s.products.find((p) => p.id === targetId);
  if (!src || !tgt || sourceId === targetId) return false;
  /*
   * 任一方是存根就拒绝 —— 合并是这套里**最不能将就**的操作。
   *
   * 源是存根:它的 records/rivals/finance 全是占位值,合并会把
   * 「默认财务模型」当成用户的模型存成快照,真内容(只在云端)一条不并;
   * 而紧接着 itemsApi.remove 会把云端那份删掉 —— **永久丢失**。
   * 目标是存根:合并结果带着 stub 标记,pushAll 跳过它永不上云,
   * 之后 ensureLoaded 从云端补齐,这次合并凭空消失。
   *
   * 调用方先 ensureLoaded 两边再来。宁可让它失败一次,也不能删错东西。
   */
  if (src.stub || tgt.stub) return false;
  const srcFinanceSnapshot: ProductRecord = {
    id: "rec_" + Date.now().toString(36) + "m",
    tool: "profit",
    label: `合并自「${src.name.trim() || "未命名商品"}」的财务模型`,
    values: { ...src.finance, blocks: JSON.stringify(src.finance.blocks) },
    ts: Date.now(),
  };
  const merged: Product = {
    ...tgt,
    project: tgt.project ?? src.project,
    records: [srcFinanceSnapshot, ...(src.records ?? []), ...(tgt.records ?? [])]
      .sort((a, b) => b.ts - a.ts).slice(0, RECORD_CAP),
    // 竞品组也并过来:同名(或同 ASIN)去重,目标优先
    rivals: [...(tgt.rivals ?? []), ...(src.rivals ?? []).filter((r) =>
      !(tgt.rivals ?? []).some((t) => (r.asin && t.asin === r.asin) || t.name === r.name))].slice(0, RIVAL_CAP),
    updatedAt: Date.now(),
  };
  // source 的 stableId 必须留着 —— 原本绑在它上面的报告认的就是这个 id。
  // 丢掉它,那些报告会变成永久孤儿:商品页查不到、报告页显示成"从没绑过",
  // 而 report_run.product_ref 还写着那个已经不存在的 id。
  merged.mergedFrom = [...new Set([
    ...(tgt.mergedFrom ?? []), src.stableId, ...(src.mergedFrom ?? []),
  ])];
  const products = s.products.filter((p) => p.id !== sourceId).map((p) => (p.id === targetId ? merged : p));
  persist({ currentId: s.currentId === sourceId ? targetId : s.currentId, products });
  // source 的云端记录删掉,避免僵尸档案;删失败时留墓碑,由 pushAll 重试
  if (src.cloudId) {
    itemsApi.remove(src.cloudId).catch(() => {
      const cur = readStore();
      persist({ ...cur, tombstones: [...(cur.tombstones ?? []),
                                     { cloudId: src.cloudId, stableId: src.stableId, at: Date.now() }] });
    });
  }
  schedulePush();
  return true;
}

/* ---------------- 云开关(由挂载了 useAuth 的组件设置) ---------------- */



/** 仅供单测:并集与合并是"丢不丢数据"的关键分支,必须能直接验。 */
export const __test = { unionRecords, unionRivals, mergeWithCloud };
