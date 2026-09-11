/** 数字的人话显示。 */

/** 金额显示:千分位 + 固定两位小数(不带货币符号,调用方自行加 $)。
 *  非有限值(极端输入溢出成 Infinity/NaN)如实回「—」,不吐一屏乱码。 */
export function money2(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** tokens 紧凑显示:≥1 万用「X.X万」(去掉多余 .0),小数字原样带千分位。 */
export function fmtWan(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) {
    const w = n / 10000;
    const s = w >= 100 ? Math.round(w).toString() : (Math.round(w * 10) / 10).toString();
    return `${s.replace(/\.0$/, "")}万`;
  }
  return n.toLocaleString();
}
