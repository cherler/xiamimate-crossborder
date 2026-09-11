/**
 * 最近使用的工具(#63)。本机记录,不上云 —— 这是使用痕迹,不是资产。
 */

const KEY = "xm:recent-tools";
const CAP = 6;

type Entry = { id: string; ts: number };

export function markToolUsed(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: Entry[] = raw ? JSON.parse(raw) : [];
    const rest = Array.isArray(list) ? list.filter((e) => e && e.id !== id) : [];
    window.localStorage.setItem(KEY, JSON.stringify([{ id, ts: Date.now() }, ...rest].slice(0, CAP)));
  } catch { /* ignore */ }
}

export function listRecentTools(): Entry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((e) => e && e.id) : [];
  } catch { return []; }
}
