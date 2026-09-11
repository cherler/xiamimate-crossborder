/**
 * 可嵌入的站点页眉与页脚 —— 打包成独立 JS 给子应用（虾米看股、AI 视频实验室…）用。
 *
 * 为什么单独写一份而不是直接复用 app/site-chrome.tsx：那个组件依赖 next/link、
 * useModuleVisible、登录弹窗等一整套主站上下文，拖进子应用等于把半个主站搬过去。
 * 这里只保留**子应用真正需要的三件事**：回主站的路径、当前在哪个模块、我是谁和还剩多少积分。
 *
 * 但样式与账号接口都和主站同源同一套，所以视觉与数据不会分叉：
 * 样式由 build-chrome-artifacts.mjs 从 globals.css 抽出，接口就是 /v1/session 与 /v1/me。
 */

import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { MODULES as MODULE_TRUTH, MODULE_STATUS_TEXT, statusWhenVisible } from "../lib/modules";
import { XiamiMark } from "../app/logo";
import { fmtWan } from "../lib/format";
// **同一份实现**，不是抄一份进来。它的 refresh 走 prop 传入：
// 制品页面上没有 AuthProvider，Context 会退回默认的空函数。
import { LoginModal } from "../app/auth/login-modal";
// 页脚的两个部件，跟着页脚一起进制品，子应用不用各自去接。
//
// **不带 PageFX（鼠标柔光）**：它往 document.body 上贴元素、出了制品的样式
// 作用域，而且那是主站的氛围效果 —— 虾米看股是密集的研究台，
// 一团跟着鼠标走的光在那儿是噪声。氛围留给主站自己。
import { PetWidget } from "../app/crossborder/pet/pet-widget";
// **登出要清本机的用户业务数据。** 制品原来漏了这一步 ——
// 同一个浏览器下一个用户（或游客）会看到上一个人留下的东西。
import { clearLocalUserDataAndOwner } from "../lib/local-scope";

interface Account {
  name: string;
  email: string;
  plan: string;
  credits: number | null;
  /** 游客今天还剩几分。**未登录也要显示**——见下面渲染处的说明。 */
  guestLeft: number | null;
  loggedIn: boolean;
  reachable: boolean;
  /**
   * 注册赠额还没到账（要先验证邮箱）。
   *
   * ⚠️ 2026-09-10 加。在此之前页眉不知道这件事，于是出现一个**很伤转化**的场面：
   * 游客看到「◈ 今日 5 积分」，一注册反而变成「◈ 0」，而"30 分赠额要先验证邮箱"
   * 这句话**只在主站 /account 里有**。子应用（虾米CS课堂等）只加载页眉页脚制品，
   * 主站那个注册引导弹窗根本不渲染 —— 用户注册完比当游客更不能用，且不知道为什么。
   */
  verifyNeeded: boolean;
  /** 验证后能到账多少（真源是后端 config，别在文案里写死数字） */
  signupGrant: number;
  /** 每天登录能领多少（同上，胶囊的 title 用它，不写死「10 积分」） */
  dailyGrant: number;
}

/**
 * 与主站 `lib/modules.ts` 保持一致；**这里只列 live 的**，规划中的不进来。
 *
 * 一致性由 `scripts/build-chrome-artifacts.mjs` 在构建期断言，漂了直接构建失败 ——
 * 这条清单曾经把 `planned` 的虾米看股列成「已上线」，而首页正把它藏着：
 * 首页藏了入口、页眉却给了路，点进去吃 403。**两道门要一起在。**
 */
/** 各模块自己的快捷入口，出现在账号菜单里。跟模块清单是两回事：
 *  那个回答「有哪些模块」，这个回答「在这个模块里能直接去哪」。 */
const MODULE_LINKS: Record<string, Array<{ label: string; href: string }>> = {
  crossborder: [
    { label: "我的商品", href: "/crossborder/my" },
    { label: "我的研究报告", href: "/crossborder/research/report/" },
    { label: "浏览器扩展", href: "/extension" },
  ],
  stocks: [],
};

// 模块清单**直接用 lib/modules.ts 那一份**，不再手抄。
//
// 手抄那份漂过两次：2026-08-10 虾米看股翻 live 时忘了同步（构建断言拦下），
// 2026-08-11 它只列了 crossborder / stocks 两个，而真源里有六个 ——
// 于是切换器里永远到不了另外四个，且没人发现，因为它们都还没上线。
//
// 是否显示由运营台的「模块显隐」在运行时决定（见 loadHidden），
// 跟这份清单无关；这份只回答「一共有哪些模块、各自去哪」。
// status 留原始 key，牌子上的字在渲染时按「运营台放没放出来」现算
// （见 lib/modules.ts 的 statusWhenVisible）——在这里就翻成中文的话，
// 这份清单是构建期生成的，运营台后来勾了也改不动它。
const MODULES = MODULE_TRUTH.map((m) => ({
  key: m.key, title: m.title, href: m.href ?? "/", status: m.status,
}));

/**
 * 运营台的「模块显隐」。**切换器要跟首页看到同一份真源。**
 *
 * 2026-08-11：运营台把虾米看股设成隐藏，首页照做了（收进「预览隐藏的模块」），
 * 而左上角的切换器照样列着它 —— 因为这份清单是硬抄的、根本不读运营台。
 * 同一个模块在同一个页眉下，一个地方藏了一个地方没藏。
 *
 * 取不到就**全部显示**：这一层是导航不是权限，读不到配置时让人走得动，
 * 比让人卡住强（真正的门在各模块自己的后端上，比如虾米看股的 STOCK_ACCESS）。
 */
async function loadVisible(): Promise<Set<string>> {
  // 兜底：运营台没保存过这个模块时，用 status 决定 —— live/trial 显示，planned 隐藏。
  // **跟首页的 moduleVisibleDefault 同一条规则**，两处不能各定一套。
  const byStatus = (m: { key: string; status: string }) => m.status !== "planned";
  let vis: Record<string, boolean> = {};
  try {
    const r = await fetch("/v1/site-settings", { credentials: "include" });
    if (r.ok) {
      const d = (await r.json()) as { modulesVis?: Record<string, boolean> };
      vis = d.modulesVis ?? {};
    }
  } catch { /* 读不到就全按 status 兜底 —— 这一层是导航不是权限 */ }
  return new Set(MODULE_TRUTH.filter((m) => vis[m.key] ?? byStatus(m)).map((m) => m.key));
}

async function loadAccount(): Promise<Account> {
  const blank = { name: "", email: "", plan: "free", credits: null, guestLeft: null, loggedIn: false,
                  verifyNeeded: false, signupGrant: 0, dailyGrant: 0 };
  try {
    const session = await fetch("/v1/session", { credentials: "include" });
    if (!session.ok) throw new Error(String(session.status));
    const data = (await session.json()) as {
      user?: { display_name?: string; email?: string; plan_tier?: string } | null;
      verify_needed?: boolean; signup_grant?: number; daily_login_grant?: number;
    };
    if (!data.user) {
      // 游客也要拿到今日体验额度：那是「先试试」的钩子，不是登录之后才有的东西。
      let guestLeft: number | null = null;
      try {
        const quota = await fetch("/v1/guest/quota", { credentials: "include" });
        if (quota.ok) {
          const q = (await quota.json()) as { guest?: boolean; left?: number };
          if (q.guest) guestLeft = q.left ?? null;
        }
      } catch { /* 取不到就退回纯「登录」，不影响页眉可用 */ }
      return { ...blank, guestLeft, reachable: true };
    }
    let credits: number | null = null;
    try {
      const me = await fetch("/v1/me", { credentials: "include" });
      if (me.ok) credits = ((await me.json()) as { credits?: { available?: number } }).credits?.available ?? null;
    } catch { /* 积分取不到不影响页眉可用 */ }
    return {
      name: data.user.display_name || data.user.email || "我的账户",
      email: data.user.email || "",
      plan: data.user.plan_tier || "free",
      credits,
      guestLeft: null,
      loggedIn: true,
      reachable: true,
      verifyNeeded: !!data.verify_needed,
      signupGrant: data.signup_grant ?? 0,
      dailyGrant: data.daily_login_grant ?? 0,
    };
  } catch {
    // 后端没起也要把链接渲染出来,否则用户卡在一个退不回去的页面里
    return { ...blank, reachable: false };
  }
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function Check() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Grid() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

function Info() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}

/** 模块图标。和主站 lib/modules.ts 的选型对齐：跨境是地球，做实验是锥形瓶，看股是打开的书。 */
function ModuleIcon({ module }: { module: string }) {
  if (module === "crossborder") {
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" stroke="currentColor" strokeWidth="1.8" /></svg>;
  }
  if (module === "cslab") {
    // lucide 的 flask-conical，与 lib/modules.ts 里那个是同一个形状
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2M6.453 15h11.094M8.5 2h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 7v13M12 7a4 4 0 00-4-4H3v13h5a4 4 0 014 4M12 7a4 4 0 014-4h5v13h-5a4 4 0 00-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M15.5 12.5l1.6 1.6 3.1-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IconGrid() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/></svg>; }
function IconDoc() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>; }
function IconCoin() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7"/><path d="M12 7.5v9M9.6 9.8h4.2a1.7 1.7 0 010 3.4H9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function IconGear() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function IconOut() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 17l5-5-5-5M20 12H9M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }

function Caret() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

async function logout() {
  try { await fetch("/v1/auth/logout", { method: "POST", credentials: "include" }); } catch { /* 退不掉也要刷新，让用户看到真实状态 */ }
  // 清本机用户业务数据，防止同浏览器下一个用户／游客串号看到。
  // **制品此前漏了这一步**，而主站一直有 —— 两份实现各走各的，正是合并要消灭的。
  try { clearLocalUserDataAndOwner(); } catch { /* 隐私模式下 localStorage 可能不可用 */ }
  // **留在当前页，不要甩回主站首页。**
  //
  // 原来是 location.href = "/"：在虾米跨境退出登录会跳回主站，在虾米看股也一样。
  // 退出登录跟「我正在看哪一页」无关，而那一页多半退出后照样能看
  // （行情、公开资料本来就不要求登录）。跳走等于替用户做了一个他没要求的导航。
  //
  // 仍然整页刷新而不是只刷页眉：登录态一变，页面上的数据也该跟着按新身份重取。
  window.location.reload();
}

/** 导出给主站直接 import。**子应用走 chrome.js 制品，主站走这里 —— 同一个组件。** */
export function Header({ moduleKey, padding }: { moduleKey: string; padding?: string }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const switcherRef = useOutsideClose(() => setSwitcherOpen(false));
  const accountRef = useOutsideClose(() => setAccountOpen(false));

  const [loginOpen, setLoginOpen] = useState(false);
  // 初值给 null：还没问到运营台之前先不渲染任何模块项，
  // 否则会闪一下"全都在"，而那正好是不该露的那几个。
  const [visible, setVisible] = useState<Set<string> | null>(null);
  useEffect(() => { void loadVisible().then(setVisible); }, []);
  const reload = () => loadAccount().then(setAccount).then(() => undefined);
  useEffect(() => { void reload(); }, []);

  /**
   * AI 调用扣完分之后，重新拉一次余额。
   *
   * ⚠️ **这个监听 2026-09-10 才补上，而事件早就在发了。**
   * `lib/api.ts` 与 `app/account/checkout-modal.tsx` 都 dispatch 了
   * `xm-credits-changed`（注释还写着「到账即刷新页眉积分胶囊」「#P5」），
   * 但两份页眉合并成这一份时**没人接**——于是那个行为静悄悄没了：
   * 用一次 AI、买一次积分，胶囊上的数字都要等切页或刷新才变。
   * 不报错、不白屏，只是数字是陈的 —— 又一次「合并时漏掉一条，看不出来」。
   *
   * 登录态拉余额、游客态拉当日剩余额度，`loadAccount` 里本来就分好了。
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChanged = () => { void reload(); };
    window.addEventListener("xm-credits-changed", onChanged);
    return () => window.removeEventListener("xm-credits-changed", onChanged);
  }, []);

  /**
   * 记住「账户中心是从哪个模块进的」。
   *
   * ⚠️ 2026-08-16 修：**这一步原来只写在主站的 `site-chrome.tsx` 里**，
   * 而子应用加载的是这份制品 —— 于是从 `/atlas` 点进账户中心，
   * 读到的是**上次逛主站时留下的旧值**，返回按钮写着「← 虾米跨境」。
   *
   * 页眉自己就拿到了 `moduleKey`，这件事本来就该由它做：
   * **谁知道当前是哪个模块，谁负责记。** 主站那一层的同名逻辑因此可以退休
   * （留着会写两次，且两处取值口径迟早分叉）。
   *
   * 账户页自身不覆写 —— 否则一进账户中心就把来源改成了「账户中心」。
   */
  useEffect(() => {
    if (typeof window === "undefined" || !moduleKey) return;
    if (window.location.pathname.startsWith("/account")) return;
    try { sessionStorage.setItem("xm-acct-from", moduleKey); } catch { /* 隐私模式下写不进，返回按钮回落首页 */ }
  }, [moduleKey]);

  // **"home" / "about" 是平台页，不是模块。**
  //
  // 而 MODULES 里恰好有一个 key="home" 的模块（买房助手）—— 直接按 key 查，
  // 主站首页（传 active="home"）的页眉就会显示成「当前模块：买房助手」。
  // 这条防撞判断原本在 site-chrome.tsx 里，2026-08-11 把页眉换成制品时漏带了。
  const PLATFORM_PAGES = new Set(["home", "about"]);
  const current = PLATFORM_PAGES.has(moduleKey)
    ? undefined
    : MODULES.find((item) => item.key === moduleKey);
  return (
    <header className="topbar xm-embedded-chrome" style={padding ? { padding } : undefined}>
      <div className="brand-switch" ref={switcherRef}>
        <a className="brand-mark-link" href="/" aria-label="回虾米伙伴首页">
          <span className="brand-mark"><XiamiMark size={26} /></span>
        </a>
        <button className="switch" type="button" aria-haspopup="menu" aria-expanded={switcherOpen}
                onClick={() => setSwitcherOpen((value) => !value)}>
          <span className="switch-lock">
            <span className="switch-sup">虾米伙伴 ›</span>
            <span className="switch-cur">{current?.title ?? "模块广场"}</span>
          </span>
          <span className="switch-caret"><Caret /></span>
        </button>
        {switcherOpen && (
          <div className="sw-menu" role="menu">
            {current && (
              <>
                <div className="sw-sec">当前模块</div>
                <span className="sw-item dim" aria-current="true">
                  <span className="sw-mi"><ModuleIcon module={current.key} /></span>{current.title}
                  <span className="sw-check"><Check /></span>
                </span>
              </>
            )}
            <div className="sw-sec">切换到</div>
            {MODULES.filter((item) => item.key !== moduleKey && (visible?.has(item.key) ?? false)).map((item) => (
              <a className="sw-item" href={item.href} role="menuitem" key={item.key}>
                <span className="sw-mi"><ModuleIcon module={item.key} /></span>{item.title}
                {/* 这个列表上面已经按 visible 过滤过了，所以能出现在这里的一律是
                    「运营台放出来的」——传 true 不是偷懒，是这一行的前提。 */}
                <span className="sw-st live">{MODULE_STATUS_TEXT[statusWhenVisible(item.status, true)]}</span>
              </a>
            ))}
            <div className="sw-foot">
              <a href="/" role="menuitem"><Grid /> 模块广场（全部模块）</a>
              <a href="/about" role="menuitem"><Info /> 关于我们</a>
            </div>
          </div>
        )}
      </div>

      {/* **用主站的 .top-actions，不自造类名。**
          它带着 margin-left: auto —— 那正是把右侧账号区推到最右边的东西。
          制品原来自造了一个 .xm-chrome-slot，没有这条，于是左右两块挤在一起
          （虾米看股没露馅是因为它有自己的布局撑着）。
          今天第四次栽在自造类名上，前三次是 .cp-dot / .pw-row / .xm-chrome-guest。 */}
      <div className="top-actions xm-chrome-slot" ref={accountRef}>
        {account === null && <span className="xm-chrome-offline">…</span>}
        {account?.reachable === false && <span className="xm-chrome-offline" title="主站后端未连接">独立模式</span>}
        {account?.loggedIn && (
          <>
            {/* **用主站的 .credit-pill，不自造 .xm-credits。**
                自造的那个类在 globals.css 里根本不存在 —— 它的样式是构建脚本
                手写塞进产物 CSS 的。于是子应用（加载产物）有样式，
                主站（只有 globals.css）是一段裸文字。今天第五次栽在自造类名上。
                登录态与游客态本来就共用 .credit-pill，这里回到同一套。 */}
            {/**
              * 登录了但还没验证邮箱 —— 注册赠额没到账，余额多半是 0。
              *
              * **这一档必须在胶囊上说出来。** 不说的话用户看到的是：
              * 游客「◈ 今日 5 积分」→ 注册 →「◈ 0」，比不注册还不如，
              * 而原因（赠额要先验证邮箱）只写在主站 /account 里 ——
              * 子应用只加载这份制品，那句话它永远看不到。
              *
              * 数字一律取自后端（signup_grant / daily_login_grant），
              * 不在文案里写死 —— 原来的 title 就硬写着「每天登录自动领 10 积分」。
              */}
            {account.verifyNeeded && account.signupGrant > 0 ? (
              <a className="credit-pill is-verify" href="/account/#profile"
                 title={`注册赠的 ${account.signupGrant} 积分要先验证邮箱才到账` +
                        (account.dailyGrant > 0 ? `，之后每天登录还能领 ${account.dailyGrant} 积分` : "") + "。点开去验证。"}>
                <span className="cp-dot">◈</span>
                {account.credits === null ? "…" : fmtWan(account.credits)}
                <em>验证邮箱领 {account.signupGrant}</em>
              </a>
            ) : (
              <a className="credit-pill" href="/account/#credits"
                 title={"AI 积分余额" + (account.dailyGrant > 0 ? ` · 每天登录自动领 ${account.dailyGrant} 积分（当天有效）` : "")}>
                <span className="cp-dot">◈</span>
                {account.credits === null ? "…" : fmtWan(account.credits)}
              </a>
            )}
            <button className="acct-btn" type="button" aria-haspopup="menu" aria-expanded={accountOpen}
                    onClick={() => setAccountOpen((value) => !value)}>
              <span className="acct-av">{account.name.slice(0, 1)}</span>
              <span className="switch-caret"><Caret /></span>
            </button>
            {accountOpen && (
              <div className="acct-menu" role="menu">
                <div className="acct-head">
                  <span className="acct-av lg">{account.name.slice(0, 1)}</span>
                  <div><b>{account.name}</b><span>{account.email}</span></div>
                </div>
                <div className="acct-plan">
                  {/* 主站这里写的是「跨境套餐」，但 plan_tier 是账号级的、不是模块级的，
                      通用页眉里叫「当前套餐」才准确。 */}
                  <span>当前套餐</span>
                  <span className="acct-pill">{account.plan === "free" ? "免费版" : account.plan}</span>
                </div>
                <div className="acct-list">
                  <a className="acct-item" href="/account/" role="menuitem"><IconGrid /> 账户中心</a>
                  {/* 模块专属入口只在对应模块里出现：在虾米看股里摆「我的商品」，
                      用户点进去是空的，比不给入口更让人困惑。 */}
                  {MODULE_LINKS[moduleKey]?.map((item) => (
                    <a className="acct-item" href={item.href} role="menuitem" key={item.href}>
                      <IconDoc /> {item.label}
                    </a>
                  ))}
                  <a className="acct-item" href="/account/#credits" role="menuitem">
                    <IconCoin /> AI 积分
                    <span className="acct-rt">{account.credits === null ? "" : account.credits.toLocaleString("zh-CN")}</span>
                  </a>
                  <a className="acct-item" href="/account/#orders" role="menuitem"><IconDoc /> 订单与发票</a>
                  <a className="acct-item" href="/account/#settings" role="menuitem"><IconGear /> 设置</a>
                </div>
                {/* 用主站的 acct-item danger sep：自造的 acct-foot / acct-out
                    在 globals.css 里根本没有规则，一直是没样式的（新加的
                    孤儿类名守卫第一次跑就把它们抓出来了）。 */}
                <button className="acct-item danger sep" type="button" role="menuitem"
                        onClick={() => void logout()}>
                  <IconOut /> 退出登录
                </button>
              </div>
            )}
          </>
        )}
        {/* 登录弹窗就地弹，不再整页跳回主站 —— 跳走会丢掉你在子应用里的位置，
            而登录本身跟你正在看哪一页无关。 */}
        {/* **未登录也给积分胶囊。**
            主站的头对游客显示「今日 N 积分 · 未登录」，而这份制品原来只给一个
            光秃秃的「登录」——同一个平台，两个模块的右上角长得不一样。

            胶囊比按钮强的地方在于它说出了产品货币：一个游客看到「今天有 5 分
            可以用」才有理由留下来试，看到「登录」只会关掉。
            额度取不到就退回纯「登录」，不让页眉因为一个次要请求失败而少一块。 */}
        {account?.reachable && !account.loggedIn && (
          account.guestLeft !== null
            // 类名与主站逐字一致（credit-pill / is-guest / cp-dot），
            // 样式才捞得到 —— 自造一个类名等于没样式。
            ? <button className="credit-pill is-guest" type="button" onClick={() => setLoginOpen(true)}
                 title="游客每天免费领 5 积分体验 AI（当天有效）；登录后每天领 10 积分。">
                <span className="cp-dot">◈</span>
                今日 {account.guestLeft} 积分
                <em>未登录</em>
              </button>
            : <button className="xm-chrome-login" type="button" onClick={() => setLoginOpen(true)}>登录</button>
        )}
      </div>
      {/* refresh 传自己那份：制品页面上没有 AuthProvider。
          登录完只刷新页眉，不整页 reload —— 子应用那边的状态没道理被清掉。 */}
      {/*  登录弹窗的副标题按**当前模块**给：在课堂里就说进度和错题本，
           别再拿跨境的「商品模型」糊弄所有人（lib/modules.ts 的 loginIntro）。 */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} refresh={reload}
                  intro={MODULE_TRUTH.find((m) => m.key === moduleKey)?.loginIntro} />
    </header>
  );
}

/* 省流的独立按钮去掉了。
 *
 * 它是 position: fixed 钉在左下角 —— 主站是整页居中布局，那儿是空的；
 * 而虾米看股左边有 248px 侧栏，这颗按钮正好压在侧栏上（实测 x=14, y=816）。
 * 页脚进制品之后，每个带侧栏的模块都会中一次。
 *
 * 而它管的本来就是宠物（定格动画），**宠物菜单里已经有「回家休息」** ——
 * 同一件事两个入口，去掉重复的那个。省流的开关逻辑（lib/eco-mode）没动，
 * 宠物仍然订阅它；需要重新暴露入口时，放进宠物菜单而不是再钉一颗浮动按钮。
 */
export function Footer({ padding }: { padding?: string }) {
  return (
    <footer className="site-footer xm-embedded-chrome" style={padding ? { padding } : undefined}>
      <PetWidget />
      <div className="sf-brand">
        <span className="brand-mark"><XiamiMark size={24} /></span>
        <span className="sf-lock"><b>虾米伙伴</b><span>让复杂的事，简单一点。</span></span>
      </div>
      <span className="sf-stmt">一个模块化的 AI 增强工具平台</span>
      <div className="sf-links">
        <a href="/about">关于我们</a><a href="/terms">用户协议</a>
        <a href="/privacy">隐私政策</a><a href="/feedback">问题 &amp; 功能反馈</a>
      </div>
      <div className="sf-legal">
        <span>© 2026 虾米伙伴 · XIAMI MATE</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">闽ICP备2026015046号-1</a>
      </div>
    </footer>
  );
}

export interface MountOptions {
  /** 当前模块，决定面包屑里显示哪个名字 */
  module?: string;
  /** 覆盖内边距。主站默认 0 4vw / 26px 5vw 是给整页居中用的；
   *  子应用有侧边栏时要自己给，否则内容会缩在右半边。 */
  headerPadding?: string;
  footerPadding?: string;
}

function mount(selector: string, render: (options: MountOptions) => React.ReactElement, options: MountOptions) {
  const host = document.querySelector(selector);
  if (!host) return;
  createRoot(host).render(render(options));
}

const api = {
  version: "1",
  header(selector: string, options: MountOptions = {}) {
    mount(selector, (o) => <Header moduleKey={o.module ?? ""} padding={o.headerPadding} />, options);
  },
  footer(selector: string, options: MountOptions = {}) {
    mount(selector, (o) => <Footer padding={o.footerPadding} />, options);
  },
};

declare global { interface Window { XiamiChrome?: typeof api } }
// **挂全局是「当制品用」时才需要的副作用。**
//
// 主站现在直接 import 这个文件里的 Header/Footer（同一份实现），而主站是静态导出、
// 预渲染在 Node 里跑 —— 模块顶层碰 window 会让整个构建挂掉
// （实测：ReferenceError: window is not defined，/account 与 /crossborder/wiki 预渲染失败）。
if (typeof window !== "undefined") window.XiamiChrome = api;
export default api;
