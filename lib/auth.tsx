"use client";

/**
 * 账号态(登录/注册/退出/当前用户)。跨子域共享登录靠后端的域级 Cookie,
 * 前端只管调接口 + 缓存当前用户。收藏等需登录的功能从 useAuth() 取 user。
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AUTH_ENABLED, authFetch } from "./api";
import { guardLocalOwner } from "./local-scope";
import { productDay } from "./business-day";

export type AuthUser = {
  user_id: string;
  email: string;
  display_name: string;
  plan_tier: string;
  email_verified: boolean;
  is_admin?: boolean;
};

type ApiError = Error & { status?: number };

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await authFetch(path, init);
  let data: unknown = null;
  try { data = await r.json(); } catch { /* no body */ }
  if (!r.ok) {
    const detail = (data as { detail?: string } | null)?.detail;
    const err: ApiError = new Error(detail || `请求失败(${r.status})`);
    err.status = r.status;
    throw err;
  }
  return data as T;
}

type MeResp = { user: AuthUser };
type RegisterResp = { user: AuthUser; dev_code?: string; signup_grant?: number; daily_login_grant?: number };

export type CreditView = { balance: number; reserved: number; available: number };
export type LedgerEntry = {
  entry_type: string; delta: number; balance_after: number;
  description: string | null; created_at: string;
  task_type?: string | null;   // "ai:import"/"research:scan"/… 消耗归属(模块:功能)
};
export type CreditLot = {
  source: string; source_label: string; remaining: number;
  expires_at: string | null; never_expires: boolean; days_left: number | null;
};
export type MeFull = {
  user: AuthUser;
  plan: { tier: string; name?: string | null; expires_at: string | null };
  credits: CreditView;
  /**
   * 商品档案额度 —— 唯一的付费点。读不出来时服务端整块不回,
   * 前端也就不显示:显示一个错的用量比不显示糟。
   */
  archives?: { used: number; limit: number; freeLimit: number; proLimit: number };
};
export type GuestQuota = { guest: boolean; limit?: number; used?: number; left?: number };

export const authApi = {
  me: () => call<MeResp>("/v1/me"),
  meFull: () => call<MeFull>("/v1/me"),
  credits: () => call<{ account: CreditView; ledger: LedgerEntry[]; lots?: CreditLot[] }>("/v1/credits"),
  redeemCredits: (code: string) =>
    call<{ ok: boolean; credits: number; account: CreditView }>("/v1/credits/redeem", {
      method: "POST", body: JSON.stringify({ code }),
    }),
  updateProfile: (display_name: string) =>
    call<MeResp>("/v1/me", { method: "PATCH", body: JSON.stringify({ display_name }) }),
  guestQuota: async (): Promise<GuestQuota> => {
    const { visitorId } = await import("./usage");
    return call<GuestQuota>("/v1/guest/quota", { headers: { "x-visitor-id": visitorId() } });
  },
  // 身份探测专用:未登录返回 200 {user:null},游客控制台不再每页记一条 401;
  // 登录用户顺路完成每日领取,daily_grant>0 表示这次领到了
  session: () => call<{ user: AuthUser | null; daily_grant?: number; verify_needed?: boolean; signup_grant?: number; daily_login_grant?: number }>("/v1/session"),
  register: (email: string, password: string, legal_version?: string) =>
    call<RegisterResp>("/v1/auth/register", { method: "POST", body: JSON.stringify({ email, password, legal_version }) }),
  login: (email: string, password: string) =>
    call<MeResp>("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => call("/v1/auth/logout", { method: "POST" }),
  deleteAccount: (password: string) =>
    call("/v1/account/delete", { method: "POST", body: JSON.stringify({ password, confirm: "注销" }) }),
  exportData: () => call<Record<string, unknown>>("/v1/account/export"),
  getMarketing: () => call<{ opt_out: boolean }>("/v1/account/marketing"),
  setMarketing: (opt_out: boolean) =>
    call<{ opt_out: boolean }>("/v1/account/marketing", { method: "POST", body: JSON.stringify({ opt_out }) }),
  sendCode: () => call<{ dev_code?: string }>("/v1/auth/email/send-code", { method: "POST" }),
  verifyEmail: (code: string) =>
    call("/v1/auth/email/verify", { method: "POST", body: JSON.stringify({ code }) }),
  forgotPassword: (email: string) =>
    call<{ ok: boolean; dev_code?: string }>("/v1/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email: string, code: string, new_password: string) =>
    call("/v1/auth/password/reset", { method: "POST", body: JSON.stringify({ email, code, new_password }) }),
};

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
  // 已登录但邮箱未验证:注册赠额与每日领取都还没开启 —— 用来驱动验证提示。
  verifyNeeded: boolean;
  signupGrant: number;   // 注册赠额(单一真源 = 后端 config.SIGNUP_GRANT)
  dailyGrant: number;    // 每日登录领取额度(config.DAILY_LOGIN_GRANT)
};

const AuthContext = createContext<Ctx>({
  user: null, loading: true, refresh: async () => {}, setUser: () => {},
  verifyNeeded: false, signupGrant: 0, dailyGrant: 0,
});

// 「今天」必须与**服务端发放**用的时区一致(见 lib/business-day.ts)——
// 用浏览器本地时区的话,悉尼用户会有 21 小时探不到跨天,欧洲用户晚 7 小时。
const localDay = productDay;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyNeeded, setVerifyNeeded] = useState(false);
  const [grants, setGrants] = useState<{ signup: number; daily: number }>({ signup: 0, daily: 0 });
  // 上次拉取 /v1/session 的本地日期。每日领取绑定"打开/回到 App 的新一天",
  // 用它判断是否跨天,避免重复探测。
  const lastProbeDay = useRef<string>(localDay());

  const refresh = useCallback(async () => {
    if (!AUTH_ENABLED) { setLoading(false); return; }
    try {
      const d = await authApi.session();
      lastProbeDay.current = localDay();
      // 归属守卫:每次拿到"当前是谁"就核对一次本机数据的归属,对不上立刻清。
      // 退出登录有多个入口,而**会话自然过期**不经过任何退出代码 —— 只有在这里
      // 拦,才能保证同一台机器上换人登录时看不到上一个账号的商品档案。
      guardLocalOwner(d.user?.user_id ?? null);
      setUser(d.user);
      setVerifyNeeded(Boolean(d.verify_needed));
      if (d.signup_grant != null || d.daily_login_grant != null) {
        setGrants({ signup: d.signup_grant ?? 0, daily: d.daily_login_grant ?? 0 });
      }
      if (d.daily_grant && d.daily_grant > 0) {
        // 通知界面(积分胶囊提示 + 虾米君开心一下)
        window.dispatchEvent(new CustomEvent("xm-daily-grant", { detail: { amount: d.daily_grant } }));
        window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "happy" } }));
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 每日领取应绑定"新的一天回到虾米伙伴",而不是"退出再登录":
  // 标签页跨天仍开着、或 SPA 内客户端导航都不会重挂 AuthProvider,只有整页刷新/重登才会重拉
  // /v1/session。这里在标签重新可见 / 获得焦点 / 定时兜底里,发现本地日期已翻篇就再拉一次会话,
  // 顺带触发幂等的 claim_daily —— 已领过返回 0,安全且几乎零成本(只有跨天那一次真正发请求)。
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    const maybeReprobe = () => { if (localDay() !== lastProbeDay.current) refresh(); };
    const onVisible = () => { if (document.visibilityState === "visible") maybeReprobe(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", maybeReprobe);
    // 兜底:一直开着且始终聚焦的标签页(跨午夜不会触发 focus/visibility)靠定时器补上。
    const timer = window.setInterval(maybeReprobe, 5 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", maybeReprobe);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return (
    <AuthContext.Provider value={{
      user, loading, refresh, setUser,
      verifyNeeded: Boolean(user) && verifyNeeded,
      signupGrant: grants.signup, dailyGrant: grants.daily,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
