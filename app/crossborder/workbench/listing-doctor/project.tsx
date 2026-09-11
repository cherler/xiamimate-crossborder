"use client";

/**
 * 商品项目与事实确认 —— Listing 诊断工作台的第一段。
 *
 * 这一段就是整个工作台与普通 AI 对话框的分界线：
 * 对话框会顺嘴替你补出「防水」「医用级」「终身质保」，这里不会 ——
 * AI 抽取的每一条都必须带资料原文，且一律是「待确认」，你点头才算数；
 * 资料里没有的槽位显式标为「未知」，后续文案一个字都不许写。
 *
 * 沿用智能读取那套原则：AI 只负责读，确认权在用户，不静默覆盖。
 */

import { UrlFetchRow } from "../../tools/url-fetch";
import { useMemo, useState } from "react";
import { aiFetch, aiJson } from "../../../../lib/api";
import {
  AlertTriangle, Check, FileText, HelpCircle, Image as ImageIcon, Layers3,
  RefreshCw, RotateCcw, Sparkles, Trash2, X,
} from "lucide-react";
import {
  FACT_SLOTS, blockedFacts, factCoverage, mergeExtracted, seededProject,
  slotByKey, touch, unknownFact, writableFacts,
  type ProductFact, type ProductProject,
} from "../../../../lib/crossborder/product-facts";
import { mergeMaterial, FACTS_TEXT_LIMIT } from "../../../../lib/crossborder/web-content";
import { prepareImageForVision } from "../../../../lib/crossborder/image-intake";

import { LISTING_SAMPLES } from "../../../../lib/crossborder/workbench-samples";

type ApiFact = { key: string; label: string; value: string; sourceQuote: string; confidence: "high" | "medium" | "low" };
type ApiResponse = { productName?: string; marketplace?: string; facts?: ApiFact[]; error?: string };

const CONFIDENCE_LABEL: Record<ProductFact["confidence"], string> = { high: "证据明确", medium: "需归纳", low: "含糊" };
const SOURCE_LABEL: Record<ProductFact["source"], string> = {
  user: "你填写的", document: "资料", listing: "现有 Listing", image: "图片", inferred: "AI 读取",
};

/** 来源 · 出处 · 置信度。出处与来源同义时不重复说一遍。 */
function provenance(fact: ProductFact): string {
  const src = SOURCE_LABEL[fact.source];
  const parts = [src];
  if (fact.sourceNote && fact.sourceNote !== src) parts.push(fact.sourceNote);
  if (fact.value) parts.push(CONFIDENCE_LABEL[fact.confidence]);
  return parts.join(" · ");
}

function FactRow({ fact, onChange, onRemove }: {
  fact: ProductFact;
  onChange: (f: ProductFact) => void;
  onRemove: () => void;
}) {
  const slot = slotByKey(fact.key);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.value);

  const confirm = () => onChange({ ...fact, status: "confirmed", updatedAt: Date.now() });
  const reject = () => onChange({ ...unknownFact({ key: fact.key, label: fact.label }), updatedAt: Date.now() });
  const save = () => {
    const v = draft.trim();
    onChange(v
      ? { ...fact, value: v, status: "confirmed", source: "user", sourceNote: "你填写的", confidence: "high", updatedAt: Date.now() }
      : { ...unknownFact({ key: fact.key, label: fact.label }), updatedAt: Date.now() });
    setEditing(false);
  };

  // 未知槽位压成台账单行:标签 + 「不得提及」+ 改。重复的说明文字只在这一行里讲一次。
  if (fact.status === "unknown" && !editing) {
    return (
      <div className="fact-row is-unknown fact-compact">
        <span className="fact-label">
          {fact.label}
          {slot?.risky && <em className="fact-risky" title="写错构成虚假宣传或合规风险">高风险</em>}
        </span>
        <i className="fact-gap">未知 · 文案不得提及</i>
        <div className="fact-actions">
          <button onClick={() => { setDraft(fact.value); setEditing(true); }}>填写</button>
          {!slot && <button onClick={onRemove} aria-label={`删除 ${fact.label}`}><Trash2 size={11} /></button>}
        </div>
      </div>
    );
  }

  return (
    <div className={`fact-row is-${fact.status}`}>
      <div className="fact-head">
        <span className="fact-label">
          {fact.label}
          {slot?.risky && <em className="fact-risky" title="写错构成虚假宣传或合规风险">高风险</em>}
        </span>
        <span className={`fact-status ${fact.status}`}>
          {fact.status === "confirmed" && <><Check size={11} /> 已确认</>}
          {fact.status === "unconfirmed" && <><HelpCircle size={11} /> 待确认</>}
          {fact.status === "unknown" && <><X size={11} /> 未知</>}
          {fact.status === "conflicting" && <><AlertTriangle size={11} /> 冲突</>}
        </span>
      </div>

      {editing ? (
        <div className="fact-edit">
          <input value={draft} autoFocus placeholder={slot?.hint ?? "留空表示资料里没有"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
          <button className="fill" onClick={save}>保存</button>
          <button onClick={() => setEditing(false)}>取消</button>
        </div>
      ) : (
        <>
          <div className="fact-value">
            {fact.value
              ? <b>{fact.value}</b>
              : <i>资料里没有 —— 后续文案不得提及{slot?.hint ? `（${slot.hint}）` : ""}</i>}
          </div>
          {fact.sourceQuote && (
            <div className="fact-quote">
              <FileText size={11} />
              <q>{fact.sourceQuote}</q>
            </div>
          )}
          <div className="fact-foot">
            <small>{provenance(fact)}</small>
            <div className="fact-actions">
              {fact.status === "unconfirmed" && <button className="fill" onClick={confirm}><Check size={12} /> 确认</button>}
              <button onClick={() => { setDraft(fact.value); setEditing(true); }}>改</button>
              {fact.status !== "unknown" && <button onClick={reject} title="标为资料里没有">标为未知</button>}
              {!slot && <button onClick={onRemove} aria-label={`删除 ${fact.label}`}><Trash2 size={11} /></button>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectPanel({ project, onChange }: {
  project: ProductProject;
  onChange: (p: ProductProject) => void;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ preview: string; data: string; mediaType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const coverage = useMemo(() => factCoverage(project), [project]);
  const writable = useMemo(() => writableFacts(project), [project]);
  const blocked = useMemo(() => blockedFacts(project), [project]);
  const pending = useMemo(() => project.facts.filter((f) => f.status === "unconfirmed"), [project]);
  const riskyBlocked = blocked.filter((f) => slotByKey(f.key)?.risky);

  /** 追加一段网页正文。服务端对超长直接 400,裁剪与说明交给 mergeMaterial。 */
  function appendMaterial(chunk: string) {
    const merged = mergeMaterial(text, chunk, FACTS_TEXT_LIMIT);
    setText(merged.text);
    setError(merged.note);
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      // 原来是静默 return —— 文件对话框一关,界面毫无变化,用户以为传上去了,
      // 点「AI 读取事实」才发现只读了文本框。同样的坑在智能读取抽屉里修过一次。
      setError(`不支持这个文件类型（${file.name.split(".").pop()?.toUpperCase() || "未知"}）。请上传截图（PNG/JPG）。`);
      return;
    }
    // HEIC / 超大截图先在浏览器里转成 JPEG;转不动才报错,且说清是格式还是体积。
    prepareImageForVision(file)
      .then(setImage)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "这张截图读不了，请换一张。"));
  }

  async function extract() {
    setLoading(true);
    setError("");
    try {
      const res = await aiFetch("/api/crossborder/facts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, image: image ? { data: image.data, mediaType: image.mediaType } : undefined }),
      });
      const data = await aiJson<ApiResponse>(res);

      const incoming: ProductFact[] = (data.facts ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        value: f.value,
        status: "unconfirmed",
        source: image ? "image" : "document",
        sourceNote: f.sourceQuote ? "见下方原文" : "资料",
        confidence: f.confidence,
        updatedAt: Date.now(),
      }));
      const withQuotes = incoming.map((f, i) => ({ ...f, sourceQuote: (data.facts ?? [])[i]?.sourceQuote }));
      const merged = mergeExtracted(project, withQuotes);
      onChange({
        ...merged,
        name: project.name || data.productName || "",
        marketplace: data.marketplace || project.marketplace,
      });
      setText("");
      setImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  function updateFact(next: ProductFact) {
    onChange(touch({ ...project, facts: project.facts.map((f) => (f.key === next.key ? next : f)) }));
  }
  function removeFact(key: string) {
    onChange(touch({ ...project, facts: project.facts.filter((f) => f.key !== key) }));
  }
  const reset = () => onChange(seededProject("p1", ""));
  const confirmAll = () => onChange(touch({
    ...project,
    facts: project.facts.map((f) => (f.status === "unconfirmed" ? { ...f, status: "confirmed" as const } : f)),
  }));

  return (
    <div className="wb-grid">
      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><Sparkles size={15} /> 导入资料</span><em>链接 / 截图 / 粘贴文本</em></div>
          <UrlFetchRow onText={(t, m) => appendMaterial((m.title ? `【${m.title}】\n` : "") + t)} />
          <textarea className="mt-textarea" style={{ minHeight: 130 }} value={text}
            placeholder="粘贴规格书、现有 Listing、供应商资料…"
            onPaste={(e) => {
              for (const it of Array.from(e.clipboardData?.items ?? [])) {
                if (it.type.startsWith("image/")) { handleFile(it.getAsFile()); e.preventDefault(); break; }
              }
            }}
            onChange={(e) => setText(e.target.value)} />
          <div className="fact-import-actions">
            <label className="fact-upload">
              <ImageIcon size={13} /> 上传截图
              <input type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>
            {image && (
              <span className="fact-thumb">
                <img src={image.preview} alt="待读取的截图" />
                <button onClick={() => setImage(null)} aria-label="移除截图"><X size={11} /></button>
              </span>
            )}
            <button className="gen-btn" onClick={extract} disabled={loading || (!text.trim() && !image)}>
              {loading ? <><RefreshCw size={14} className="spin" /> 读取中…</> : <><Sparkles size={14} /> AI 读取事实</>}
            </button>
          </div>
          <div className="wb-sample-row">
            <span>没有资料?用示例一键跑一遍:</span>
            {LISTING_SAMPLES.map((s) => (
              <button key={s.id} className="fact-upload" onClick={() => onChange(s.build())}>{s.label}</button>
            ))}
          </div>
          {error && <div className="tool-error"><AlertTriangle size={15} /><span>{error}</span></div>}
          <p className="fact-note">
            AI 只负责读，<b>每条事实都必须带资料原文</b>，拿不出原文的不会出现在下面。
            读取结果一律是「待确认」，<b>你点头才算数</b>。资料不上传第三方以外的地方，也不用于训练。
          </p>
        </div>

        <div className="wb-block">
          <div className="section-heading"><span><Layers3 size={15} /> 事实库完成度</span>
            <em>{coverage.confirmed}/{coverage.total} 已确认</em>
          </div>
          <div className="fact-meter" role="img" aria-label={`已确认 ${coverage.confirmed}，待确认 ${coverage.pending}，未知 ${coverage.unknown}`}>
            <i className="ok" style={{ flex: coverage.confirmed || 0 }} />
            <i className="pending" style={{ flex: coverage.pending || 0 }} />
            <i className="unknown" style={{ flex: coverage.unknown || 0 }} />
          </div>
          <div className="fact-legend">
            <span><i className="ok" /> 已确认 {coverage.confirmed} · 可写进文案</span>
            <span><i className="pending" /> 待确认 {coverage.pending}</span>
            <span><i className="unknown" /> 未知 {coverage.unknown} · 禁止提及</span>
          </div>
          {riskyBlocked.length > 0 && (
            <div className="conflict-item warn">
              <AlertTriangle size={14} />
              <span>
                高风险槽位尚未确认：<b>{riskyBlocked.map((f) => f.label).join("、")}</b>。
                这些写错等于虚假宣传，未确认前后续文案<b>一个字都不会提</b>。
              </span>
            </div>
          )}
          <div className="fact-foot-actions">
            {pending.length > 0 && <button className="fill" onClick={confirmAll}><Check size={12} /> 确认全部 {pending.length} 条待确认</button>}
            <button onClick={reset}><RotateCcw size={12} /> 清空项目</button>
          </div>
        </div>
      </section>

      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading">
            <span>商品事实库</span>
            <em>{project.name || "未命名商品"} · {project.marketplace}</em>
          </div>
          <div className="fact-list">
            {project.facts.map((f) => (
              <FactRow key={f.key} fact={f} onChange={updateFact} onRemove={() => removeFact(f.key)} />
            ))}
          </div>
          <p className="fact-note">
            共 {FACT_SLOTS.length} 个标准槽位。资料里没有的显式标为「未知」，
            而不是留空 —— <b>空白是 AI 最爱填的地方</b>。当前 {writable.length} 条可写进文案。
          </p>
        </div>
      </section>
    </div>
  );
}
