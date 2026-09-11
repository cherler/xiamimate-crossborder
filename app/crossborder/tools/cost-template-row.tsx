"use client";

/**
 * 成本底座模板行(#60)。
 *
 * 换品时最烦的是重填一遍店铺费率 —— 佣金、尾程、头程这些跟着店铺/站点走,
 * 不跟着商品走。这一行把当前 6 项费率存成命名模板,下次换品一键铺底。
 */

import { useEffect, useReducer, useState } from "react";
import { Check, LibraryBig, Save, Trash2 } from "lucide-react";
import type { ProfitValues } from "../../../lib/crossborder/calculators/profit";
import {
  listTemplates, ratesOf, removeTemplate, saveTemplate, subscribeTemplates,
  type TemplateRates,
} from "../../../lib/crossborder/cost-templates";

export function CostTemplateRow({ values, onApply }: {
  values: ProfitValues;
  onApply: (rates: TemplateRates) => void;
}) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [hydrated, setHydrated] = useState(false);
  const [sel, setSel] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [applied, setApplied] = useState("");

  useEffect(() => {
    setHydrated(true);
    return subscribeTemplates(force);
  }, []);

  const templates = hydrated ? listTemplates() : [];
  const current = templates.find((t) => t.id === sel) ?? null;

  function apply() {
    if (!current) return;
    onApply(current.rates);
    setApplied(current.name);
    setTimeout(() => setApplied(""), 2600);
  }

  function save() {
    const tpl = saveTemplate(name, ratesOf(values));
    setNaming(false);
    setName("");
    setSel(tpl.id);
    setApplied(tpl.name);
    setTimeout(() => setApplied(""), 2600);
  }

  return (
    <div className="ct-row">
      <span className="ct-label"><LibraryBig size={13} /> 成本底座</span>
      {templates.length > 0 && (
        <>
          <select className="ct-select" value={sel} aria-label="选择成本模板"
            onChange={(e) => setSel(e.target.value)}>
            <option value="">选模板…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="ct-btn" onClick={apply} disabled={!current}>铺底</button>
          {current && (
            <button className="ct-icon" onClick={() => { removeTemplate(current.id); setSel(""); }}
              aria-label={`删除模板 ${current.name}`} title="删除该模板"><Trash2 size={13} /></button>
          )}
        </>
      )}
      {naming ? (
        <span className="ct-naming">
          <input className="ct-name-input" value={name} autoFocus placeholder="如:亚马逊美国 · 标准件"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setNaming(false); }} />
          <button className="ct-btn" onClick={save}><Save size={12} /> 存</button>
        </span>
      ) : (
        <button className="ct-link" onClick={() => setNaming(true)}>
          把当前费率存为模板
        </button>
      )}
      {applied && <em className="ct-applied"><Check size={12} /> 「{applied}」 · 6 项费率已就位</em>}
      {!applied && templates.length === 0 && !naming && (
        <em className="ct-hint">佣金 / 尾程 / 头程这些跟店铺走,存一次,换品不重填</em>
      )}
    </div>
  );
}
