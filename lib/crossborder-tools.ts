/**
 * 跨境利润域的对外入口。计算引擎已迁至 crossborder/calculators/profit.ts，
 * 这里统一再导出，并保留提取（extraction）相关的类型，供 MiniMax 读取使用。
 */

export * from "./crossborder/calculators/profit";
import type { ProfitField } from "./crossborder/calculators/profit";

/** MiniMax 从自然语言中读取到的单个参数（含原话证据）。 */
export type ExtractedField = {
  key: ProfitField;
  value: number;
  sourceQuote: string;
};
