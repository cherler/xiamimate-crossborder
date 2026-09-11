"use client";

/** 登录 / 注册弹窗。注册即登录;邮箱验证不阻断,注册后给一步「可选验证」。 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { authApi, useAuth } from "../../lib/auth";
import { migrateLocalItems } from "../../lib/items";
import { recordLegalConsent } from "../../lib/legal-consent";
import { LEGAL_VERSION } from "../../lib/legal/version";
import { checkPassword } from "../../lib/password";

type Mode = "login" | "register" | "forgot";
type Props = {
  open: boolean; onClose: () => void; onDone?: () => void; intro?: string;
  /** 登录成功后刷新「我是谁」。
   *
   *  **默认走 useAuth() 的 Context**，主站不用传。而页眉制品是独立打包的、
   *  页面上没有 AuthProvider（Context 会退回默认值里那个空函数 refresh），
   *  所以它把自己那份刷新传进来。
   *
   *  这样这个弹窗**只有一份实现**：主站和所有子应用 import 同一个文件。
   *  抄一份进制品的话，以后改注册流程、改协议版本，两边就开始各走各的。 */
  refresh?: () => Promise<void> | void;
};

/** 密码强度可视化:强度条 + 规则实时勾选。 */
function PasswordMeter({ pw }: { pw: string }) {
  const c = checkPassword(pw);
  return (
    <div className="pw-meter">
      <div className="pw-bar" aria-hidden>
        <span className={`pw-fill is-${c.strength}`} style={{ width: `${Math.min(100, (c.score / 5) * 100)}%` }} />
      </div>
      <div className="pw-meta">
        <span className={`pw-strength is-${c.strength}`}>强度:{c.strengthLabel}</span>
        <span className="pw-rules">
          {c.rules.map((r, i) => (
            <em key={i} className={r.ok ? "ok" : ""}>{r.ok ? "✓" : "○"} {r.label}</em>
          ))}
        </span>
      </div>
    </div>
  );
}

export function LoginModal({ open, onClose, onDone, intro, refresh: refreshProp }: Props) {
  const ctx = useAuth();
  const refresh = refreshProp ?? ctx.refresh;
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [verifyStep, setVerifyStep] = useState<null | { devCode?: string; signupGrant?: number; dailyGrant?: number }>(null);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  // 忘记密码流:sent = 验证码已发,resetOk = 已重设
  const [forgotSent, setForgotSent] = useState<null | { devCode?: string }>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetOk, setResetOk] = useState(false);
  // 注册须先勾选同意《用户协议》《隐私政策》(合规:注册前显著同意 + 版本留痕)。
  const [agreed, setAgreed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setTimeout(() => emailRef.current?.focus(), 40); }
    else {
      setErr(""); setBusy(false); setVerifyStep(null); setCode(""); setVerified(false);
      setForgotSent(null); setNewPassword(""); setResetOk(false); setMode("login"); setAgreed(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register" && !checkPassword(password).passed) {
      setErr("密码需 8–64 位,且同时包含字母和数字。");
      return;
    }
    if (mode === "register" && !agreed) {
      setErr("请先阅读并勾选同意《用户协议》和《隐私政策》。");
      return;
    }
    setErr(""); setBusy(true);
    try {
      if (mode === "login") {
        await authApi.login(email.trim(), password);
        await refresh();
        await migrateLocalItems().catch(() => {});   // 把本机保存迁移上云,不丢之前的活
        onDone?.(); onClose();
      } else {
        // 协议版本随注册请求一起发,后端在建用户同事务内留痕(原子)。
        const r = await authApi.register(email.trim(), password, LEGAL_VERSION);
        recordLegalConsent();   // 本机再留一份(前端可查),后端留痕才是权威依据
        await refresh();
        await migrateLocalItems().catch(() => {});
        // 已登录,进验证步 —— 带上赠额/每日额度值(后端 config,单一真源),引导以奖励为主。
        setVerifyStep({ devCode: r.dev_code, signupGrant: r.signup_grant ?? 0, dailyGrant: r.daily_login_grant ?? 0 });
        // 置标记:若用户没当场验证,下次进站由 SignupWelcome 一次性补提醒(不与本弹窗叠弹)。
        try { localStorage.setItem("xm_signup_welcome", "1"); } catch { /* 隐私模式忽略 */ }
      }
    } catch (e) {
      setErr((e as Error).message || "出错了,请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!forgotSent) {
        const r = await authApi.forgotPassword(email.trim());
        setForgotSent({ devCode: r.dev_code });
      } else {
        await authApi.resetPassword(email.trim(), code.trim(), newPassword);
        setResetOk(true);
        setPassword("");
        setTimeout(() => { setMode("login"); setForgotSent(null); setCode(""); setResetOk(false); }, 1200);
      }
    } catch (e) {
      setErr((e as Error).message || "出错了,请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function doVerify(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await authApi.verifyEmail(code.trim());
      await refresh();
      setVerified(true);
      setTimeout(() => { onDone?.(); onClose(); }, 900);
    } catch (e) {
      setErr((e as Error).message || "验证码不对。");
    } finally {
      setBusy(false);
    }
  }

  // **挂到 body 上。**
  //
  // 遮罩是 position: fixed，但它只对「最近的层叠上下文」定位。页眉制品把这个
  // 弹窗渲染在 <header class="topbar"> 里面，而那个 header 有 position: relative
  // + z-index —— 于是遮罩被关在页眉那一层里：位置歪、盖不住下面的页面，
  // 底下照样能点。主站没事只是因为它恰好渲染在页面根部。
  //
  // portal 到 body，谁在哪儿渲染它都一样。
  // 容器带上 xm-embedded-chrome：**制品的样式全部加了这个前缀作用域**
  // （见 build-chrome-artifacts 的 scopeSelectors），portal 到 body 之后
  // 弹窗就不在页眉那个根元素里了，不带这个类的话一条选择器都不匹配 ——
  // 表现是弹窗裸奔在页面最底下，没有遮罩、没有卡片、没有定位。
  // 主站不受影响：那边没有这套作用域，多一个类名不改变任何东西。
  return createPortal(
    <div className="xm-embedded-chrome auth-overlay" onMouseDown={onClose}>
      <div className="auth-box" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="auth-x" onClick={onClose} aria-label="关闭"><X size={16} /></button>

        {verifyStep ? (
          <div className="auth-body">
            {verified ? (
              <div className="auth-ok"><span className="auth-ok-ic"><Check size={22} /></span>
                <b>已验证 —— {verifyStep.signupGrant ? `${verifyStep.signupGrant} 积分已到账` : "注册积分已到账"}</b></div>
            ) : (
              <>
                <h3 className="auth-title">
                  {verifyStep.signupGrant ? `验证邮箱,领 ${verifyStep.signupGrant} 注册积分` : "验证邮箱领取注册积分"}
                </h3>
                <p className="auth-sub">
                  验证码已发到 <b>{email.trim()}</b>。验证后
                  {verifyStep.signupGrant ? <> <b>立即到账 {verifyStep.signupGrant} 积分</b>(够跑一份深度研究报告)</> : "注册积分立即到账"}
                  {verifyStep.dailyGrant ? <>,并开启每天登录领 {verifyStep.dailyGrant} 积分</> : ""}。
                </p>
                {verifyStep.devCode && (
                  <p className="auth-devcode">本地调试验证码:<code>{verifyStep.devCode}</code></p>
                )}
                <form onSubmit={doVerify}>
                  <input className="auth-input" inputMode="numeric" maxLength={6} placeholder="6 位验证码"
                    value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
                  {err && <p className="auth-err">{err}</p>}
                  <button className="auth-submit" type="submit" disabled={busy || code.length < 6}>
                    {busy ? <Loader2 size={15} className="auth-spin" /> : "验证"}
                  </button>
                </form>
                <button className="auth-skip" onClick={() => { onDone?.(); onClose(); }}>先跳过</button>
              </>
            )}
          </div>
        ) : mode === "forgot" ? (
          <div className="auth-body">
            {resetOk ? (
              <div className="auth-ok"><span className="auth-ok-ic"><Check size={22} /></span><b>密码已重设,请用新密码登录</b></div>
            ) : (
              <>
                <h3 className="auth-title">找回密码</h3>
                <p className="auth-sub">{forgotSent
                  ? <>验证码已发到 <b>{email.trim()}</b>,输入验证码并设置新密码。</>
                  : "输入注册邮箱,我们发一个 6 位验证码给你。"}</p>
                {forgotSent?.devCode && (
                  <p className="auth-devcode">本地调试验证码:<code>{forgotSent.devCode}</code></p>
                )}
                <form onSubmit={doForgot}>
                  <input ref={emailRef} className="auth-input" type="email" autoComplete="username" placeholder="邮箱"
                    value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!forgotSent} />
                  {forgotSent && (
                    <>
                      <input className="auth-input" inputMode="numeric" maxLength={6} placeholder="6 位验证码"
                        value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
                      <input className="auth-input" type="password" autoComplete="new-password" placeholder="新密码(至少 6 位)"
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                    </>
                  )}
                  {err && <p className="auth-err">{err}</p>}
                  <button className="auth-submit" type="submit"
                    disabled={busy || (!!forgotSent && (code.length < 6 || newPassword.length < 6))}>
                    {busy ? <Loader2 size={15} className="auth-spin" /> : (forgotSent ? "重设密码" : "发送验证码")}
                  </button>
                </form>
                <p className="auth-foot">
                  想起来了?<button onClick={() => { setMode("login"); setErr(""); setForgotSent(null); }}>返回登录</button>
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="auth-body">
            <div className="auth-tabs">
              <button className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setErr(""); }}>登录</button>
              <button className={mode === "register" ? "on" : ""} onClick={() => { setMode("register"); setErr(""); }}>注册</button>
            </div>
            {(() => {
              /*  ⚠️ 兜底这句原来是「登录后,你的商品模型云端保存、多设备同步。」——
                  一句**跨境专属**的话，却是全平台的默认值（`intro` 那时一个调用方都没有）。
                  于是在虾米CS课堂点登录，弹窗告诉你"你的商品模型会云端保存"。
                  现在按模块给（lib/modules.ts 的 loginIntro，由页眉传进来）；
                  拿不到模块时说一句中性的 —— **宁可笼统，也不能说别的模块的事**。 */
              const sub = intro || (mode === "login" ? "登录后，你在虾米伙伴的资料与进度云端保存、多设备同步。" : "");
              return sub ? <p className="auth-sub">{sub}</p> : null;
            })()}
            <form onSubmit={submit}>
              <input ref={emailRef} className="auth-input" type="email" autoComplete="username" placeholder="邮箱"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="auth-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "密码" : "设置密码"}
                value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "login" ? undefined : 8} />
              {mode === "register" && password.length > 0 && <PasswordMeter pw={password} />}
              {mode === "register" ? (
                <label className="auth-consent">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>我已阅读并同意
                    <a href="/terms" target="_blank" rel="noopener">《用户协议》</a>和
                    <a href="/privacy" target="_blank" rel="noopener">《隐私政策》</a></span>
                </label>
              ) : (
                <p className="auth-consent-hint">登录即表示您同意
                  <a href="/terms" target="_blank" rel="noopener">《用户协议》</a>与
                  <a href="/privacy" target="_blank" rel="noopener">《隐私政策》</a>。</p>
              )}
              {err && <p className="auth-err">{err}</p>}
              <button className="auth-submit" type="submit"
                disabled={busy || (mode === "register" && (!agreed || !checkPassword(password).passed))}>
                {busy ? <Loader2 size={15} className="auth-spin" /> : (mode === "login" ? "登录" : "注册")}
              </button>
            </form>
            <p className="auth-foot">
              {mode === "login"
                ? <>还没有账号?<button onClick={() => { setMode("register"); setErr(""); }}>去注册</button>
                  <span className="auth-sep">·</span>
                  <button onClick={() => { setMode("forgot"); setErr(""); }}>忘记密码?</button></>
                : <>已有账号?<button onClick={() => { setMode("login"); setErr(""); }}>去登录</button></>}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
