/**
 * 账号级收藏(saved_item)客户端。登录后工具的「保存」落到这里(云端),
 * 游客仍走 localStorage;登录时把本机记录一次性迁移上云(注册后不丢之前的活)。
 */
import { authFetch } from "./api";

/** 时间轴上的一格。没有 payload —— 要看内容单独取那一版。 */
export type ItemVersion = {
  version: number;
  /** create / update / delete / rollback */
  op: string;
  title: string;
  /** 该版内容的字节数。用户靠它认出「哪一版是我清空之前的那份」,比版本号直观。 */
  size: number;
  createdAt: string;
};

export type SavedItem = {
  item_id: string;
  module: string;
  tool: string | null;
  title: string;
  payload: Record<string, unknown>;
  note: string | null;
  created_at: string;
  updated_at: string;
  /** 乐观锁版本(服务端单调 +1)。老响应可能没有,按 1 处理。 */
  version?: number;
  /** 业务身份(商品档案的 stableId)。sql/044 起提成列并加了唯一约束。 */
  stable_id?: string | null;
  /** 列表卡片用的摘要,形状由客户端定 —— 服务端不解析内容。 */
  summary?: Record<string, unknown> | null;
};

export type DeletedItem = {
  item_id: string;
  title: string;
  stable_id: string | null;
  size: number;
  deletedAt: string;
};

/** 卡片:**没有 payload**。列表用它,详情按需再取。 */
export type ItemCard = Omit<SavedItem, "payload"> & { summary?: Record<string, unknown> | null };

/**
 * 版本冲突(409)。
 *
 * 必须是独立类型而不是普通 Error:服务端在 detail 里回带了**当前的完整条目**,
 * 客户端要拿它做合并。直接 new Error(detail) 会把对象拼成 "[object Object]",
 * 合并依据当场丢失,只能退回盲目覆盖 —— 那就等于没做乐观锁。
 */
export class ItemConflictError extends Error {
  readonly current: SavedItem;
  constructor(current: SavedItem) {
    super("这条档案在别处已被修改");
    this.name = "ItemConflictError";
    this.current = current;
  }
}

/**
 * 云端保存额度用尽(409)。
 *
 * 也必须是独立类型:这是**永久**失败,重试一万次也不会成功。
 * 调用方把它和网络抖动混在一起的话,退避重试会永远跑下去,
 * 而界面挂着「正在自动重试」—— 一个不会兑现的希望。
 */
export class ItemQuotaError extends Error {
  readonly module: string;
  readonly limit: number;
  readonly used: number;
  /** 升级能不能解决。false = 撞的是防滥用上限,劝升级只会让人白花钱。 */
  readonly upgradable: boolean;
  constructor(d: { module: string; limit: number; used: number; upgradable?: boolean; message?: string }) {
    super(d.message || `云端保存已达上限(${d.limit} 条)。`);
    this.name = "ItemQuotaError";
    this.module = d.module;
    this.limit = d.limit;
    this.used = d.used;
    this.upgradable = !!d.upgradable;
  }
}

async function j<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const r = await authFetch(path, init);
  let d: unknown = null;
  try { d = await r.json(); } catch { /* no body */ }
  if (!r.ok) {
    const detail = (d as { detail?: unknown } | null)?.detail;
    if (r.status === 409 && detail && typeof detail === "object") {
      const code = (detail as { code?: string }).code;
      if (code === "version_conflict") throw new ItemConflictError((detail as { item: SavedItem }).item);
      if (code === "quota_exceeded") {
        throw new ItemQuotaError(detail as { module: string; limit: number; used: number; upgradable?: boolean; message?: string });
      }
    }
    throw new Error(typeof detail === "string" ? detail : `请求失败(${r.status})`);
  }
  return d as T;
}

function listQuery(module: string, tool?: string, limit?: number, cursor?: string | null, fields?: "card") {
  const q = new URLSearchParams({ module });
  if (tool) q.set("tool", tool);
  if (limit) q.set("limit", String(limit));
  if (fields) q.set("fields", fields);
  // 游标是不透明的 base64url,原样回传即可 —— 别去解析它
  if (cursor) q.set("cursor", cursor);
  return `/v1/items?${q.toString()}`;
}

export const itemsApi = {
  list: (module: string, tool?: string, limit?: number, cursor?: string | null) =>
    j<{ items: SavedItem[]; next_cursor: string | null }>(listQuery(module, tool, limit, cursor)),
  /** 只拉卡片(不含 payload)。档案多的用户全量拉会把 localStorage 撑爆。 */
  listCards: (module: string, tool?: string, limit?: number, cursor?: string | null) =>
    j<{ items: ItemCard[]; next_cursor: string | null }>(listQuery(module, tool, limit, cursor, "card")),
  get: (id: string) => j<{ item: SavedItem }>(`/v1/items/${id}`),
  create: (body: { module: string; tool?: string | null; title?: string; payload?: unknown; note?: string; stable_id?: string; summary?: unknown }) =>
    j<{ item: SavedItem; deduped?: boolean }>("/v1/items", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; payload?: unknown; note?: string; base_version?: number; summary?: unknown }) =>
    j<{ item: SavedItem }>(`/v1/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  /** 版本时间轴。刻意不带 payload —— 20 版就是几百 KB,而这里只是列表。 */
  history: (id: string) =>
    j<{ kept: number; history: ItemVersion[] }>(`/v1/items/${id}/history`),
  /** 某一版的完整内容,给「回滚前先看看」用 */
  historyOne: (id: string, version: number) =>
    j<{ version: number; op: string; title: string; payload: unknown; createdAt: string }>(
      `/v1/items/${id}/history/${version}`),
  /** 已删档案(「最近删除」)。归属从历史取 —— saved_item 里已经没这行了。 */
  deleted: () => j<{ keepDays: number; items: DeletedItem[] }>("/v1/items/deleted"),
  /** 彻底删除:连历史一并抹掉,之后再也恢复不了 */
  purge: (id: string) => j(`/v1/items/deleted/${id}`, { method: "DELETE" }),
  restore: (id: string) => j<{ item: SavedItem }>(`/v1/items/deleted/${id}/restore`, { method: "POST" }),
  rollback: (id: string, version: number) =>
    j<{ item: SavedItem; restored_from: number }>(`/v1/items/${id}/rollback`,
      { method: "POST", body: JSON.stringify({ version }) }),
  remove: (id: string) => j(`/v1/items/${id}`, { method: "DELETE" }),
};

const LOCAL_PREFIX = "xm:hist:";

type LocalHist = { ts: number; values: Record<string, unknown>; label: string };

/** 登录后把本机各工具的保存记录迁移到云端,成功后清掉本机副本。best-effort。 */
export async function migrateLocalItems(module = "crossborder"): Promise<number> {
  if (typeof window === "undefined") return 0;
  let migrated = 0;
  const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(LOCAL_PREFIX));
  for (const key of keys) {
    const tool = key.slice(LOCAL_PREFIX.length);
    let arr: LocalHist[] = [];
    try { arr = JSON.parse(window.localStorage.getItem(key) || "[]"); } catch { arr = []; }
    // 旧的先入,保持时间顺序
    for (const it of [...arr].reverse()) {
      try {
        await itemsApi.create({ module, tool, title: it.label || "未命名", payload: it.values });
        migrated += 1;
      } catch { /* 跳过失败的单条 */ }
    }
    window.localStorage.removeItem(key);
  }
  return migrated;
}
