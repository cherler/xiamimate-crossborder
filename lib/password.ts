/**
 * 密码策略(前后端同口径)。硬性门槛采用普遍做法:8–64 位、同时含字母与数字;
 * 强度条只做引导,不做门槛(NIST 现代建议:长度优先,别逼用户凑符号但鼓励更强)。
 * 后端 register 用同一套硬性规则强校验(见 backend routes/auth.py)。
 */
export type PwRule = { label: string; ok: boolean };
export type PwStrength = "weak" | "medium" | "strong";
export type PwCheck = {
  rules: PwRule[];        // 硬性规则(全 ok 才可提交)
  passed: boolean;        // 硬性规则是否全部满足
  strength: PwStrength;   // 强度(引导用)
  strengthLabel: string;  // 弱 / 中 / 强
  score: number;          // 0–5,用于强度条宽度
};

export const PW_MIN = 8;
export const PW_MAX = 64;

export function checkPassword(pw: string): PwCheck {
  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const hasLetter = hasLower || hasUpper;

  const rules: PwRule[] = [
    { label: `${PW_MIN}–${PW_MAX} 个字符`, ok: len >= PW_MIN && len <= PW_MAX },
    { label: "包含字母", ok: hasLetter },
    { label: "包含数字", ok: hasDigit },
  ];
  const passed = rules.every((r) => r.ok);

  // 强度评分(仅用于引导展示)
  let score = 0;
  if (len >= PW_MIN) score++;
  if (len >= 12) score++;
  if (hasLower && hasUpper) score++;
  if (hasDigit) score++;
  if (hasSymbol) score++;

  let strength: PwStrength = "weak";
  if (passed) strength = score >= 4 ? "strong" : "medium";
  const strengthLabel = strength === "strong" ? "强" : strength === "medium" ? "中" : "弱";
  return { rules, passed, strength, strengthLabel, score };
}
