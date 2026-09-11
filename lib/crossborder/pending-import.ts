/**
 * 跨页预填暂存槽（智能路由用）。
 *
 * 工具中心底部的智能路由在用户确认后，把「识别到的参数」写进这里，然后跳到某个工具页。
 * 一份资料可能同时喂得动多个工具，所以按 toolId 存成一张表：跳去哪个工具，
 * 那个工具挂载时就取用自己那份并清掉；其余的留着，等用户去到别的工具再各自取用。
 *
 * 用 sessionStorage 而不是 localStorage：这是一次会话内的临时交接，
 * 不该跨会话存活，也不该被「访问过工具中心」这种事污染。SSR 安全。
 */

const STORAGE_KEY = "xm:pending-import";

export type PendingImportField = { key: string; value: number };

export type PendingImport = {
  toolId: string;
  fields: PendingImportField[];
  productName?: string;
  marketplace?: string;
};

type StoredEntry = {
  fields: PendingImportField[];
  productName?: string;
  marketplace?: string;
};
type StoredSlot = { tools: Record<string, StoredEntry>; ts: number };

function sanitizeFields(raw: unknown): PendingImportField[] {
  return Array.isArray(raw)
    ? raw
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({ key: String(f.key || ""), value: Number(f.value) }))
        .filter((f) => f.key && Number.isFinite(f.value))
    : [];
}

function sanitizeSlot(raw: unknown): StoredSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!r.tools || typeof r.tools !== "object") return null;
  const tools: Record<string, StoredEntry> = {};
  for (const [toolId, entryRaw] of Object.entries(r.tools as Record<string, unknown>)) {
    if (!toolId || !entryRaw || typeof entryRaw !== "object") continue;
    const e = entryRaw as Record<string, unknown>;
    const fields = sanitizeFields(e.fields);
    if (!fields.length) continue;
    tools[toolId] = {
      fields,
      productName: e.productName ? String(e.productName).slice(0, 120) : undefined,
      marketplace: e.marketplace ? String(e.marketplace).slice(0, 120) : undefined,
    };
  }
  if (!Object.keys(tools).length) return null;
  return { tools, ts: Number(r.ts) || Date.now() };
}

function readSlot(): StoredSlot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeSlot(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 一次暂存多个工具的预填。每个 entry 的 fields 为空会被丢弃。 */
export function writePendingImports(entries: PendingImport[]): void {
  if (typeof window === "undefined") return;
  const tools: Record<string, StoredEntry> = {};
  for (const e of entries) {
    const fields = sanitizeFields(e.fields);
    if (!e.toolId || !fields.length) continue;
    tools[e.toolId] = { fields, productName: e.productName, marketplace: e.marketplace };
  }
  if (!Object.keys(tools).length) { clearPendingImport(); return; }
  try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tools, ts: Date.now() } satisfies StoredSlot)); }
  catch { /* ignore quota */ }
}

export function clearPendingImport(): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * 取出属于该工具的预填并从暂存里移除。别的工具那份留着，等它们自己去取。
 * 全部取完后清空整个槽。
 */
export function takePendingImport(toolId: string): PendingImport | null {
  if (typeof window === "undefined") return null;
  const slot = readSlot();
  const entry = slot?.tools[toolId];
  if (!slot || !entry) return null;
  delete slot.tools[toolId];
  if (Object.keys(slot.tools).length) {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slot)); } catch { /* ignore */ }
  } else {
    clearPendingImport();
  }
  return { toolId, fields: entry.fields, productName: entry.productName, marketplace: entry.marketplace };
}
