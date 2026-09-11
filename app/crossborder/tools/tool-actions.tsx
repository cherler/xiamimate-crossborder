"use client";

/**
 * 工具结果的通用操作：复制结果、复制分享链接、本地记录保存。
 * 分享链接把输入编码进 URL（?s=），打开即复现（确定性计算器）。
 * 记录保存用 localStorage，仅存输入快照，不上传。
 */

import { useEffect, useReducer, useState } from "react";
import { Bookmark, Check, Copy, Link2, X } from "lucide-react";
import { useAuth } from "../../../lib/auth";
import { track } from "../../../lib/usage";
import { markToolUsed } from "../../../lib/crossborder/recent-tools";
import {
  addRecord, currentProduct, defaultProductName, ensureCurrent, isCloudEnabled, recordsOf,
  removeToolRecords, renameProduct, schedulePush, subscribeProducts,
} from "../../../lib/crossborder/products";
import { SaveResultModal } from "./save-result-modal";

const MODULE = "crossborder";

export type ToolValues = Record<string, string | number>;

function encodeValues(values: ToolValues): string {
  return encodeURIComponent(JSON.stringify(values));
}
export function decodeValues(raw: string): ToolValues | null {
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    return obj && typeof obj === "object" ? obj as ToolValues : null;
  } catch {
    return null;
  }
}
export function buildShareUrl(slug: string, values: ToolValues): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/crossborder/tools/${slug}?s=${encodeValues(values)}`;
}

/** 挂载时读取 URL 里的 ?s= 并回填（客户端）。 */
export function useSharedInitial(apply: (values: ToolValues) => void) {
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("s");
    if (!raw) return;
    const values = decodeValues(raw);
    if (values) apply(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export type HistItem = { ts: number; values: ToolValues; label: string; id?: string };

/**
 * 工具「保存」= 在当前商品名下记一笔(版本)。游客与登录同一套语义,
 * 差别只在:登录后商品档案(含记录)防抖镜像到云端。
 * 挂载时顺带上报一次工具打开(用量统计)。
 */
export function useToolHistory(toolId: string) {
  const { user } = useAuth();
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);                       // localStorage 只在客户端可读,避免 SSR 水合不一致
    return subscribeProducts(force);
  }, []);

  // 打开工具上报一次(每个工具一次);同时记进「最近使用」(本机)。
  useEffect(() => { track(MODULE, toolId, "tool_open"); markToolUsed(toolId); }, [toolId]);

  const cur = hydrated ? currentProduct() : null;
  const items: HistItem[] = (cur ? recordsOf(cur.id, toolId) : []).map((r) => ({
    ts: r.ts, values: r.values as ToolValues, label: r.label, id: r.id,
  }));

  function save(values: ToolValues, label: string) {
    const p = ensureCurrent();
    // 无名商品自动起名「来源 · 时间」(如「利润测算 · 07-20 16:46」)—— 比一排
    // 「未命名商品」好认得多,且不打断保存;名字随时能在「我的商品」里改(#74)。
    if (!p.name.trim()) renameProduct(p.id, defaultProductName(toolId));
    addRecord(p.id, { tool: toolId, label, values });
    if (isCloudEnabled()) schedulePush();
    // 虾米君对保存做出反应(没挂宠物时事件落空,无副作用)
    window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "happy" } }));
  }

  function clear() {
    const p = currentProduct();
    if (!p) return;
    removeToolRecords(p.id, toolId);
    if (isCloudEnabled()) schedulePush();
  }

  return { items, save, clear, isCloud: !!user, productName: cur?.name?.trim() || "未命名商品" };
}

export function ResultActions({ resultText, slug, shareValues, onSave, toolId }: {
  resultText: () => string;
  slug?: string;
  shareValues?: ToolValues;
  onSave?: () => void;
  toolId?: string;              // 传了才弹「存到哪」选择框(否则直接存当前商品,向后兼容)
}) {
  const { user } = useAuth();
  const [copied, setCopied] = useState<"" | "result" | "link" | "saved">("");
  const [toast, setToast] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  async function copy(kind: "result" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* clipboard blocked */ }
  }
  // 弹窗把目标设为当前商品后回调 —— onSave 仍写「当前商品」,零改动复用。
  function doSave() {
    onSave?.();
    const name = currentProduct()?.name?.trim();
    setCopied("saved");
    setToast(`已保存${name ? `到「${name}」` : ""}${user ? " · 云端同步" : "(本机)"} · 在「我的商品」可回看`);
    setTimeout(() => setCopied(""), 1500);
    setTimeout(() => setToast(""), 2600);
  }
  function handleSave() {
    if (toolId) { setSaveOpen(true); return; }   // 弹窗选目标
    doSave();                                     // 无 toolId:旧行为,直接存当前
  }
  return (
    <div className="result-actions-bar">
      {onSave && (
        <button className="ra-save" onClick={handleSave}>
          {copied === "saved" ? <Check size={14} /> : <Bookmark size={14} />} 保存本次快照
        </button>
      )}
      {saveOpen && toolId && (
        <SaveResultModal toolId={toolId} onConfirm={doSave} onClose={() => setSaveOpen(false)} />
      )}
      <button onClick={() => copy("result", resultText())}>
        {copied === "result" ? <Check size={13} /> : <Copy size={13} />} 复制结果
      </button>
      {slug && shareValues && (
        <button onClick={() => copy("link", buildShareUrl(slug, shareValues))}>
          {copied === "link" ? <Check size={13} /> : <Link2 size={13} />} 复制链接
        </button>
      )}
      {toast && <div className="save-toast" role="status"><Check size={14} /> {toast}</div>}
    </div>
  );
}

export function HistoryStrip({ items, onRestore, onClear, render, isCloud, productName }: {
  items: HistItem[];
  onRestore: (values: ToolValues) => void;
  onClear: () => void;
  render: (values: ToolValues) => string;
  isCloud?: boolean;
  productName?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="history-strip">
      <span>「{productName || "未命名商品"}」的 {items.length} 次测算{isCloud ? " · 云端" : " · 本机(登录后云端同步)"}</span>
      {items.map((it, i) => (
        <button key={it.id ?? it.ts} className={i === 0 ? "hist-newest" : undefined}
          onClick={() => onRestore(it.values)} title="点击恢复">{render(it.values)}</button>
      ))}
      <button className="hist-clear" onClick={onClear} aria-label="清除记录"><X size={12} /> 清除</button>
    </div>
  );
}
