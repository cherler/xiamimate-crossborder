/**
 * 个人信息出境「单独同意」(PIPL 第39条)。
 * 深度研究 / 联网检索会把检索词发往境外服务商(Tavily/Firecrawl/TikHub)。
 * Brave/Jina 已从清单移除:大陆机房不可达,生产经 NET_PROVIDERS_DISABLED=brave,jina
 * 禁用、无实际数据流;若日后重新启用,先更新隐私政策与本清单再开。
 * 首次使用前需取得用户单独、明示的同意,并留痕(本机 + 后端)。
 */
import { LEGAL_VERSION } from "./index";
import { authFetch, AUTH_ENABLED } from "../api";

const KEY = "xm:xborder-consent";

/** 境外接收方清单(展示用)。 */
export const CROSS_BORDER_RECIPIENTS = "Tavily(联网检索)、Firecrawl(网页读取)、TikHub(TikTok 评价采样)";

export function crossBorderConsented(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const r = JSON.parse(window.localStorage.getItem(KEY) || "null");
    return !!(r && r.version === LEGAL_VERSION);   // 协议改版后需重新同意
  } catch { return false; }
}

export function recordCrossBorderConsent(): void {
  if (typeof window === "undefined") return;
  const record = { version: LEGAL_VERSION, agreed_at: new Date().toISOString(), source: "cross_border" };
  try { window.localStorage.setItem(KEY, JSON.stringify(record)); } catch { /* 忽略 */ }
  if (AUTH_ENABLED) {
    // 后端留痕(登录用户);best-effort,不阻断。
    authFetch("/v1/legal/consent", {
      method: "POST",
      body: JSON.stringify({ version: LEGAL_VERSION, source: "cross_border" }),
    }).catch(() => { /* 静默 */ });
  }
}
