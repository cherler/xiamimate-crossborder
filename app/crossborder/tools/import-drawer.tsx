"use client";

/**
 * 智能读取抽屉（工具无关）。
 * 贴资料 → 识别 → 展示「识别到 / 需要确认 / 尚未提供」→ 用户确认后回调 onConfirm。
 * 只负责读取与展示，不做计算；由各工具页把确认后的字段填入自己的表单。
 */

import { UrlFetchRow } from "./url-fetch";
import { useEffect, useState } from "react";
import { aiFetch, aiJson } from "../../../lib/api";
import { ensureCurrent, isCloudEnabled, renameProduct, schedulePush } from "../../../lib/crossborder/products";
import { HelpCircle, ImagePlus, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { fitMaterialText, mergeMaterial, MATERIAL_TEXT_LIMIT } from "../../../lib/crossborder/web-content";
import { prepareImageForVision } from "../../../lib/crossborder/image-intake";

export type ImportedField = { key: string; label: string; value: number; sourceQuote: string };
type ImportResponse = {
  productName: string;
  marketplace: string;
  extracted: ImportedField[];
  missing: Array<{ key: string; label: string }>;
  questions: string[];
};

type DynamicField = { key: string; label: string; kind: string; description: string };

export function ImportDrawer({ toolId, open, sampleText, dynamicFields, onClose, onConfirm }: {
  toolId: string;
  open: boolean;
  sampleText?: string;
  dynamicFields?: DynamicField[];
  onClose: () => void;
  onConfirm: (fields: ImportedField[]) => void;
}) {
  const [text, setText] = useState(sampleText || "");
  const [image, setImage] = useState<{ preview: string; data: string; mediaType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResponse | null>(null);
  // 确认制的另一半(#73):识别值可改、确认项可答
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [answered, setAnswered] = useState<Record<number, string>>({});

  // Esc 关闭:与商品切换器同一约定(Esc / 背板 / 取消三条路都通)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** 文本框还是未动过的预填示例 → 当空处理,免得示例文字混进识别 */
  const baseText = () => (text === (sampleText || "") ? "" : text);

  /** 往资料框追加一段(网页正文 / 表格文件),裁剪与说明都交给 mergeMaterial */
  function appendMaterial(chunk: string, label: string) {
    const merged = mergeMaterial(baseText(), chunk);
    setText(merged.text);
    setError(merged.note ? `${label}${merged.note}` : "");
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    setError("");
    // 表格/文本文件(csv/tsv/txt):读成文字进文本框,走文字识别链路
    if (/\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onerror = () => setError("读不到这个文件，请重新选择一次。");
      reader.onload = () => {
        const t = String(reader.result || "").trim();
        if (!t) { setError("这个文件是空的，没有可识别的内容。"); return; }
        appendMaterial(t, "表格内容:");
      };
      reader.readAsText(file);
      return;
    }
    if (!file.type.startsWith("image/")) {
      // 静默 return 会让用户以为传上去了(文件对话框一关，界面毫无变化)。
      setError(`不支持这个文件类型（${file.name.split(".").pop()?.toUpperCase() || "未知"}）。请上传截图（PNG/JPG）或 CSV / TXT 表格；Excel 请先另存为 CSV。`);
      return;
    }
    // 格式与体积统一交给 image-intake:HEIC / 超大截图先在浏览器里转成 JPEG,
    // 转不动才报错,且报错要说清是格式还是体积。
    prepareImageForVision(file)
      .then((img) => { setImage(img); setText(baseText()); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "这张截图读不了，请换一张。"));
  }

  async function run() {
    setLoading(true);
    setError("");
    try {
      // 兜底再裁一次:粘贴/手打也会越界,而服务端对超长是直接 400。
      const fitted = fitMaterialText(text);
      if (fitted.text !== text) setText(fitted.text);
      const res = await aiFetch("/api/crossborder/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolId, text: fitted.text,
          image: image ? { data: image.data, mediaType: image.mediaType } : undefined,
          dynamicFields: dynamicFields && dynamicFields.length ? dynamicFields : undefined,
        }),
      });
      // 先判 res.ok 再解析:413(超大图)、WAF 拦截页、502 网关页都不是 JSON,
      // 原来的 res.json() 会先抛 SyntaxError,用户看到的是「Unexpected token '<'」。
      const data = await aiJson<ImportResponse>(res);
      setResult(data);
      setEdited({});
      setAnswered({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button className="drawer-backdrop" aria-label="关闭智能读取" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="智能读取资料">
        <div className="drawer-head">
          <div><span>AI 智能读取</span><strong>读取商品 / 报价资料</strong></div>
          <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>

        <div className="drawer-body">
          {!result ? (
            <>
              <UrlFetchRow onText={(t, m) => appendMaterial((m.title ? `【${m.title}】\n` : "") + t, "网页正文:")} />
              <textarea className="drawer-textarea" value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  for (const it of e.clipboardData.items) {
                    if (it.type.startsWith("image/")) { handleFile(it.getAsFile()); e.preventDefault(); break; }
                  }
                }}
                aria-label="粘贴商品资料或截图" placeholder="粘贴报价/商品信息、表格文字，或直接粘贴截图…" />
              {/* 字数是硬上限(服务端超长直接 400),不显示的话用户看不出自己已经越界 */}
              <div className="drawer-input-meta">
                <span>{text.length.toLocaleString()} / {MATERIAL_TEXT_LIMIT.toLocaleString()} 字</span>
              </div>
              <div className="import-upload-row">
                <label className="import-upload">
                  <input type="file" accept="image/*,.csv,.tsv,.txt,text/csv,text/plain" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
                  <ImagePlus size={14} /> 上传截图 / 表格
                </label>
              </div>
              {image && (
                <div className="import-image">
                  <img src={image.preview} alt="截图预览" />
                  <button onClick={() => setImage(null)} aria-label="移除截图"><X size={14} /></button>
                </div>
              )}
              {error && <div className="import-error"><ShieldCheck size={15} /><span>{error}</span></div>}
              <p className="drawer-hint">只读取你明确写出（或截图中出现）的数字，不猜测、不补默认值。识别后会先请你核对，再决定是否填入表单。</p>
            </>
          ) : (
            <>
              <div className="import-group">
                <div className="import-group-head">识别到 {result.extracted.length} 项参数
                  {result.productName && <em> · {result.productName}{result.marketplace ? ` · ${result.marketplace}` : ""}</em>}
                </div>
                {result.extracted.length ? result.extracted.map((f) => {
                  const val = edited[f.key] ?? f.value;
                  const changed = edited[f.key] !== undefined && edited[f.key] !== f.value;
                  return (
                    <div className={`import-field${changed ? " is-edited" : ""}`} key={f.key}>
                      <span className="import-field-name">{f.label}</span>
                      <input className="import-field-input" type="number" step="any" value={val}
                        aria-label={`${f.label}(可修改)`}
                        onChange={(e) => setEdited((m) => ({ ...m, [f.key]: Number(e.target.value) }))} />
                      {changed && <em className="import-edited-tag">已改</em>}
                      <q>{f.sourceQuote}</q>
                    </div>
                  );
                }) : <p className="import-empty">没有识别到可用参数，换一段更完整的资料再试。</p>}
                {result.extracted.length > 0 && (
                  <p className="import-edit-hint">识别错了不用重读 —— 直接改上面的数字,以你改后的为准。</p>
                )}
              </div>

              {result.questions.length > 0 && (
                <div className="import-group">
                  <div className="import-group-head warn">需要你确认</div>
                  {result.questions.map((q, i) => {
                    const isCurrency = q.includes("币种");
                    const picked = answered[i];
                    return (
                      <div className={`import-question${picked ? " is-answered" : ""}`} key={i}>
                        <HelpCircle size={14} /><span>{q}</span>
                        <span className="import-q-actions">
                          {isCurrency ? (
                            <>
                              <button className={picked === "usd" ? "on" : ""}
                                onClick={() => setAnswered((m) => ({ ...m, [i]: "usd" }))}>都按美元</button>
                              <button className={picked === "edit" ? "on" : ""}
                                onClick={() => {
                                  setAnswered((m) => ({ ...m, [i]: "edit" }));
                                  (document.querySelector(".import-field-input") as HTMLInputElement | null)?.focus();
                                }}>有其他币种,我来改数</button>
                            </>
                          ) : (
                            <button className={picked ? "on" : ""}
                              onClick={() => setAnswered((m) => ({ ...m, [i]: "ok" }))}>知道了</button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {result.missing.length > 0 && (
                <div className="import-group">
                  <div className="import-group-head">尚未提供 · 将保留当前值</div>
                  <div className="import-missing">{result.missing.map((m) => <span key={m.key}>{m.label}</span>)}</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="drawer-foot">
          {!result ? (
            <>
              <button className="drawer-cancel" onClick={onClose}>取消</button>
              <button className="drawer-confirm" onClick={run} disabled={loading || (!text.trim() && !image)}>
                {loading ? <><RefreshCw size={15} className="spin" /> 识别中…</> : <><Sparkles size={15} /> 识别参数</>}
              </button>
            </>
          ) : (
            <>
              <button className="drawer-cancel" onClick={() => setResult(null)}>重新读取</button>
              {(() => {
                const unanswered = result.questions.length - Object.keys(answered).length;
                const finalFields = result.extracted.map((f) => ({ ...f, value: edited[f.key] ?? f.value }));
                return (
                  <button className="drawer-confirm"
                    onClick={() => {
                      // 识别出的商品名是最好的默认名:未命名的商品实体直接认领(#74)
                      const pn = result.productName?.trim();
                      if (pn) {
                        const cur = ensureCurrent();
                        if (!cur.name.trim()) {
                          renameProduct(cur.id, pn, true);
                          if (isCloudEnabled()) schedulePush();
                        }
                      }
                      onConfirm(finalFields);
                    }}
                    disabled={!result.extracted.length || unanswered > 0}
                    title={unanswered > 0 ? "先回应上面的确认项" : undefined}>
                    {unanswered > 0 ? `还有 ${unanswered} 个确认项` : `确认并填入 ${result.extracted.length} 项`}
                  </button>
                );
              })()}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
