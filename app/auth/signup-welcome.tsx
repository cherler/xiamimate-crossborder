"use client";

/**
 * 新注册用户的一次性欢迎/领取提醒弹窗。
 *
 * 触发:注册成功时 login-modal 置 localStorage 标记;本组件在【下一次页面加载】判定一次 ——
 * 因此不会和注册弹窗里的「验证邮箱」步骤叠着弹(那一步是当场的),这里是"回来后还没验证"的补提醒。
 * 只弹一次(判定后即清标记);若用户已验证则静默清标记不打扰。持久的轻提醒在积分胶囊上(is-verify)。
 */
import { useEffect, useRef, useState } from "react";
import { X, Gift } from "lucide-react";
import { useAuth } from "../../lib/auth";

const FLAG = "xm_signup_welcome";

export function SignupWelcome() {
  const { user, loading, verifyNeeded, signupGrant, dailyGrant } = useAuth();
  const [show, setShow] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (loading || decided.current) return;   // 每次页面加载只判定一次,且等账号态就绪
    decided.current = true;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(FLAG) !== "1") return;
    if (user && verifyNeeded && signupGrant > 0) {
      setShow(true);
      localStorage.removeItem(FLAG);          // 仅弹一次
    } else if (!verifyNeeded) {
      localStorage.removeItem(FLAG);          // 已验证,静默清除
    }
  }, [loading, user, verifyNeeded, signupGrant]);

  if (!show) return null;
  return (
    <div className="sw-pop-backdrop" role="dialog" aria-modal="true" onClick={() => setShow(false)}>
      <div className="sw-pop" onClick={(e) => e.stopPropagation()}>
        <button className="sw-pop-x" onClick={() => setShow(false)} aria-label="关闭"><X size={16} /></button>
        <span className="sw-pop-ic"><Gift size={22} /></span>
        <h3 className="sw-pop-title">你还有 {signupGrant} 积分待领取</h3>
        <p className="sw-pop-sub">
          验证邮箱即可立即到账 <b>{signupGrant} 积分</b>(够跑一份深度研究报告)
          {dailyGrant > 0 ? <>,之后每天登录还能领 {dailyGrant} 积分</> : ""}。
        </p>
        <div className="sw-pop-actions">
          <a className="sw-pop-go" href="/account/#profile" onClick={() => setShow(false)}>去验证领取</a>
          <button className="sw-pop-later" onClick={() => setShow(false)}>以后再说</button>
        </div>
      </div>
    </div>
  );
}
