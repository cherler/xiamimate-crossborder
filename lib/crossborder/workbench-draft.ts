/**
 * 工作台草稿:未保存的工作状态,自动留存、回来时恢复。
 *
 * 解决的问题很实际:口碑洞察跑一次分析要花积分、要等模型,而结果只活在
 * React state 里 —— 用户去点一下「深度报告」、或不小心切了页面,回来就是空的,
 * 那次分析的钱和时间都白花了。「映射建议」把报告入口挤到很下面之后,
 * 这个来回跳转几乎必然发生。
 *
 * 与「保存本次快照」是两回事,别混:
 *   草稿 = 我还在弄的东西。自动存、自动恢复、换商品各存各的,不进商品档案。
 *   快照 = 我要留着的东西。手动存、进商品档案、有名字有版本。
 *
 * 存 localStorage 而不是内存,因为跳转会整页重载(站点是静态导出,不是 SPA 路由)。
 */

const PREFIX = "xm_cb_draft:";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** 单份草稿的大小上限。localStorage 通常 5MB 左右,一份草稿吃掉一大半是不合理的。 */
const MAX_BYTES = 1_200_000;

type Envelope<T> = { at: number; data: T };

function key(tool: string, scope: string): string {
  return `${PREFIX}${tool}:${scope || "-"}`;
}

export function readDraft<T>(tool: string, scope: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(tool, scope));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    // 过期草稿不恢复:一周前那次分析用的样本多半也变了,恢复出来反而误导
    if (!env?.at || Date.now() - env.at > MAX_AGE_MS) {
      clearDraft(tool, scope);
      return null;
    }
    return env.data;
  } catch { return null; }
}

/**
 * 写草稿。
 *
 * `shrink` 用来在超限时丢掉可再生的大块(比如原始 CSV) —— 保住分析结果,
 * 因为那才是花了钱和时间的东西。丢不动就整体放弃,**不能**因为存草稿失败
 * 而影响正在进行的工作。
 */
export function writeDraft<T>(tool: string, scope: string, data: T, shrink?: (d: T) => T): boolean {
  if (typeof window === "undefined") return false;
  const put = (d: T) => {
    const body = JSON.stringify({ at: Date.now(), data: d } satisfies Envelope<T>);
    if (body.length > MAX_BYTES) return false;
    window.localStorage.setItem(key(tool, scope), body);
    return true;
  };
  try {
    if (put(data)) return true;
    if (shrink && put(shrink(data))) return true;
    clearDraft(tool, scope);
    return false;
  } catch {
    // 配额满 / 无痕模式:静默放弃。草稿是锦上添花,不能反过来打断用户
    try { clearDraft(tool, scope); } catch { /* 忽略 */ }
    return false;
  }
}

export function clearDraft(tool: string, scope: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key(tool, scope)); } catch { /* 忽略 */ }
}

/** 清掉所有过期草稿。页面加载时顺手调一次,免得废草稿长期占着配额。 */
export function pruneDrafts(now = Date.now()): number {
  if (typeof window === "undefined") return 0;
  let n = 0;
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (!k.startsWith(PREFIX)) continue;
      try {
        const env = JSON.parse(window.localStorage.getItem(k) || "{}") as Envelope<unknown>;
        if (!env?.at || now - env.at > MAX_AGE_MS) { window.localStorage.removeItem(k); n += 1; }
      } catch { window.localStorage.removeItem(k); n += 1; }
    }
  } catch { /* 忽略 */ }
  return n;
}


/**
 * 输入指纹:用来判断「再点一次分析」会不会白花钱。
 *
 * 分析一次要花积分、要等模型,而输入没变结果就不会变。用户实测时就点重了 ——
 * 界面上没有任何东西提示他已经有结果了。
 *
 * 只取长度 + 首尾片段,不哈希整份 CSV:几百 KB 的文本每次输入都全量哈希,
 * 是为了一个「按钮要不要变灰」付不成比例的代价。
 * 代价是理论上存在碰撞(改动恰好只发生在中段且长度不变)—— 那时用户仍可
 * 改一个字触发。宁可偶尔少拦一次,也不该为此拖慢每一次输入。
 */
export function inputFingerprint(csv: string, rivalCsv: string, context: string): string {
  return `${csv.length}|${csv.slice(0, 200)}|${csv.slice(-120)}`
    + `#${rivalCsv.length}|${rivalCsv.slice(0, 120)}|${context.trim()}`;
}
