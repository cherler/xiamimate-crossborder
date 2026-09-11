"use client";

/** 站点通用页头与页脚。页眉 = 母品牌 › 模块切换器（左）+ 账户（右）。 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bookmark, Check, ChevronDown, Coins, FileText, Grid2x2, Info, LayoutGrid, LogOut, Puzzle, ReceiptText, Settings, User, Zap } from "lucide-react";
import { initEco, isEco, subscribeEco, toggleEco } from "../lib/eco-mode";
import { MODULES, MODULE_STATUS_TEXT, isModuleVisible, moduleByKey, type PlatformModule } from "../lib/modules";
import { AUTH_ENABLED } from "../lib/api";
import { clearLocalUserDataAndOwner } from "../lib/local-scope";
import { authApi, useAuth } from "../lib/auth";
import { Header as ChromeHeader, Footer as ChromeFooter } from "../chrome-embed";
import { XiamiMark } from "./logo";
import { fmtWan } from "../lib/format";
import { useModuleVis } from "../lib/use-module-vis";

type Active = "home" | "crossborder" | "about";

const CURRENT_LABEL: Record<Active, string> = {
  crossborder: "跨境经营", home: "模块广场", about: "关于我们",
};

/**
 * 「← 回到某模块」的返回链。
 *
 * 站内 14 个页面各自手写了这条面包屑,而**恰好漏掉的三页是最需要它的**:
 * 「我的商品」「账户中心」「浏览器扩展」—— 都是从跨境工作区点进去、看完就要回去的地方。
 * 用户报的现象:每次都得点左上角菜单再选「虾米跨境」,当成退出键用。
 *
 * 抽成组件不是为了省几行,是为了让**下一个新页面不必再想起这件事**:
 * 手写十四遍就一定会漏第十五遍,而漏掉的症状是「用户走不回去」,不报任何错。
 *
 * 账户中心是跨模块的,所以它的返回目标不写死:SiteHeader 会在非账户页把
 * 当前模块记进 sessionStorage(xm-acct-from),这里读它 —— 从哪来回哪去。
 */
export function BackTo({ moduleKey = "crossborder" }: { moduleKey?: string }) {
  /*
   * "home" / "about" 是**平台页**，不是模块，所以显式挡掉。
   *
   * 2026-08-11 之前 MODULES 里还有一个 key="home" 的模块（买房助手），
   * 于是 moduleByKey("home") 会查到它 —— 主站首页的页眉一度显示成
   * 「当前模块：买房助手」。那个模块已经删了，但这条判断留着：
   * **平台页的名字不该跟模块 key 共用一个命名空间**，
   * 哪天有人再拿 "home"/"about" 当模块 key，这里仍然挡得住。
   */
  const m = moduleKey === "home" || moduleKey === "about" ? undefined : moduleByKey(moduleKey);
  if (!m?.href) return <Link className="tool-breadcrumb" href="/"><ArrowLeft size={13} /> 首页</Link>;
  // 跨境模块在站内一直叫「虾米跨境」(那 14 个页面都这么写),沿用
  const label = m.key === "crossborder" ? "虾米跨境" : m.title;
  return (
    <a className="tool-breadcrumb" href={m.href}>
      <ArrowLeft size={13} /> {label}
    </a>
  );
}

/**
 * 账户中心专用:返回到「进来之前那个模块」,拿不到就回首页。
 *
 * **拿不到时必须仍然渲染一条链。** 第一版是「读到 sessionStorage 之前不渲染」,
 * 想躲开「首页 → 虾米跨境」那一下文案跳变;代价是直接打开 /account
 * (书签、新会话、从邮件点进来)时**那条链根本不出现** ——
 * 正是这次要修的那个问题:用户走不回去。
 * 闪一下是小瑕疵,没有出口是硬伤,不该拿后者换前者。
 */
export function BackToOrigin() {
  const [from, setFrom] = useState("");
  useEffect(() => {
    try { setFrom(sessionStorage.getItem("xm-acct-from") || ""); } catch { /* ignore */ }
  }, []);
  return <BackTo moduleKey={from || "home"} />;
}

/**
 * 主站的页眉/页脚。**内脏是页眉制品那一份**（chrome-embed/index.tsx）。
 *
 * ## 为什么不再各写一份
 *
 * 在这之前是两份实现：主站 364 行、制品 310 行，而制品才是子应用加载的那个。
 * 于是「主站改了页眉，子应用下次刷新就跟上」这句话是假的 —— 它只跟着制品那份走，
 * 而那份要人手工同步。代价是实打实的：
 *
 *   · 未登录时主站有「今日 5 积分」胶囊，子应用只有一个光秃秃的「登录」
 *   · 模块清单两份，靠一条构建断言硬拦才没漂
 *   · 登出时主站会清本机用户数据防串号，制品漏了这一步
 *   · 登录弹窗只在主站有，子应用只能整页跳回主站
 *   · 接一个新模块要在四处手抄清单里各加一行
 *
 * 现在一份：**子应用加载 chrome.js 制品，主站直接 import 同一个组件。**
 * 这两个名字保留，因为站内 20 个文件在用它们 —— 换的是内脏不是接口。
 */
export function SiteHeader({ active = "crossborder" }: { active?: Active }) {
  /**
   * 记住来源模块这件事**已经搬进 chrome-embed 的 Header 里**（2026-08-16）。
   *
   * 原来的注释写着「这件事只有主站要做（子应用没有账户中心）」—— **那句话是错的**：
   * 子应用没有账户中心*页面*，但它有**进账户中心的入口**（页眉右上角就是）。
   * 于是从 /atlas 点进去，返回按钮读到的是上次逛主站留下的旧值。
   *
   * 现在由拿到 `moduleKey` 的那一层统一负责，这里不再写第二遍。
   */
  return <ChromeHeader moduleKey={active} />;
}

export function SiteFooter() {
  return <ChromeFooter />;
}
