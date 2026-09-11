"use client";

/**
 * 「复用利润计算器的商品模型」提示条。
 * 只读、只提示：挂载时读模型，但不动表单——用户点「填入」才写入字段，
 * 填入后字段标记来源、手动改动即清除标记。与智能读取同一套原则：不静默覆盖。
 */

import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { readProductModel, type ProductModel } from "../../../lib/crossborder/product-model";
import { type CostBlock } from "../../../lib/crossborder/cost-model";
import {
  describeAge, describeExcludedBlocks, prefillFromModel, shouldOfferModel, summarizeModel,
  supportsBlocks, type ModelSummary, type PrefillTool,
} from "../../../lib/crossborder/model-prefill";
import { money } from "./tool-kit";

export type ModelPrefill = {
  tool: PrefillTool;
  summary: ModelSummary | null;
  values: Record<string, number> | null;
  blocks: CostBlock[];
  dismiss: () => void;
};

/**
 * 分享链接优先：带 ?s= 时不提示，避免和分享值抢同一批字段。
 * 因为本 hook 只改自己的显示状态、不碰表单，所以与 useSharedInitial 的挂载顺序无关。
 */
export function useProductModelPrefill(tool: PrefillTool): ModelPrefill {
  const [model, setModel] = useState<ProductModel | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("s")) return;
    const m = readProductModel();
    if (shouldOfferModel(m)) setModel(m);
  }, []);

  return {
    tool,
    summary: model ? summarizeModel(model) : null,
    values: model ? prefillFromModel(model, tool) : null,
    blocks: model ? model.blocks : [],
    dismiss: () => setModel(null),
  };
}

export function ModelPrefillBanner({ prefill, onFill }: {
  prefill: ModelPrefill;
  onFill: (values: Record<string, number>, blocks: CostBlock[]) => void;
}) {
  const { tool, summary, values, blocks, dismiss } = prefill;
  if (!summary || !values) return null;

  const takesBlocks = supportsBlocks(tool);
  // 能原样承接就照实说「一并带过来」，承接不了才是需要警示的遗漏。
  const excluded = takesBlocks ? "" : describeExcludedBlocks(summary.blockNames);
  const carried = takesBlocks && summary.blockNames.length > 0
    ? `含 ${summary.blockNames.length} 个成本模块（${summary.blockNames.join("、")}），一并带入`
    : "";
  const age = describeAge(summary.updatedAt);

  return (
    <div className="model-prefill">
      <span>
        <Layers3 size={13} />
        检测到商品模型（利润计算器）· 售价 ${money(summary.price)} · 总成本 ${money(summary.totalCost)} · 净利率 {summary.target}%
        {age && <i>{age}</i>}
      </span>
      {excluded && <em>{excluded}</em>}
      {carried && <em className="carried">{carried}</em>}
      <div>
        <button className="fill" onClick={() => { onFill(values, blocks); dismiss(); }}>填入</button>
        <button onClick={dismiss}>忽略</button>
      </div>
    </div>
  );
}
