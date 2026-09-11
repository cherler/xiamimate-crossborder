/**
 * 深度研究 —— 前端 API 封装(经 FastAPI 闸口,鉴权/限量/计费都在后端)。
 *
 * 端点契约:
 *   POST /api/crossborder/research-scan  可研究性扫描 —— 走通用 AI 闸口
 *                                        (游客日限量、登录按真实 tokens 结算)
 *   POST /v1/research                    启动正式研究(报价拦截:余额不足 402)
 *   GET  /v1/research                    我的研究列表
 *   GET  /v1/research/{id}               run 详情(轮询)
 *   POST /v1/research/{id}/resume        补额续跑 / 断点重试
 */

import { aiFetch, authFetch } from "../../api";
import type {
  ResearchRun, ResearchRunListItem, ResearchScope, ScanResult,
} from "./types";

async function toJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string; detail?: string }).error
      || (data as { detail?: string }).detail || `请求失败(${res.status})`;
    const err = new Error(msg) as Error & { status?: number; payload?: unknown };
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data as T;
}

export type ScanInput = {
  query: string;
  /** 竞品对比时传 rival_compare —— scan 会对每个竞品也做识别、预估按主体数算。 */
  intent?: ResearchScope["intent"];
  /** 来自商品档案的上下文(?from=product 时预填);竞品对比时 rivals 是必填主体清单。 */
  seed?: Partial<Pick<ResearchScope, "productName" | "asin" | "url" | "marketplace" | "rivals">>;
};

/**
 * 扫描去重键 = **商品身份**(商品名/ASIN + 市场),与档位/研究目标/竞品无关。
 * 因为一次扫描现在只识别「这个商品在公开网络的口碑资料面」——档位(需求洞察/竞品/综合)、
 * 目标(新品/优化)、竞品都是扫描之后在同一份结果上叠加的,不该各自重扫重扣。
 * 作 x-run-key(当天同商品重扫 dedup,cost=0)、前端缓存键、服务端持久化键,三处一致。
 * djb2 → base36,稳定短键(后端 run_key 截断到 64,这里远小于)。
 */
export function scanKey(input: ScanInput): string {
  const s = input.seed || {};
  const parts = [
    (input.query || s.productName || "").trim().toLowerCase(),
    (s.marketplace || "").toLowerCase(),
    (s.asin || "").trim().toLowerCase(),
  ].join("|");
  let h = 5381;
  for (let i = 0; i < parts.length; i++) h = ((h << 5) + h + parts.charCodeAt(i)) | 0;
  return "scan_" + (h >>> 0).toString(36);
}

/**
 * signal:尽量拦截(非通用闸口改造)——组件卸载时可 abort,SPA 内切走能省一次白花的
 * 请求;硬关标签页/整页跳转拦不住(JS 停止执行,浏览器自然断连,已是事实上的拦截)。
 * 供应商成本一旦请求发出就可能已产生,abort 只是"尽量少发生",不改变"发出即计费,
 * 不因中途退出退还"的口径。
 */
/**
 * 取回服务端已保存的扫描结果(付费产物,服务端持久化 —— 断连/换设备也在)。
 * 命中返回 ScanResult,未命中/未登录返回 null(静默,不打扰)。
 */
export async function getSavedScan(input: ScanInput): Promise<ScanResult | null> {
  try {
    const d = await toJson<{ scan: ScanResult | null }>(
      await authFetch(`/v1/research/saved-scan?key=${encodeURIComponent(scanKey(input))}`));
    return d.scan ?? null;
  } catch {
    return null;
  }
}

/** 已保存扫描的摘要(扫描页常驻「已保存的扫描」快捷入口用)。 */
export type SavedScanSummary = { scanKey: string; query: string; productName: string; updatedAt: string | null };

/** 我保存过的扫描列表(跨设备,服务端持久化)。未登录/失败返回空数组。 */
export async function listSavedScans(): Promise<SavedScanSummary[]> {
  try {
    const d = await toJson<{ scans: SavedScanSummary[] }>(await authFetch("/v1/research/saved-scans"));
    return d.scans ?? [];
  } catch {
    return [];
  }
}

/** 按 scanKey 直接取完整扫描结果(点已保存 chip 打开用)。未命中返回 null。 */
export async function getSavedScanByKey(scanKey: string): Promise<ScanResult | null> {
  try {
    const d = await toJson<{ scan: ScanResult | null }>(
      await authFetch(`/v1/research/saved-scan?key=${encodeURIComponent(scanKey)}`));
    return d.scan ?? null;
  } catch {
    return null;
  }
}

export async function scanResearch(input: ScanInput, signal?: AbortSignal): Promise<ScanResult> {
  return toJson(await aiFetch("/api/crossborder/research-scan", {
    method: "POST",
    // x-run-key:当天同一次扫描命中后端 dedup → 不重复扣分(中途退出再扫也不白扣)。
    headers: { "Content-Type": "application/json", "x-run-key": scanKey(input) },
    body: JSON.stringify(input),
    signal,
  }));
}

/** 派生关系(生命周期):从哪份报告派生、什么关系。 */
export type DeriveInfo = { originRunId: string; relation: import("./types").ResearchRelation };

/** 用户自有数据(P2):评论/退货 CSV 解析后的结构化行,作为 user_upload 证据进研究。 */
export type ResearchUserData = {
  reviews?: Array<{ rating: number; date?: string; variant?: string; text: string }>;
  returns?: Array<{ date?: string; variant?: string; reason: string; qty: number }>;
};

/** 启动正式研究:scope 必须是用户确认过的(含 assumed 标记)。
 * derive 传入时为「基于某份报告派生」(补资料/补竞品/换范围/升档),后端按谱系与复用处理。 */
export async function startResearch(scope: ResearchScope, proposedModules: string[], derive?: DeriveInfo,
                                    userData?: ResearchUserData): Promise<ResearchRun> {
  return toJson(await authFetch("/v1/research", {
    method: "POST",
    body: JSON.stringify({ scope, proposedModules,
                           ...(derive ? { originRunId: derive.originRunId, relation: derive.relation } : {}),
                           ...(userData && (userData.reviews?.length || userData.returns?.length) ? { userData } : {}) }),
  }));
}

/** 派生前预览增量报价:复用多少旧证据、预计增量积分、全新研究报价(用来算省了多少)。 */
export async function previewDeriveQuote(scope: ResearchScope, proposedModules: string[], derive: DeriveInfo):
  Promise<{ quote: number; fullQuote: number; reusedEvidence: number; isDerived: boolean; available: number }> {
  return toJson(await authFetch("/v1/research/preview-quote", {
    method: "POST",
    body: JSON.stringify({ scope, proposedModules, originRunId: derive.originRunId, relation: derive.relation }),
  }));
}

export async function getResearch(runId: string): Promise<ResearchRun> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}`));
}

export async function listResearch(): Promise<ResearchRunListItem[]> {
  const d = await toJson<{ runs: ResearchRunListItem[] }>(await authFetch("/v1/research"));
  return d.runs;
}

/** 单章重跑(P2):复用全部证据,只重写指定模块,出同谱系新版本。费用=撰写阶段上限。 */
export async function rerunSection(runId: string, module: string): Promise<{ runId: string; status: string; quote: number }> {
  return toJson(await authFetch(`/v1/research/${runId}/rerun-section`, {
    method: "POST", body: JSON.stringify({ module }),
  }));
}

export async function resumeResearch(runId: string): Promise<{ runId: string; status: string }> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}/resume`, { method: "POST" }));
}

/** 删一份研究报告(仅本人;已结算积分不退)。 */
export async function deleteResearch(runId: string): Promise<{ ok: boolean }> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}`, { method: "DELETE" }));
}

/** 删一条已保存的扫描结果(仅本人)。 */
export async function deleteSavedScan(scanKey: string): Promise<{ ok: boolean }> {
  return toJson(await authFetch(`/v1/research/saved-scans/${encodeURIComponent(scanKey)}`, { method: "DELETE" }));
}

/**
 * 归入商品档案(补绑/改绑/解绑)。productRef = 商品档案 stableId,传 null 解绑。
 * 默认整条版本链一起绑 —— 同一商品的多个版本本就该挂在同一档案下。
 * 启动时未带 productRef 的历史报告靠它补绑。
 */
export async function bindResearchProduct(
  runId: string, productRef: string | null, productName?: string,
): Promise<{ runId: string; productRef: string | null; productName: string }> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}`, {
    method: "PATCH", body: JSON.stringify({ productRef, ...(productName ? { productName } : {}) }),
  }));
}

/** 固定/取消参考版本(生命周期 P3):同谱系互斥,一条链只钉一个。 */
export async function pinResearch(runId: string, pinned: boolean): Promise<{ runId: string; pinned: boolean }> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}/pin`, {
    method: "POST", body: JSON.stringify({ pinned }),
  }));
}

/** 定期复扫排程(生命周期 P3):开/关某报告版本链的自动复扫。 */
export async function setResearchSchedule(runId: string, enabled: boolean, intervalDays: number):
  Promise<{ schedule: import("./types").ResearchSchedule | null }> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}/schedule`, {
    method: "POST", body: JSON.stringify({ enabled, intervalDays }),
  }));
}

// —— 报告分享(#P1-3)——
export type ShareInfo = { token: string; expiresAt: string | null; viewCount: number };

export async function getShare(runId: string): Promise<ShareInfo | null> {
  const d = await toJson<{ share: ShareInfo | null }>(await authFetch(`/v1/research/${encodeURIComponent(runId)}/share`));
  return d.share;
}
export async function createShare(runId: string): Promise<ShareInfo> {
  return toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}/share`, { method: "POST" }));
}
export async function revokeShare(runId: string): Promise<void> {
  await toJson(await authFetch(`/v1/research/${encodeURIComponent(runId)}/unshare`, { method: "POST" }));
}
/** 分享链接的完整 URL(公开只读页 /shared?t=token)。 */
export function shareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/shared?t=${encodeURIComponent(token)}`;
}
