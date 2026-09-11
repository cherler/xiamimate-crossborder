/**
 * 省流 / 静态模式(#eco):一个全局总闸,冻结持续重绘的氛围动画与像素宠物动作。
 *
 * 为什么要它:远程桌面 / 慢网下,每次画布重绘都要重新编码串流 = 卡。把 hero 气泡
 * 与虾米君的动画帧停掉(保留静态造型),连续重绘归零。不改动画本身,只加一个开关。
 *
 * 判定优先级:用户显式选择(localStorage) > 自动预判(Data Saver / 慢网 / reduced-motion)。
 * 变化通过订阅广播,并在 <html data-eco> 上打标记供 CSS 使用。
 */

const KEY = "xm:eco";   // "1" 开 / "0" 关 / 不存在 = 未手动设过,走自动
let eco = false;
let inited = false;
const listeners = new Set<(v: boolean) => void>();

function autoDetect(): boolean {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (c) {
      if (c.saveData) return true;
      if (typeof c.effectiveType === "string" && ["slow-2g", "2g", "3g"].includes(c.effectiveType)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

function apply(v: boolean) {
  eco = v;
  try { document.documentElement.setAttribute("data-eco", v ? "1" : "0"); } catch { /* ignore */ }
  for (const l of listeners) l(v);
}

/** 首次挂载时调用(客户端)。读显式偏好,没有则自动预判。幂等。 */
export function initEco() {
  if (inited || typeof window === "undefined") return;
  inited = true;
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* ignore */ }
  apply(stored === "1" ? true : stored === "0" ? false : autoDetect());
}

export function isEco(): boolean { return eco; }

/** 手动设置(记住偏好,今后不再被自动预判覆盖)。 */
export function setEco(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
  apply(v);
}

export function toggleEco() { setEco(!eco); }

/** 订阅省流状态变化。返回取消订阅函数。 */
export function subscribeEco(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
