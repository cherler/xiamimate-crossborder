/**
 * 记录用户对《用户协议》《隐私政策》的同意(注册时)——本机留一份,供前端自查/展示。
 *
 * 权威留痕在后端:协议版本随注册请求发送,后端在「建用户同一事务」内写 legal_consent
 * (原子,不会出现"注册成功但没留痕")。故此处只写本机 localStorage,不再单独 POST,
 * 避免与注册留痕重复。/v1/legal/consent 端点保留给"版本更新后重新同意"等后续场景。
 */
import { LEGAL_VERSION } from "./legal/version";

const CONSENT_KEY = "xm:legal-consent";

export function recordLegalConsent(source = "register"): void {
  if (typeof window === "undefined") return;
  const record = { version: LEGAL_VERSION, agreed_at: new Date().toISOString(), source };
  try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record)); } catch { /* 忽略 */ }
}

/** 读取本机已同意的版本(如需在设置页展示或做版本变更再同意)。 */
export function getLegalConsent(): { version: string; agreed_at: string; source: string } | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(CONSENT_KEY) || "null"); } catch { return null; }
}
