/**
 * 同步状态 → 给用户看的一句话。**唯一一份**。
 *
 * 反向审查撞到的:syncState 里记着「N 项未同步」「本地已满,有丢失风险」
 * 「档案额度已满」,而 getSyncState() 全站只有**一个**读取方 ——
 * 商品切换器里的那枚胶囊,它只出现在工具页的下拉旁边。
 *
 * 于是最该看到这些警示的地方反而看不到:「我的商品」页的全部职责就是管档案,
 * 用户在那里改名、合并、删除,推送失败时页面上**没有任何变化** ——
 * 他以为存上了就走了。而本地仓现在只是缓存、云端才是主本(档案上限方案 B),
 * 一次没推上去的改动离「被冷淘汰清掉」只差一步。
 *
 * 状态写下来却没人读,和没写是一样的。所以把「怎么说」收在这里,
 * 让任何页面都能用同一套说法把它显示出来。
 *
 * 三种坏状态必须分开说 —— 用户该做的事完全不同:
 *   本地已满 → 只能他自己动手(整理档案/换浏览器),而且有丢数据的风险,最紧急;
 *   云端满   → 也得他动手,但本地那份是安全的,不急;
 *   没同步上 → 什么都不用做,等自动重试就行。
 * 都说成「N 项未同步 · 正在自动重试」的话,前两种根本不会自愈,那句是假话。
 */

import type { SyncState } from "./products";

export type SyncTone = "ok" | "pending" | "failed" | "danger" | "local";

export type SyncStatus = {
  tone: SyncTone;
  /** 胶囊上的短标签 */
  label: string;
  /** hover 详解 —— 说清「该不该动手、动什么手」 */
  title: string;
  /**
   * 需要常驻横幅的警示文案(只有本地已满会给)。
   * 这一条不能只做成 hover:那要用户先怀疑出了事、再把鼠标移上去,
   * 而他并不知道该怀疑。数据丢失的警示必须自己撞到眼前。
   */
  alarm?: { title: string; text: string };
};

export function describeSync(sync: SyncState, signedIn: boolean): SyncStatus {
  if (sync.localFull) {
    const how = signedIn
      ? "已改为优先推送云端 —— 请等状态变回「云端同步」再关页面,并尽快删除或合并一些用不到的商品档案。"
      : "请立即登录,让改动存到云端;或先删掉一些用不到的商品档案。";
    return {
      tone: "danger",
      label: "本地已满 · 有丢失风险",
      title: `浏览器本地存储已满,新的改动没能写进本机 —— 关掉标签页就会丢。${how}`,
      alarm: {
        title: "浏览器本地存储已满",
        text: `新的改动没能写进本机,关掉标签页就会丢。${how}`,
      },
    };
  }
  if (!signedIn) {
    return { tone: "local", label: "本机 · 登录后同步", title: "本机保存,登录后云端同步" };
  }
  if (sync.blocked) {
    const b = sync.blocked;
    // 说清「存量一个不动」是重点:用户最怕老档案出事,而实际上只有新建被拦。
    // 不说清楚,他会先去删自己的东西。
    const kept = "已有的档案全部照常使用、照常同步,只有新建的这份还没能上云。";
    return {
      tone: "failed",
      label: "档案额度已满",
      title: b.upgradable
        ? `商品档案已达免费额度(${b.used}/${b.limit} 份)。${kept}删掉一些用不到的档案,或订阅 Pro 不限量。`
        // 已经不是额度问题了:他要么是 Pro、要么被单独放开过。
        // 这时候再劝升级是耍人 —— 给一条真走得通的路。
        : `商品档案已达安全上限(${b.limit.toLocaleString()} 份)。${kept}如果这是正常使用,到「意见反馈」联系我们即可放开。`,
    };
  }
  if (sync.failed > 0) {
    return {
      tone: "failed",
      label: `${sync.failed} 项未同步`,
      title: `有 ${sync.failed} 项没能同步到云端(${sync.lastError || "网络问题"});正在自动重试,期间请勿清除浏览器数据`,
    };
  }
  if (sync.pushing) return { tone: "pending", label: "同步中…", title: "正在同步到云端…" };
  return { tone: "ok", label: "云端同步", title: "商品档案已同步到云端" };
}

/** 需不需要把它顶到用户眼前(而不是等他自己去看胶囊)。 */
export function syncNeedsAttention(s: SyncStatus): boolean {
  return s.tone === "danger" || s.tone === "failed";
}
