/**
 * 深度舆情报告客户端(#56)。
 *
 * 报告在后端分四段跑(清洗→归因→竞品→撰写),每段独立「冻结-结算」真实 tokens:
 * 启动前先报价拦截;中途余额不足会停在 paused_insufficient,补额后续跑,
 * 已完成的段不重复扣费。前端只负责:要报价 → 启动 → 轮询 → 展示/续跑。
 */
import { authFetch } from "../api";

/**
 * 送进深度报告的评论。
 *
 * date/variant 一直存在于 CSV 解析结果里,却没有随报告发出去 —— 于是模型结构上
 * 不可能知道时间跨度或变体分布,compose 却被要求写「样本或口径上的注意事项」,
 * 结果是它编出「样本集中在近三个月」这类没有任何输入依据的声明,
 * 而这恰恰是用户最信任的那一块。带上它们,让覆盖度由代码如实算。
 */
export type ReportReview = {
  id: string; rating: number | null; text: string;
  date?: string;       // YYYY-MM-DD,缺失为空
  variant?: string;    // 变体/款式,缺失为空
};

export type ReportInput = {
  productContext?: string;
  productRef?: string;
  productName?: string;
  reviews: ReportReview[];
  competitor?: ReportReview[];
};

export type ReportStage = {
  name: "clean" | "themes" | "competitor" | "compose";
  status: "pending" | "done" | "skipped";
  estimate: number;
  charged: number;
};

export type ThemeAgg = {
  theme: string; count: number; share: number;
  avgRating: number | null; negShare: number; quotes: string[];
};

export type DeepReport = {
  summary?: string;
  topIssues?: Array<{
    // share 由后端用真实聚合值覆盖模型报数;对不上的主题为 null(不显示,而不是印 0%)
    // severity 为 null = 这条没有原文证据支撑,不给严重度(缺失不等于中等)
    theme: string; severity: "high" | "mid" | "low" | null; share: number | null;
    evidence: string[]; affected: string[]; action: string;
  }>;
  positives?: Array<{ theme: string; share: number | null; note: string }>;
  competitorNotes?: string[];
  cautions?: string[];
};

export type ReportRun = {
  runId: string;
  status: "running" | "paused_insufficient" | "failed" | "done";
  productRef?: string | null;
  productName?: string | null;
  quote: number;
  totalCharged: number;
  stages: ReportStage[];
  error?: string | null;
  report?: {
    report: DeepReport;
    stats: { total: number; avgRating: number | null; histogram?: Record<string, number> };
    themes: ThemeAgg[];
    competitorThemes: ThemeAgg[];
    generatedAt: string;
  } | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  inputSummary?: { reviews: number; competitor: number };
  // 溯源:后端 with_input 时回吐当时喂进报告的原文,供报告页核对「这份报告是怎么来的」。
  productContext?: string;
  sourceReviews?: ReportReview[];
  sourceCompetitor?: ReportReview[];
};

export type ReportQuote = {
  quote: number;
  stages: Array<{ name: string; estimate: number }>;
  available: number;
  sufficient: boolean;
};

export type RunListItem = {
  runId: string; status: ReportRun["status"]; productName?: string | null;
  quote: number; totalCharged: number; createdAt?: string | null;
};

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

export async function quoteReport(input: ReportInput): Promise<ReportQuote> {
  return toJson(await authFetch("/v1/reports/quote", { method: "POST", body: JSON.stringify(input) }));
}

export async function startReport(input: ReportInput): Promise<ReportRun> {
  return toJson(await authFetch("/v1/reports", { method: "POST", body: JSON.stringify(input) }));
}

export async function getReport(runId: string): Promise<ReportRun> {
  return toJson(await authFetch(`/v1/reports/${encodeURIComponent(runId)}`));
}

export async function listReports(): Promise<RunListItem[]> {
  const d = await toJson<{ runs: RunListItem[] }>(await authFetch("/v1/reports"));
  return d.runs;
}

export async function resumeReport(runId: string): Promise<{ runId: string; status: string }> {
  return toJson(await authFetch(`/v1/reports/${encodeURIComponent(runId)}/resume`, { method: "POST" }));
}

export async function renameReport(runId: string, productName: string): Promise<{ productName: string }> {
  return toJson(await authFetch(`/v1/reports/${encodeURIComponent(runId)}`, {
    method: "PATCH", body: JSON.stringify({ productName }),
  }));
}

/**
 * 归入商品档案(补绑/改绑/解绑)。productRef = 商品档案 stableId,传 null 解绑。
 * 与深度研究报告同口径 —— 已生成的报告靠它补挂到档案上。
 */
export async function bindReportProduct(
  runId: string, productRef: string | null, productName?: string,
): Promise<{ runId: string; productRef: string | null; productName: string }> {
  return toJson(await authFetch(`/v1/reports/${encodeURIComponent(runId)}`, {
    method: "PATCH", body: JSON.stringify({ productRef, ...(productName ? { productName } : {}) }),
  }));
}

export async function deleteReport(runId: string): Promise<{ ok: boolean }> {
  return toJson(await authFetch(`/v1/reports/${encodeURIComponent(runId)}`, { method: "DELETE" }));
}

export const STAGE_LABEL: Record<ReportStage["name"], string> = {
  clean: "样本清洗",
  themes: "主题归因",
  competitor: "竞品对照",
  compose: "报告撰写",
};
