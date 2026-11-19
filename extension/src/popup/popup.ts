/** Local-only collector: reads the active page only after a click. */
import { createBundle, downloadBundle } from "../lib/export";
import { identityKey } from "../../../shared/collector";
import { adapterFor, type Capture } from "../adapters/index";
import { marketOf } from "../adapters/amazon";
import { type ProductInsights } from "../adapters/amazon-insights";
import {
  allReviewsUrl, isReviewsPage, type ReviewSample,
} from "../adapters/amazon-reviews";
import {
  addToCart, clearCart, MAX_CART_REVIEWS, readCart, type ReviewCart,
} from "../lib/review-cart";
import { analyze, type Note } from "../lib/analyze";
import { IMPORTS_PAGE } from "../lib/config";
import { openSiteTab } from "../lib/tabs";
import * as store from "../lib/storage";
import { tiktokProductId } from "../adapters/tiktok";
import { hasReviewsFor } from "../adapters/index";

const view = document.getElementById("view")!;
const websiteBtn = document.getElementById("website") as HTMLButtonElement;

const FIELD_LABEL: Record<string, string> = {
  title: "标题", brand: "品牌", price: "价格", currency: "币种", rating: "评分",
  reviewCount: "评价数", categoryPath: "类目", sellerName: "卖家",
  fulfillmentType: "履约", bsr: "排名", firstAvailable: "上架", mainImage: "主图",
  soldCount: "已售",
};



// ---------------- 渲染小工具 ----------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const k of kids) node.append(k);
  return node;
}

/** 全程用 createElement/textContent,不用 innerHTML —— 采集来的字段是外站内容,
 *  拼进 HTML 就是把别人的页面内容当代码执行。 */
function render(...nodes: Node[]) {
  view.replaceChildren(...nodes);
}

function message(kind: "err" | "ok" | "warn", text: string): HTMLElement {
  return el("div", { className: `msg ${kind}`, textContent: text });
}

// ---------------- 各状态视图 ----------------

function viewUnsupported(url: string | undefined) {
  const btn = el("button", { className: "ghost", textContent: "打开我的商品档案" });
  btn.onclick = () => void openSiteTab(IMPORTS_PAGE);
  render(
    el("h2", { textContent: "这个页面不支持采集" }),
    /*
     * 这一屏是用户「没采成」时唯一看到的东西 —— 它必须把支持范围说全。
     * 加了 TikTok 之后这里还写着「请在亚马逊商品详情页」,等于告诉用户
     * TikTok 不支持;而它其实支持。文案落后于能力,和能力缺失一样劝退。
     */
    el("p", { textContent:
      "请在商品详情页打开插件:亚马逊是网址带 /dp/ 的那种,TikTok Shop 是带 /pdp/ 的那种。" }),
    el("p", { textContent:
      "搜索结果页、榜单页不采集 —— 那样只会得到一份你没打开过的商品档案。" }),
    ...(url ? [el("div", { className: "foot", textContent: `当前:${url.slice(0, 80)}` })] : []),
    btn,
  );
}

async function viewReady(tabUrl: string) {
  const btn = el("button", { className: "primary", textContent: "采集本页商品" });
  btn.onclick = () => void doCapture(btn);

  const nodes: Node[] = [
    el("h2", { textContent: "可以采集" }),
    el("p", { textContent: "点下面的按钮读取本页公开商品信息。只读这一个标签页,只读这一次。" }),
    btn,
  ];
  /*
   * 按适配器判断「这页有没有评论可采」。
   *
   * 原来用的是 matchesReviews —— **亚马逊专属**,只认 /dp/ 与 /product-reviews/。
   * TikTok 上恒为 false,所以评论区在初始态根本不渲染:用户翻到评论第 3 页、
   * popup 重新打开时,看到的就是一个只有「采集本页商品」的面板,
   * 「重新采集本页评论」压根不存在。实测就是这个现象。
   * (hasReviewsFor 上一轮就写好了,却忘了把这个调用点换过来 —— 加了函数没接上,
   *  症状是「按钮不出现」,不报任何错。)
   */
  if (hasReviewsFor(tabUrl)) nodes.push(...await reviewBlock());
  nodes.push(el("div", { className: "foot", textContent: new URL(tabUrl).hostname }));
  render(...nodes);
}

/**
 * 评论采集区。
 *
 * 和商品采集不同,这里是**累积式**的:用户自己翻页,每页点一次。
 * 插件不自动翻页 —— 那就成爬虫了。所以界面要一直显示「已采多少、来自几页」,
 * 让用户自己决定够不够。
 */
async function reviewBlock(): Promise<Node[]> {
  const tab = await activeTab();
  const url = tab?.url ? new URL(tab.url) : null;
  const onList = url ? isReviewsPage(url) : false;

  /*
   * 当前这一页是哪个商品。篮子**只有属于当前商品时才显示**。
   *
   * 原来无条件读篮子:在 A 的页面采了 8 条不导入,同一标签页浏览到 B,
   * 重开弹窗会在 B 的页面上显示「已采 8 条 / 导入 8 条评论」——
   * 点下去评论记到 A 名下,而用户全程以为在操作 B。
   * 「打开全部评论页」也会把当前标签页导航到 A。
   */
  /*
   * 当前页面对应哪个商品 —— 用来防「评论记到上一个商品名下」。
   *
   * 此前只认亚马逊的 ASIN 形态,于是 TikTok 页面上这里恒为 undefined:
   * 购物车里的旧评论与当前页永远「不同商品」,采集按钮的归属判断整个失效。
   * 改为按适配器认:谁认得这个 URL,就用谁的 id。
   */
  const here = url
    ? (adapterFor(url.toString())?.id === "tiktok"
        ? tiktokProductId(url)
        : url.pathname.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase())
    : undefined;
  const hereMarket = url ? marketOf(url) : undefined;
  /** 当前页是不是 TikTok —— 决定给哪种「怎么采到更多评论」的指引。 */
  const isTikTokPage = !!url && !!tiktokProductId(url);
  const cartAll = await readCart();
  // 同商品还要同站点:同一 ASIN 在 .com 和 .de 是两份档案
  const cart = cartAll
    && (!here || cartAll.externalId === here)
    && (!hereMarket || cartAll.marketplace === hereMarket)
    ? cartAll : null;
  const asin = here ?? cart?.externalId ?? (await store.readLastCapture())?.externalId;

  // 篮子里躺着别的商品的评论 —— 如实说一声,否则用户以为自己没采过
  const strandedNote = cartAll && !cart
    ? el("div", { className: "cart-hint",
        textContent: `另有 ${cartAll.reviews.length} 条评论属于上一个商品(${cartAll.externalId}),可用底部按钮先导出。` })
    : null;

  const grab = el("button", { className: "ghost", textContent: "重新采集本页评论" });
  grab.onclick = () => void doCaptureReviews(grab);

  const out: Node[] = [el("div", { className: "sep" }), grab];
  if (strandedNote) out.push(strandedNote);

  if (cart?.reviews.length) {
    out.push(el("div", { className: "cart" },
      el("div", { className: "cart-n", textContent: `已采 ${cart.reviews.length} 条` }),
      el("div", {
        className: "cart-hint",
        textContent: "随商品一起采的代表性原文,导入时一并带上。用来看用户具体说了什么 —— 主题计数与评论样本分开看，不代表完整评论库。",
      }),
    ));
  }

  /*
   * 只留一个「去全部评论页」的入口。
   *
   * 这里原本有五个星级按钮,想靠分层采样把样本做大 —— 用户实测后确认:
   * 亚马逊连星级筛选也只放第一页,不同星级拿不到不同的评论。
   * 那五个按钮就是在承诺一个做不到的能力,比没有这个功能更糟,已删。
   *
   * 现实是:一个商品最多拿到十几条,而且是亚马逊挑过的。
   * 所以评论原文的定位只能是**佐证**,量级判断交给「全量口碑主题」——
   * 那一块覆盖全部评论,是这条路上唯一可信的量化来源。
   */
  /*
   * 「打开全部评论页」是**亚马逊专属**的 —— allReviewsUrl 拼的是
   * /product-reviews/<ASIN>,在 TikTok 上必然 404(实测)。
   * 而 TikTok 根本没有独立的评论页:评论是详情页里的一段,滚动加载。
   * 所以两个平台给不同的出口:亚马逊跳列表页,TikTok 告诉他就地展开。
   */
  if (url && asin && !onList) {
    if (isTikTokPage) {
      /*
       * TikTok 的评论是**分页**的(实测某商品 4374 页,每页约 10 条),不是滚动加载 ——
       * 我一开始按「滚动加载」写的指引是错的。
       * 采法与亚马逊的评论列表页一样:翻一页采一次,篮子按评论正文累积。
       */
      out.push(el("div", { className: "cart-hint", textContent:
        "TikTok 的评论在详情页里分页显示。翻到一页就点一次上面的「重新采集本页评论」,篮子会累积;不点采集只翻页不会自动收。" }));
    } else {
      const asinNow = asin;
      const go = el("button", { className: "link wide", textContent: "打开全部评论页 →" });
      go.onclick = () => void chrome.tabs.update({ url: allReviewsUrl(url, asinNow) });
      out.push(el("div", { className: "cart-hint", textContent: "本页可能只展示精选评论，采集范围以实际展开的内容为准。" }), go);
    }
  }

  if (cart?.reviews.length) {
    const send = el("button", { className: "primary", textContent: `导出 ${cart.reviews.length} 条评论 JSON` });
    send.onclick = () => void doImportReviews(cart, send);
    const drop = el("button", { className: "link wide", textContent: "清空已采评论" });
    drop.onclick = () => { if (confirm("清空已采评论？请先导出需要保留的样本。")) void clearCart().then(() => boot()); };
    out.push(send, drop);
  }
  return out;
}

async function confirmSwitch(sample: ReviewSample) {
  const cart = await readCart();
  return !cart?.reviews.length || identityKey(cart) === identityKey(sample)
    || confirm("已有另一商品的评论。请先导出需要保留的样本；继续会替换评论篮。是否继续？");
}

async function doCaptureReviews(btn: HTMLButtonElement) {
  btn.disabled = true;
  const tab = await activeTab();
  if (!tab?.id) { btn.disabled = false; return; }
  try {
    const sample = await runInPage<ReviewSample | null>(tab.id, "__xmCaptureReviews");
    if (!sample) {
      btn.disabled = false;
      view.prepend(diagnoseBox(tab.id));
      view.prepend(message("err", "这一页没找到评论。"));
      return;
    }
    if (!await confirmSwitch(sample)) { btn.disabled = false; return; }
    const r = await addToCart(sample);
    await boot();
    // 先放诊断框、后放提示,prepend 才会让提示在上面
    const readNothing = !r.switched && !r.added && !r.duplicates && !r.overflow;
    if (readNothing) view.prepend(diagnoseBox(tab.id));
    if (r.switched) view.prepend(message("err", "换商品了 —— 上一个商品已采的评论已清空。"));
    else view.prepend(message(r.overflow ? "warn" : readNothing ? "err" : "ok",
      r.added
        ? `本页新增 ${r.added} 条`
          + (r.duplicates ? `(${r.duplicates} 条重复已跳过)` : "")
          + (r.overflow ? `,另有 ${r.overflow} 条因已达 ${MAX_CART_REVIEWS} 条上限未收` : "")
        : r.overflow ? `已达 ${MAX_CART_REVIEWS} 条上限,本页 ${r.overflow} 条未收 —— 先导入再继续采`
        // 「都采过了」和「一条都没读出来」是两回事,不能都说成前者 ——
        // 后者是我们的解析失效,说成「都采过了」用户就不会来报,我们也永远不知道。
        : r.duplicates ? "本页没有新评论(都采过了)"
        : "这一页没读到评论 —— 评论区展开了吗?若已展开还是这样,请点下面复制诊断信息。"));
  } catch (e) {
    btn.disabled = false;
    view.prepend(message("err", errText(e)));
  }
}

/**
 * 采不到时给一个「复制诊断信息」按钮。
 *
 * 读 DOM 的固有代价是**静默失效** —— 页面变了,我们抓空,而谁也不知道变成了什么样。
 * 与其让用户去开 DevTools,不如让插件自己把现场抄下来。
 */
function diagnoseBox(tabId: number): HTMLElement {
  const box = el("div", { className: "cart" });
  box.append(el("div", { className: "cart-hint", textContent: "如果这一页明明有评论,把诊断信息发给我们,下一版就能修。" }));
  const btn = el("button", { className: "link wide", textContent: "复制诊断信息" });
  btn.onclick = async () => {
    try {
      const text = await runInPage<string>(tabId, "__xmDiagnose");
      await navigator.clipboard.writeText(text);
      btn.textContent = "已复制 ✓";
    } catch {
      btn.textContent = "复制失败";
    }
  };
  box.append(btn);
  return box;
}

async function doImportReviews(cart: ReviewCart, btn: HTMLButtonElement) {
  try {
    downloadBundle(createBundle(null, cart, null));
    showDownload();
  } catch (e) { view.prepend(message("err", errText(e))); }
  btn.disabled = false;
}

function showDownload() {
  const go = el("button", { className: "primary", textContent: "打开网站导入文件" });
  go.onclick = () => void openSiteTab(IMPORTS_PAGE);
  view.prepend(go);
  view.prepend(message("ok", "已发起 JSON 文件下载。保存文件后，在网站选择该文件并确认导入。采集内容仍保留在插件中。"));
}

function fieldList(c: Capture): HTMLElement {
  const dl = el("dl");
  const f = c.fields as Record<string, unknown>;
  // soldCount 排在评价数后面:它和评价数是同一类「这个品卖得怎么样」的信号
  const shown = ["price", "rating", "reviewCount", "soldCount", "brand",
                 "fulfillmentType", "bsr", "firstAvailable"];
  for (const key of shown) {
    const v = f[key];
    if (v === undefined) continue;
    let display = String(v);
    if (key === "price") display = `${f.currency ?? ""} ${v}`.trim();
    dl.append(el("dt", { textContent: FIELD_LABEL[key] ?? key }), el("dd", { textContent: display }));
  }
  for (const key of c.missingFields) {
    dl.append(
      el("dt", { textContent: FIELD_LABEL[key] ?? key }),
      el("dd", { className: "missing", textContent: "未抓到" }),
    );
  }
  return dl;
}

function noteList(notes: Note[]): HTMLElement {
  const ul = el("ul", { className: "notes" });
  for (const n of notes) ul.append(el("li", { className: n.tone, textContent: n.text }));
  return ul;
}

async function viewCaptured(c: Capture, err?: string, insights?: ProductInsights | null) {
  const importBtn = el("button", { className: "primary", textContent: "导出商品与评论 JSON" });
  importBtn.onclick = () => void doImport(c, importBtn);
  const again = el("button", { className: "ghost", textContent: "重新采集" });
  again.onclick = () => void doCapture(again);

  const card = el("div", { className: "card" });
  card.append(el("div", { className: "title", textContent: c.fields.title ?? c.externalId }));
  card.append(fieldList(c));

  const notes = analyze(c);
  const insightNodes = insights ? insightBlock(insights) : [];
  render(
    ...(err ? [message("err", err)] : []),
    card,
    ...(notes.length ? [noteList(notes)] : []),
    ...insightNodes,
    el("div", { className: "foot", textContent: `${c.marketplace} · ${c.externalId} · 解析器 ${c.adapterVersion}` }),
    importBtn,
    again,
    // 采完商品接着就想采评论是很自然的动作。这里原本没有入口,
    // 用户得刷新页面或重开弹窗才能回到评论按钮 —— 纯属漏掉。
    ...await reviewBlock(),
  );
}

/**
 * 平台口碑摘要的展示。
 *
 * 必须写清楚「这是亚马逊算的、覆盖全部评论」—— 它的可信度来源与我们采的
 * 十几条完全不同,混为一谈的话用户会以为我们分析了 94,050 条。
 */
function insightBlock(i: ProductInsights): Node[] {
  if (!i.topics.length && !i.summary) return [];
  const box = el("div", { className: "cart" });
  box.append(el("div", { className: "cart-n", textContent: "平台展示的口碑主题（亚马逊）" }));
  box.append(el("div", {
    className: "cart-hint",
    textContent: i.totalReviews
      ? `页面标注共 ${i.totalReviews.toLocaleString()} 条评价；主题来自平台摘要，非本插件计算`
      : "主题来自平台摘要；覆盖范围以平台说明为准，非本插件计算",
  }));
  const wrap = el("div", { className: "topics" });
  for (const t of i.topics.slice(0, 8)) {
    wrap.append(el("span", {
      className: `topic ${t.sentiment}`,
      textContent: `${t.name} ${t.mentions >= 1000 ? (t.mentions / 1000).toFixed(1) + "K" : t.mentions}`,
    }));
  }
  box.append(wrap);
  return [box];
}

type PageFn = "__xmCapture" | "__xmCaptureReviews" | "__xmDiagnose" | "__xmCaptureInsights";
async function runInPage<T>(tabId: number, fn: PageFn): Promise<T> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name: string) => (window as unknown as Record<string, () => unknown>)[name]?.(),
    args: [fn],
  });
  const payload = res?.result as { ok: boolean; data?: T; error?: string } | undefined;
  if (!payload) throw new Error("没能读取页面内容,刷新页面后再试。");
  if (!payload.ok) throw new Error(payload.error || "页面解析失败。");
  return payload.data as T;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function doCapture(btn: HTMLButtonElement) {
  btn.disabled = true;
  const tab = await activeTab();
  if (!tab?.id || !tab.url) { viewUnsupported(undefined); return; }
  try {
    const got = await runInPage<Capture | null>(tab.id, "__xmCapture");
    if (!got) {
      viewUnsupported(tab.url);
      return;
    }
    /*
     * 顺带采「Customers say」—— 亚马逊基于**全部**评论的主题聚类。
     *
     * 它比我们逐页采的十几条值钱一个数量级:计数覆盖全量,
     * 而亚马逊已关掉评论深度翻页与星级筛选,我们自己拿不到那么多。
     * 同一次点击、同一个页面,不额外读任何东西。
     */
    const insights = await runInPage<ProductInsights | null>(tab.id, "__xmCaptureInsights")
      .catch(() => null);

    /*
     * 评论原文也一并采。
     *
     * 原来评论要单独点一次。那是「分层采样」时代的设计:当时以为用户会翻很多页,
     * 采评论是个独立的、反复的动作。现在亚马逊只放十几条、而且就在这同一个页面上,
     * 再让人为同一次页面读取点两下就是纯摩擦。
     *
     * 注意仍是**同一次注入、同一个页面**,没有多读任何东西。
     */
    const sample = await runInPage<ReviewSample | null>(tab.id, "__xmCaptureReviews")
      .catch(() => null);
    let picked = 0;
    let switched = false;
    if (sample && await confirmSwitch(sample)) {
      const r = await addToCart(sample);
      // 报**本次新增**,不是篮子总数 —— 同一页连点两次,第二次新增 0,
      // 却照样说「顺带采到 8 条」会让人以为又采了一批(与手动采集那条口径也不一致)
      picked = r.added;
      switched = r.switched;
    }

    await store.writeLastCapture(got);
    await store.writeLastInsights(insights);
    await viewCaptured(got, undefined, insights);
    if (switched) view.prepend(message("err", "换商品了 —— 上一个商品已采的评论已清空。"));
    else if (picked) view.prepend(message("ok", `顺带采到 ${picked} 条评论原文,导入时一并带上。`));
  } catch (e) {
    btn.disabled = false;
    // 用户在扩展商店页、chrome:// 页面上点击时注入必然失败,这句要说人话
    viewUnsupported(tab.url);
    view.prepend(message("err", errText(e)));
  }
}

async function doImport(c: Capture, btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    const saved = await store.readLastCapture();
    const cart = await readCart();
    const insights = await store.readLastInsights();
    const sameCart = cart && identityKey(cart) === identityKey(c) ? cart : null;
    const sameInsights = insights && identityKey(insights) === identityKey(c) ? insights : null;
    downloadBundle(createBundle(
      { ...c, capturedAt: saved?.capturedAt ?? new Date().toISOString() }, sameCart, sameInsights,
    ));
    showDownload();
  } catch (e) { view.prepend(message("err", errText(e))); }
  btn.disabled = false;
}

function errText(e: unknown): string { return e instanceof Error ? e.message : String(e); }

async function boot() {
  const tab = await activeTab();
  if (!tab?.url || (!adapterFor(tab.url) && !hasReviewsFor(tab.url))) {
    viewUnsupported(tab?.url);
  } else {
    await viewReady(tab.url);
  }
  const saved = await store.readLastCapture();
  if (saved) {
    const previous = el("button", { className: "ghost", textContent: "查看上次采集：" + (saved.fields.title || saved.externalId).slice(0, 28) });
    previous.onclick = async () => { await viewCaptured(saved, undefined, await store.readLastInsights()); };
    view.append(previous);
  }
  const cart = await readCart();
  if (cart?.reviews.length) {
    const download = el("button", { className: "ghost", textContent: "导出已采评论（" + cart.externalId + "）" });
    download.onclick = () => void doImportReviews(cart, download);
    view.append(download);
  }
}
websiteBtn.onclick = () => void openSiteTab(IMPORTS_PAGE);
void boot().catch(e => render(message("err", errText(e))));
