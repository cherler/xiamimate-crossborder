/**
 * AI 后端地址与开关（客户端）。
 *
 * 静态前端本身不跑 AI；所有 AI 调用打到独立的后端服务(阿里云 FastAPI)。
 * 后端地址由构建期注入 NEXT_PUBLIC_API_BASE(NEXT_PUBLIC_ 前缀才会进静态包)。
 * 没配后端时 AI_ENABLED=false：aiFetch 直接返回「即将上线」，不发请求、不 404。
 */

// API_BASE 留空即走【相对路径】(同域:打到当前访问的域,隧道/公网都通,cookie 同源最稳)。
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
// AI 开关只看 NEXT_PUBLIC_AI_ENABLED,不再要求 API_BASE 非空(同域相对路径就够)。
export const AI_ENABLED = (process.env.NEXT_PUBLIC_AI_ENABLED ?? "") === "1";
/** 账号功能(登录/收藏)—— 后端与前端同域,生产恒可用。 */
export const AUTH_ENABLED = true;

/**
 * 本地开发时把 API 主机名对齐到当前页面主机名。
 * 原因:localhost 与 127.0.0.1 被浏览器视作不同站点,SameSite=Lax 的登录 Cookie
 * 跨站不会带上,导致登录后取不到身份。
 *
 * 防发布事故:若构建时误把本机 8200 地址编进生产包,公网访问时强制回退同域。
 * 生产入口由 Caddy 将 /v1、/api、/media 转给后端,绝不能让访客请求自己电脑的 8200。
 */
function resolvedBase(): string {
  if (typeof window !== "undefined" && API_BASE) {
    try {
      const u = new URL(API_BASE);
      const localHosts = ["127.0.0.1", "localhost"];
      if (localHosts.includes(u.hostname)) {
        if (localHosts.includes(window.location.hostname)) {
          u.hostname = window.location.hostname;
          return u.origin;
        }
        return "";
      }
    } catch { /* ignore */ }
  }
  return API_BASE;
}

export function apiUrl(path: string): string {
  return `${resolvedBase()}${path}`;
}

/** 带 Cookie 的请求(账号态)。后端未配置时抛错,调用方兜底提示。 */
export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!AUTH_ENABLED) {
    return new Response(JSON.stringify({ detail: "账号功能即将上线。" }),
      { status: 503, headers: { "content-type": "application/json" } });
  }
  return fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
}

/**
 * AI 请求统一入口。后端未配置时返回一个 503 的合成响应，
 * 调用方现有的 `if (!res.ok) throw new Error(data.error)` 逻辑会照常把
 * 「AI 功能即将上线」提示出来——所有 AI 触点一处兜底，无需逐个改。
 */
export async function aiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!AI_ENABLED) {
    return new Response(
      JSON.stringify({ error: "AI 功能即将上线，敬请期待。基础计算器已全部可用。" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  // 经过后端 AI 闸口:登录用 Cookie 扣积分,游客用 visitor 头按日限量。
  const { visitorId } = await import("./usage");
  const resp = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: { "x-visitor-id": visitorId(), ...(init?.headers || {}) },
  });
  // AI 调用成功即已在后端结算(扣积分)—— 通知头部积分胶囊重新拉余额(#P5),
  // 不必等用户切页/刷新。失败(4xx/5xx,含 402 余额不足)余额未变,不发。
  if (resp.ok && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("xm-credits-changed"));
  }
  return resp;
}

/** AI 响应安全解析:非 2xx 或空/坏 JSON 一律抛中文错误(带状态码),绝不把底层解析异常抛给用户(QA-006)。 */
export async function aiJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = "";
    try { msg = ((await res.json()) as { error?: string })?.error ?? ""; } catch { /* 空/非JSON响应体 */ }
    throw new Error(msg || `请求失败(${res.status}),服务暂时不可用,请稍后重试。`);
  }
  try { return (await res.json()) as T; } catch {
    throw new Error("服务响应异常,请稍后重试。");
  }
}
