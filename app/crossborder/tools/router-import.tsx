"use client";

/**
 * 工具中心底部「有一段报价资料」智能路由入口。
 *
 * 粘贴文字/截图 → 调 /api/crossborder/route 找出适用的「全部」工具并各自读出参数 →
 * 列出所有匹配工具（最匹配的高亮），每个显示会填入哪些参数供核对 →
 * 用户确认后把所有工具的参数一次性暂存，打开任一个都已预填、去其它工具也不用再读。
 * 都不匹配时不硬塞：给五个工具让用户手选（手选不带预填）。
 */

import { UrlFetchRow } from "./url-fetch";
import { useEffect, useState } from "react";
import { aiFetch, aiJson } from "../../../lib/api";
import { ArrowRight, HelpCircle, ImagePlus, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";
import { CROSSBORDER_TOOLS } from "../../../lib/crossborder/registry";
import { writePendingImports } from "../../../lib/crossborder/pending-import";
import { fitMaterialText, mergeMaterial, MATERIAL_TEXT_LIMIT } from "../../../lib/crossborder/web-content";
import { prepareImageForVision } from "../../../lib/crossborder/image-intake";

type Extracted = { key: string; label: string; value: number; sourceQuote: string };
type RoutedTool = {
  toolId: string;
  toolName: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  productName?: string;
  marketplace?: string;
  extracted: Extracted[];
  missing: Array<{ key: string; label: string }>;
  questions: string[];
};
type RouteResult = { primary?: string; tools: RoutedTool[]; note?: string };

const ROUTABLE = CROSSBORDER_TOOLS.filter((t) => ["profit", "pricing", "acos", "dimweight", "landed"].includes(t.id));
const SLUG_BY_ID = new Map(CROSSBORDER_TOOLS.map((t) => [t.id, t.slug]));

const CONFIDENCE_LABEL: Record<RoutedTool["confidence"], string> = {
  high: "很可能", medium: "可能", low: "或许",
};

/**
 * 暂存全部工具的预填，然后打开目标工具。其余工具的参数也存着，之后去到即已填好。
 *
 * `edits` 是用户在卡片里改过的值。这条链路此前完全没有复核环节:识别值只读展示,
 * 点「打开工具」就直接进商品模型(利润计算器挂载后无条件 writeProductModel),
 * 而同一条识别链路的另一个入口(import-drawer)是每项可改、确认项必须回应的。
 * 截图里 ¥ 被当成 $、佣金列读错,就这样被静默写进共享模型并传染给定价/ACoS。
 */
function stageAllAndOpen(tools: RoutedTool[], targetId: string, edits: Record<string, number>) {
  writePendingImports(tools.map((t) => ({
    toolId: t.toolId,
    fields: t.extracted.map((f) => ({ key: f.key, value: edits[`${t.toolId}:${f.key}`] ?? f.value })),
    productName: t.productName,
    marketplace: t.marketplace,
  })));
  const slug = SLUG_BY_ID.get(targetId);
  if (slug) window.location.href = `/crossborder/tools/${slug}`;
}

function openBare(toolId: string) {
  const slug = SLUG_BY_ID.get(toolId);
  if (slug) window.location.href = `/crossborder/tools/${slug}`;
}

export function RouterModal({ onClose, initialText, initialUrl }: { onClose: () => void; initialText?: string; initialUrl?: string }) {
  const initialPrepared = fitMaterialText(initialText || "");
  const [text, setText] = useState(initialPrepared.text);
  const [inputNote, setInputNote] = useState(
    initialPrepared.truncated ? "资料较长，已自动保留前 6,000 字用于识别。" : "",
  );
  const [image, setImage] = useState<{ preview: string; data: string; mediaType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RouteResult | null>(null);
  // 复核制:识别值可改(`toolId:key` → 新值)、确认项须回应(`toolId:i` → 已答)
  const [edited, setEdited] = useState<Record<string, number>>({});
  const [answered, setAnswered] = useState<Record<string, boolean>>({});

  // Esc 关闭:与商品切换器同一约定(Esc / 背板 / 取消三条路都通)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleFile(file?: File | null) {
    if (!file) return;
    setError("");
    // 表格/文本文件(csv/tsv/txt):读成文字进文本框,走文字识别链路
    if (/\.(csv|tsv|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      const reader = new FileReader();
      reader.onerror = () => setError("读不到这个文件，请重新选择一次。");
      reader.onload = () => {
        const t = String(reader.result || "").trim();
        if (t) mergeText(t);
        else setError("这个文件是空的，没有可识别的内容。");
      };
      reader.readAsText(file);
      return;
    }
    if (!file.type.startsWith("image/")) {
      // 静默 return 会让用户以为传上去了(文件对话框一关，界面毫无变化)。
      setError(`不支持这个文件类型（${file.name.split(".").pop()?.toUpperCase() || "未知"}）。请上传截图（PNG/JPG）或 CSV / TXT 表格；Excel 请先另存为 CSV。`);
      return;
    }
    // 格式与体积统一交给 image-intake:HEIC / 超大截图先在浏览器里转成 JPEG。
    prepareImageForVision(file)
      .then(setImage)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "这张截图读不了，请换一张。"));
  }

  function replaceText(value: string) {
    const fitted = fitMaterialText(value);
    setText(fitted.text);
    setInputNote(fitted.truncated ? "资料超过 6,000 字，已自动按识别上限保留，无需手动删除。" : "");
  }

  /**
   * 追加一段新读到的内容。裁剪与「装没装下」的说明都在 mergeMaterial 里 ——
   * 抽屉与 Listing 医生走的是同一份,免得再出现「只有一个入口记得裁」的老问题。
   */
  function mergeText(value: string) {
    const merged = mergeMaterial(text, value);
    setText(merged.text);
    setInputNote(merged.note);
  }

  async function run() {
    setLoading(true);
    setError("");
    try {
      const prepared = fitMaterialText(text);
      if (prepared.text !== text) setText(prepared.text);
      if (prepared.truncated) {
        setInputNote("资料超过 6,000 字，已自动按识别上限保留，无需手动删除。");
      }
      const res = await aiFetch("/api/crossborder/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: prepared.text, image: image ? { data: image.data, mediaType: image.mediaType } : undefined }),
      });
      // 先判 res.ok 再解析:413(超大图)、WAF 拦截页、502 网关页都不是 JSON,
      // 原来的 res.json() 会先抛 SyntaxError,用户看到的是「Unexpected token '<'」。
      const data = await aiJson<RouteResult>(res);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  const tools = result?.tools ?? [];
  const primary = tools[0];

  return (
    <>
      <button className="drawer-backdrop" aria-label="关闭智能读取" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="智能读取资料">
        <div className="drawer-head">
          <div><span>AI 智能读取</span><strong>看资料，判断能喂给哪些工具</strong></div>
          <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>

        <div className="drawer-body">
          {!result ? (
            <>
              {/* 合并时带上来源 URL:多个网页的正文混在同一个资料框里喂给抽取器,
                  只写标题的话,模型产出的 sourceQuote 追不回是哪一页 —— 而这些
                  事实是要写进 Listing 的。 */}
              <UrlFetchRow initialUrl={initialUrl} autoRun={!!initialUrl}
                onText={(t, m) => mergeText(`【${m.title || "网页正文"}】${m.url ? `\n来源:${m.url}` : ""}\n${t}`)} />
              <textarea className="drawer-textarea" value={text}
                onChange={(e) => replaceText(e.target.value)}
                onPaste={(e) => {
                  for (const it of e.clipboardData.items) {
                    if (it.type.startsWith("image/")) { handleFile(it.getAsFile()); e.preventDefault(); break; }
                  }
                }}
                aria-label="粘贴报价或商品资料" placeholder="粘贴供应商报价、商品信息、包装尺寸、关税税率，或直接粘贴截图…一段资料里有几类信息，就会分给几个工具。" />
              <div className="drawer-input-meta">
                <span>{text.length.toLocaleString()} / {MATERIAL_TEXT_LIMIT.toLocaleString()} 字</span>
                {inputNote && <b>{inputNote}</b>}
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
              <p className="drawer-hint">AI 先判断这段资料能喂给哪些工具，再只读取你明确写出（或截图里出现）的数字，不猜测、不推算、不补默认值。识别后先请你核对。</p>
            </>
          ) : tools.length ? (
            <>
              <div className="route-verdict">
                <div className="route-verdict-head">
                  <span className="route-verdict-tag">这段资料可以填入</span>
                  <strong>{tools.length} 个工具</strong>
                </div>
                <p>识别到的参数会一并存好——打开其中任一个都已填好，去其它工具也不用再读一次。挑一个先开始：</p>
              </div>

              {tools.map((t, i) => (
                <div className={`route-tool-card${i === 0 ? " primary" : ""}`} key={t.toolId}>
                  <div className="route-tool-card-head">
                    <strong>{t.toolName}</strong>
                    {i === 0 && <span className="route-best">最匹配</span>}
                    <span className="route-conf">{CONFIDENCE_LABEL[t.confidence]}</span>
                    <span className="route-count">{t.extracted.length} 项</span>
                  </div>
                  {t.reason && <p className="route-tool-reason">{t.reason}</p>}
                  <div className="route-tool-fields">
                    {t.extracted.map((f) => {
                      const id = `${t.toolId}:${f.key}`;
                      const val = edited[id] ?? f.value;
                      const changed = edited[id] !== undefined && edited[id] !== f.value;
                      return (
                        <div className={`import-field${changed ? " is-edited" : ""}`} key={f.key}>
                          <span className="import-field-name">{f.label}</span>
                          <input className="import-field-input" type="number" step="any" value={val}
                            aria-label={`${t.toolName} · ${f.label}(可修改)`}
                            onChange={(e) => setEdited((m) => ({ ...m, [id]: Number(e.target.value) }))} />
                          {changed && <em className="import-edited-tag">已改</em>}
                          <q>{f.sourceQuote}</q>
                        </div>
                      );
                    })}
                  </div>
                  {/* 确认项从「一行灰字注释」改为必须逐条回应 —— 与 import-drawer 同一约定。
                      「金额未标明币种，是否都按美元」这种问题，点过才算看过。 */}
                  {t.questions.map((q, qi) => {
                    const id = `${t.toolId}:${qi}`;
                    return (
                      <div className={`import-question${answered[id] ? " is-answered" : ""}`} key={qi}>
                        <HelpCircle size={13} /><span>{q}</span>
                        <span className="import-q-actions">
                          <button className={answered[id] ? "on" : ""}
                            onClick={() => setAnswered((m) => ({ ...m, [id]: true }))}>知道了</button>
                        </span>
                      </div>
                    );
                  })}
                  {t.missing.length > 0 && (
                    <div className="route-tool-missing">尚未提供：{t.missing.map((m) => m.label).join("、")}（进去后用默认值）</div>
                  )}
                  <button className="route-tool-open"
                    disabled={t.questions.some((_, qi) => !answered[`${t.toolId}:${qi}`])}
                    onClick={() => stageAllAndOpen(tools, t.toolId, edited)}>
                    打开 {t.toolName} <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="import-group">
                <div className="import-group-head warn">没判断出属于哪个工具</div>
                <p className="import-empty">{result.note || "这段资料看起来不属于现有的任何一个工具。"}</p>
              </div>
              <div className="import-group">
                <div className="import-group-head">直接选一个工具打开</div>
                <div className="route-tool-picker">
                  {ROUTABLE.map((t) => (
                    <button key={t.id} className="route-tool-pick" onClick={() => openBare(t.id)}>
                      <t.icon size={15} strokeWidth={1.8} /><span>{t.name}</span><ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="drawer-foot">
          {!result ? (
            <>
              <button className="drawer-cancel" onClick={onClose}>取消</button>
              <button className="drawer-confirm" onClick={run} disabled={loading || (!text.trim() && !image)}>
                {loading ? <><RefreshCw size={15} className="spin" /> 识别中…</> : <><Sparkles size={15} /> 识别并分流</>}
              </button>
            </>
          ) : tools.length && primary ? (
            <>
              <button className="drawer-cancel" onClick={() => setResult(null)}>重新读取</button>
              <button className="drawer-confirm"
                disabled={tools.some((t) => t.questions.some((_, qi) => !answered[`${t.toolId}:${qi}`]))}
                onClick={() => stageAllAndOpen(tools, primary.toolId, edited)}>
                填好并打开 {primary.toolName}
              </button>
            </>
          ) : (
            <button className="drawer-cancel" onClick={() => setResult(null)}>重新读取</button>
          )}
        </div>
      </aside>
    </>
  );
}
