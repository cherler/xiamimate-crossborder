/**
 * 用量上报(A6)。工具打开/运行时打一条到后端 /v1/usage/track。
 * 游客用本机持久的匿名 visitor_id 去重;登录用户后端按会话认身份。best-effort,失败静默。
 */
import { authFetch, AUTH_ENABLED } from "./api";

const VISITOR_KEY = "xm:vid";

export function visitorId(): string {
  if (typeof window === "undefined") return "";
  try {
    let v = window.localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = "v_" + (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
      window.localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}

export function track(module: string, tool: string | null, eventType = "tool_open"): void {
  if (!AUTH_ENABLED || typeof window === "undefined") return;
  // 不 await:上报不该拖住交互;失败静默。
  authFetch("/v1/usage/track", {
    method: "POST",
    body: JSON.stringify({ module, tool, event_type: eventType, visitor_id: visitorId() }),
  }).catch(() => { /* 静默 */ });
}
