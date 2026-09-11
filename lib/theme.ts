/**
 * 外观偏好：随系统 / 白天 / 黑夜 —— **平台级设置，真源在这里**。
 *
 * 2026-08-15 负责人拍板：「应该在公共的账户中心的设置里，有三个选项：
 * 随系统、白天、黑夜。图标是一个显示器、一个太阳、一个月亮。」
 *
 * ## 为什么存 localStorage 而不是存后端
 *
 * 三个理由，按重要性排：
 *
 * 1. **游客也要能设。** 晚上被白底晃眼这件事和登没登录没关系。存后端就等于
 *    「想护眼请先注册」。
 * 2. **不能有闪白。** 存后端意味着首屏要等一次请求回来才知道该画成什么色 ——
 *    那一瞬间的白正是这个功能要消灭的东西。localStorage 是同步的。
 * 3. **主站和 /atlas 是同一个源**（都在 xiamimate.com 上，子应用走路径不走子域），
 *    localStorage 天然共用，一处设置到处生效，不需要任何同步机制。
 *
 * ⚠️ **例外：`admin.xiamimate.com` 是另一个源，读不到这个值。** 运营台自己是深色台，
 * 不参与这个设置 —— 这是已知的，不是漏做。
 *
 * ## 「随系统」= 把标记删掉，不是算出一个值写进去
 *
 * CSS 里 `prefers-color-scheme` 已经把「跟随系统」实现好了。这里要是写一个
 * 算出来的 "light"/"dark" 进去，就变成了一张**拍下来那一刻的快照** ——
 * 系统入夜自动转深色时，页面反而不跟了。
 */
export type ThemePref = "system" | "light" | "dark";

/** 键名带 `xm-` 前缀，和平台令牌同一套命名 —— 同源下各子应用共用一个 key。 */
export const THEME_KEY = "xm-theme";

/**
 * 首屏那一帧只能由内联脚本决定 —— React 挂载时浏览器已经画过一帧了。
 * 系统深色由 CSS 直接管住不需要 JS；**手动选过的那份存在 localStorage 里**，
 * 不在这里同步读出来，选了黑夜的人每翻一页都要先被闪一下白。
 *
 * 这段字符串同时给主站和子应用用：改这里，两边一起改（子应用各自内联一份拷贝，
 * 因为它们构建时拿不到本仓的模块）。
 */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function writeThemePref(p: ThemePref) {
  try {
    if (p === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, p);
  } catch {
    /* 隐私模式下写不进去；页面本次仍然会变，只是刷新后回到跟随系统。 */
  }
  applyThemePref(p);
}

export function applyThemePref(p: ThemePref) {
  const el = document.documentElement;
  if (p === "system") delete el.dataset.theme;
  else el.dataset.theme = p;
}
