"use client";

/**
 * 成本积木编辑器组件：一张可编辑的积木卡片。
 * 预设积木只编辑参数；自定义积木可改名称、类型与成本/收入方向。
 * 分摊型积木显式展示分摊依据（治「精确的错误」）。
 */

import { X } from "lucide-react";
import { BLOCK_TYPES, blockPerUnit, type BlockType, type CostBlock } from "../../../lib/crossborder/cost-model";

export function typeDefaults(type: BlockType): Record<string, number> {
  switch (type) {
    case "per_unit": return { amount: 0 };
    case "per_order": return { amount: 0, unitsPerOrder: 1 };
    case "pct_sales": return { pct: 0 };
    case "monthly_alloc": return { monthly: 0, monthlyUnits: 100 };
    case "batch_alloc": return { total: 0, batchUnits: 100 };
    case "probabilistic": return { probPct: 0, lossPerEvent: 0 };
    default: return {};
  }
}

export function BlockCard({ block, price, onChange, onRemove }: {
  block: CostBlock;
  price: number;
  onChange: (next: CostBlock) => void;
  onRemove: () => void;
}) {
  const spec = BLOCK_TYPES[block.type];
  const perUnit = blockPerUnit(block, { price });
  const signed = block.kind === "income" ? perUnit : -perUnit;
  const isCustom = block.id.startsWith("custom_");

  return (
    <div className="block-card">
      <div className="block-card-head">
        {isCustom ? (
          <input className="block-name" value={block.name} aria-label="模块名称"
            onChange={(e) => onChange({ ...block, name: e.target.value })} />
        ) : (
          <strong>{block.name}</strong>
        )}
        <span className={`block-badge ${block.kind}`}>{block.kind === "income" ? "收入" : "成本"} · {spec.label}</span>
        <button className="block-remove" onClick={onRemove} aria-label="移除模块"><X size={13} /></button>
      </div>

      {isCustom && (
        <div className="block-type-row">
          <select value={block.type} aria-label="计费方式"
            onChange={(e) => { const t = e.target.value as BlockType; onChange({ ...block, type: t, params: typeDefaults(t) }); }}>
            {(Object.keys(BLOCK_TYPES) as BlockType[]).map((k) => <option key={k} value={k}>{BLOCK_TYPES[k].label}</option>)}
          </select>
          <select value={block.kind} aria-label="成本或收入"
            onChange={(e) => onChange({ ...block, kind: e.target.value as CostBlock["kind"] })}>
            <option value="cost">成本</option>
            <option value="income">收入</option>
          </select>
        </div>
      )}

      <div className="block-fields">
        {spec.fields.map((f) => (
          <label className="block-field" key={f.key}>
            <span>{f.label}{f.hint && <em> · {f.hint}</em>}</span>
            <div>
              {f.prefix && <i aria-hidden="true">{f.prefix}</i>}
              <input type="number" value={Number.isFinite(block.params[f.key]) ? block.params[f.key] : ""}
                onChange={(e) => onChange({ ...block, params: { ...block.params, [f.key]: Number(e.target.value) } })} />
              {f.suffix && <i>{f.suffix}</i>}
            </div>
          </label>
        ))}
      </div>

      <div className="block-impact">
        <span>每件影响</span>
        <strong className={signed < 0 ? "neg" : "pos"}>{signed < 0 ? "-" : "+"}${Math.abs(signed).toFixed(2)}</strong>
        {spec.needsBasis && <em>{spec.allocationNote}</em>}
      </div>
    </div>
  );
}
