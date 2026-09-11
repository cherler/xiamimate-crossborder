"use client";

/**
 * 「从档案取样本」—— 声音洞察的两个槽 + 深度研究发起页共用。
 *
 * 放在 crossborder/ 根下而不是某个工作台里:它已经被两处用了,
 * 而「评论从哪来」这件事对所有吃评论的功能都是同一个答案。
 *
 * 本商品槽:列当前商品自己的样本(上传的 + 扩展采的)。
 * 竞品槽:列**已绑定档案的竞品**的样本 —— 这正是 Rival.productRef 的价值落点。
 *   没绑定的竞品行只是几个手敲数字,没有评论可取,如实说明而不是假装有。
 *
 * 每一批都带着「怎么来的」一起显示。同样 320 条,后台导出的完整数据与
 * 「只看一星翻三页」得出的结论完全不是一回事,而两份报告长得一模一样。
 */

import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, Swords } from "lucide-react";
import {
  describeSample, listSamples, loadSample, mergeSamples, samplePenalty,
  type ReviewSampleMeta,
} from "../../lib/crossborder/review-samples";
import { rivalView, type Product } from "../../lib/crossborder/products";
import { loadInsights, shortCount, type ProductInsights } from "../../lib/crossborder/review-samples";

export type PickedSample = { meta: ReviewSampleMeta; csv: string; from: string };

/** 样本 → CSV 文本,直接喂给现有的 parseReviewCsv,不必改解析链路。 */
function toCsv(rows: Awaited<ReturnType<typeof loadSample>>): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["评分,日期,变体,正文",
    ...rows.map((r) => [r.rating, r.date, r.variant, r.text].map(esc).join(","))].join("\n");
}

/**
 * 亚马逊全量口碑主题 —— 摆在上传框旁边当参照。
 *
 * 这是个提醒:亚马逊已关掉评论深度翻页,你能采到的样本最多十几条,
 * 而这一块覆盖全部评论。所以量级判断以它为准,采来的原文用于看买家具体说了什么。
 * 不摆出来的话,用户会拿十几条跑出来的百分比当真。
 */
export function InsightsHint({ product }: { product: Product | null }) {
  const [data, setData] = useState<ProductInsights | null>(null);
  useEffect(() => {
    let alive = true;
    if (product) void loadInsights(product).then((r) => { if (alive) setData(r); });
    else setData(null);
    return () => { alive = false; };
  }, [product]);

  if (!data?.topics.length) return null;
  return (
    <div className="insight-hint">
      <div className="insight-hint-head">
        亚马逊全量口碑主题
        {data.totalReviews ? <em>覆盖全部 {data.totalReviews.toLocaleString()} 条</em> : null}
      </div>
      <div className="pd-topics">
        {data.topics.slice(0, 8).map((t) => (
          <span key={t.name} className={`pd-topic ${t.sentiment}`}>
            {t.name} <b>{shortCount(t.mentions)}</b>
          </span>
        ))}
      </div>
      <div className="insight-hint-foot">
        量级以这里为准 —— 下面上传/选取的评论原文用于看买家具体说了什么，
        十几条样本算出的百分比不可当真。
      </div>
    </div>
  );
}

export function SamplePicker({ product, mode, onPick }: {
  product: Product | null;
  mode: "mine" | "rival";
  onPick: (p: PickedSample) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ meta: ReviewSampleMeta; from: string }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // 多选:分层采样天然是多批(五个星级各一批),只能选一批的话分层就没意义了
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!product) { setRows([]); return; }
    if (mode === "mine") {
      const items = await listSamples(product);
      setRows(items.map((meta) => ({ meta, from: product.name })));
      return;
    }
    // 竞品:只有绑定了档案的行才有样本可取
    const linked = (product.rivals ?? []).map(rivalView).filter((v) => v.linked);
    const all: { meta: ReviewSampleMeta; from: string }[] = [];
    for (const v of linked) {
      const items = await listSamples(v.linked!);
      all.push(...items.map((meta) => ({ meta, from: v.name })));
    }
    setRows(all);
  }, [product, mode]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  function toggle(batchId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
  }

  /** 选中的几批合成一份样本:跨批去重、溯源合账。 */
  async function applySelected() {
    const chosen = (rows ?? []).filter((r) => picked.has(r.meta.batchId));
    if (!chosen.length) return;
    setBusy("merge");
    setErr("");
    try {
      const loaded = await Promise.all(chosen.map(async (c) => ({
        meta: c.meta, reviews: await loadSample(c.meta.batchId),
      })));
      const merged = mergeSamples(loaded);
      onPick({
        meta: merged.meta,
        from: [...new Set(chosen.map((c) => c.from))].join(" / "),
        csv: toCsv(merged.reviews),
      });
      setPicked(new Set());
      setOpen(false);
    } catch {
      setErr("样本加载失败，稍后再试。");
    } finally { setBusy(""); }
  }

  const unlinkedCount = mode === "rival"
    ? (product?.rivals ?? []).filter((r) => !r.productRef).length : 0;

  return (
    <div className="sample-picker">
      <button type="button" className="fact-upload" onClick={() => setOpen((v) => !v)}>
        {mode === "rival" ? <Swords size={13} /> : <Database size={13} />}
        {mode === "rival" ? "从竞品档案取评论" : "从商品档案取评论"}
      </button>

      {open && (
        <div className="sample-list">
          {rows === null ? <p className="sample-empty"><Loader2 size={13} className="spin" /> 加载中…</p>
            : rows.length === 0 ? (
              <p className="sample-empty">
                {mode === "rival"
                  ? unlinkedCount > 0
                    ? `这个商品有 ${unlinkedCount} 个竞品，但都还没绑定到商品档案 —— 手录的竞品只有几个数字，没有评论。用浏览器扩展采集对手的商品页，或在竞品组里手动绑定已有档案。`
                    : "还没有竞品评论。用浏览器扩展在对手商品页采集评论，再在竞品组里绑定过来。"
                  : "这个商品还没有评论样本。自家商品从卖家后台导出 CSV 上传；别人的商品用浏览器扩展采集。"}
              </p>
            ) : (<>
              <p className="sample-tip">
                可以多选 —— 亚马逊只放出第一页，完整样本要按五个星级分别采集，那就是五批。
                合并时会自动跨批去重。
              </p>
              {rows.map(({ meta, from }) => {
                const warn = samplePenalty(meta);
                const on = picked.has(meta.batchId);
                return (
                  <label key={meta.batchId} className={`sample-row${on ? " on" : ""}`}>
                    <div className="sample-row-top">
                      <input type="checkbox" checked={on} onChange={() => toggle(meta.batchId)} />
                      <span className={`pd-sample-tag ${meta.source}`}>
                        {meta.source === "upload" ? "上传" : "扩展采集"}
                      </span>
                      <b>{meta.reviewCount.toLocaleString()} 条</b>
                      {mode === "rival" && <span className="sample-from">{from}</span>}
                    </div>
                    <div className="pd-sample-from">{describeSample(meta)}</div>
                    {warn && <div className="pd-sample-warn">{warn}</div>}
                  </label>
                );
              })}
              <button type="button" className="ext-btn sample-use"
                disabled={!picked.size || busy === "merge"} onClick={() => void applySelected()}>
                {busy === "merge" ? <><Loader2 size={13} className="spin" /> 合并中…</>
                  : picked.size
                    ? `用选中的 ${picked.size} 批（共 ${rows.filter((r) => picked.has(r.meta.batchId))
                        .reduce((n, r) => n + r.meta.reviewCount, 0).toLocaleString()} 条，去重后可能更少）`
                    : "请先勾选样本"}
              </button>
            </>)}
          {err && <p className="pd-sample-warn">{err}</p>}
        </div>
      )}
    </div>
  );
}
