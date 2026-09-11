"use client";

/**
 * 用户声音洞察。
 *
 * 与旧的「Review 关键词归因」的差别不在模型，在分工：
 * 模型只给每条评论贴主题、引原文；频次、占比、对评分的影响全部由确定性引擎
 * 按实际样本算 —— 让模型报「18.6% 抱怨尺寸」，那个数字是编的。
 *
 * 样本的问题先讲清楚再谈结论：30 条里的 18% 和 3000 条里的 18% 不是一回事。
 */

import { useEffect, useMemo, useState } from "react";
import { aiFetch, aiJson } from "../../../../lib/api";
import {
  AlertTriangle, Bookmark, Check, FileSearch, FileText, Info, ListChecks, MessageSquareText,
  Package, RefreshCw, Upload,
} from "lucide-react";
import { readProject } from "../../../../lib/crossborder/product-facts";
import {
  addRecord, currentProduct, defaultProductName, findOrCreateProduct,
  isCloudEnabled, listProducts, saveProductRecord, schedulePush,
} from "../../../../lib/crossborder/products";
import { useCurrentProduct, useProductContextSync } from "../../../../lib/crossborder/use-product-context";
import { AigcBadge } from "../../aigc";
import { VOICE_SAMPLES } from "../../../../lib/crossborder/workbench-samples";
import { ProductSwitcher } from "../../tools/product-switcher";
import { SaveResultModal } from "../../tools/save-result-modal";
import {
  quoteReport, startReport, type ReportQuote, type ReportReview,
} from "../../../../lib/crossborder/deep-report";
import {
  MINE_PREFIX, SURFACE_LABEL, THEIRS_PREFIX, aggregateThemes, compareThemes,
  detectComparabilityIssues, detectSampleIssues, detectThemeIssues, parseReviewCsv, profileSample,
  type MappedSuggestion, type Review, type SampleProfile, type SampleWarning,
  type SideBySide, type ThemeAssignment, type ThemeStat,
} from "../../../../lib/crossborder/review-insight";
import { InsightsHint, SamplePicker, type PickedSample } from "../../sample-picker";
import { describeSample, saveUpload } from "../../../../lib/crossborder/review-samples";
import {
  clearDraft, inputFingerprint, pruneDrafts, readDraft, writeDraft,
} from "../../../../lib/crossborder/workbench-draft";

type Competitor = {
  themes: ThemeStat[];
  profile: SampleProfile;
  comparison: SideBySide[];
  warnings: SampleWarning[];
};

type SuggestResponse = {
  suggestions?: MappedSuggestion[];
  issues?: Array<{ id: string; level: "warn" | "info"; text: string }>;
  error?: string;
};

type BatchResponse = { assignments?: ThemeAssignment[]; truncated?: boolean; error?: string };

type Analysis = {
  themes: ThemeStat[];
  profile: SampleProfile;
  warnings: SampleWarning[];
  competitor?: Competitor;
};

// 必须与路由的 MAX_PER_BATCH 一致：真实评论较长，一批标注很快撑满输出上限，
// 60 条能在一次输出里标完。前端超过 60 就自动分批，别让路由拒收。
const BATCH_SIZE = 60;

/** 未跑完的分析断点。fingerprint 用来确认「输入还是那份输入」,否则不能续跑。 */
type PartialRun = {
  fingerprint: string;
  runKey: string;
  done: number;                 // 已完成批数
  total: number;
  /** 当时的分批大小。发版调过 BATCH_SIZE 的话,旧断点的批次边界与现在对不上,
   *  续跑会把「第 4 批」跑成完全不同的一批评论 —— 那样接出来的结果是错的。
   *  所以存下来,不一致就作废断点(宁可重跑,不能出错结果)。 */
  batchSize: number;
  assignments: ThemeAssignment[];
  known: string[];
  truncated: boolean;
};

const PARTIAL_KEY = "voice-insight-partial";

/** 给评论编全局唯一 id：批次合并后 aggregateThemes 靠 id 认人。 */
const withIds = (reviews: Review[], prefix: string): Review[] =>
  reviews.map((r, i) => ({ ...r, id: `${prefix}${i + 1}` }));

const chunk = <T,>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

function ThemeCard({ t }: { t: ThemeStat }) {
  return (
    <div className={`theme-card is-${t.sentiment}`}>
      <div className="theme-head">
        <span className={`theme-badge ${t.sentiment}`}>{t.sentiment === "negative" ? "问题" : "亮点"}</span>
        <strong>{t.theme}</strong>
        <em>{t.count} 条 · {t.share}%</em>
      </div>
      <div className="theme-stats">
        <div><small>平均分</small><b>{t.avgRating || "—"}</b></div>
        <div>
          <small>对评分的影响</small>
          <b className={t.ratingDelta < -0.5 ? "neg" : t.ratingDelta > 0.5 ? "pos" : ""}>
            {t.ratingDelta > 0 ? "+" : ""}{t.ratingDelta || "—"}
          </b>
        </div>
        <div><small>主要变体</small><b>{t.variants.length ? t.variants.join("、") : "—"}</b></div>
      </div>
      <div className="theme-evidence">
        {t.evidence.map((e, i) => (
          <div key={i}><span>{e.rating ? `${e.rating}★` : "—"}</span><q>{e.quote}</q></div>
        ))}
      </div>
    </div>
  );
}

const VERDICT_LABEL: Record<SideBySide["verdict"], string> = {
  mine_only: "我方独有",
  shared: "品类通病",
  theirs_only: "对方独有",
};

/** 我方独有 = 真该改；品类通病 = 改了也不构成差异；对方独有 = 可打的差异点。 */
function CompareRow({ c }: { c: SideBySide }) {
  return (
    <div className={`cmp-row is-${c.verdict}`}>
      <div className="cmp-head">
        <span className={`cmp-verdict ${c.verdict}`}>{VERDICT_LABEL[c.verdict]}</span>
        <strong>{c.theme}</strong>
        {c.shareDelta !== null && (
          <em className={c.shareDelta > 0 ? "neg" : c.shareDelta < 0 ? "pos" : ""}>
            {c.shareDelta > 0 ? "+" : ""}{c.shareDelta}pt
          </em>
        )}
      </div>
      <div className="cmp-bars">
        <div><small>你</small><b>{c.mine ? `${c.mine.count} 条 · ${c.mine.share}%` : "—"}</b></div>
        <div><small>竞品</small><b>{c.theirs ? `${c.theirs.count} 条 · ${c.theirs.share}%` : "—"}</b></div>
      </div>
    </div>
  );
}

/**
 * 升级为深度舆情报告:后端分段跑(清洗→归因→竞品→撰写),按真实 积分 分段扣费。
 * 先估算再启动 —— 余额不够在这里就拦下,不会跑到一半才发现。
 */
function DeepReportCta({ mine, theirs, context }: {
  mine: ReportReview[]; theirs: ReportReview[]; context: string;
}) {
  const [quote, setQuote] = useState<ReportQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 商品关联:报告必须挂到一个「有名字的商品档案」上才能溯源 —— 默认取当前商品名,
  // 没有就用商品背景(商品背景=主题优先命名),都没有留空、启动时兜底成「舆情分析 · 时间」。
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [product, setProduct] = useState("");

  useEffect(() => {
    setProducts(listProducts().map((p) => ({ id: p.id, name: p.name })).filter((p) => p.name.trim()));
    const cur = currentProduct();
    setProduct(cur?.name?.trim() || context.trim() || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseInput = () => ({
    productContext: context,
    reviews: mine, competitor: theirs.length ? theirs : undefined,
  });

  async function askQuote() {
    setBusy(true); setErr("");
    try { setQuote(await quoteReport(baseInput())); }
    catch (e) {
      const s = (e as Error & { status?: number }).status;
      setErr(s === 401 ? "生成报告需要登录 —— 报告会存到你的账号里,随时回来看。"
        : e instanceof Error ? e.message : "估算失败,请稍后再试。");
    } finally { setBusy(false); }
  }

  async function start() {
    setBusy(true); setErr("");
    try {
      // 先落商品档案:按「名+市场」组合键复用、无名兜底,报告绑它的 stableId(改名/换设备不断链)。
      const cur = currentProduct();
      const p = findOrCreateProduct({
        name: product.trim() || defaultProductName("voice", context),
        marketplace: cur?.marketplace, asin: cur?.asin,
      });
      const run = await startReport({ ...baseInput(), productRef: p.stableId, productName: p.name });
      // 归档:舆情报告挂到商品名下(records tool=voice),和研究报告同一套复购闭环。
      addRecord(p.id, { tool: "voice", label: `用户声音报告 · ${p.name}`, values: { runId: run.runId } });
      if (isCloudEnabled()) schedulePush();
      window.location.href = `/crossborder/report/?id=${encodeURIComponent(run.runId)}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "启动失败,请稍后再试。");
      setBusy(false);
    }
  }

  return (
    <div className="wb-block deepr-cta">
      <div className="section-heading">
        <span><FileText size={15} /> 深度用户声音报告</span>
        <em>消耗 AI 积分 · 按实结算</em>
      </div>
      <p className="fact-note" style={{ marginTop: 0 }}>
        把上面的主题洞察升级成一份<b>可存档的结构化报告</b>:执行摘要、按严重度排序的问题清单
        (每条带原文证据与整改方向)、可放大的卖点、样本口径注意事项。
        分四段生成、按<b>实际消耗的积分</b>分段结算;中途余额不足会保留进度,补额后续跑,已完成的段不重复扣。
      </p>
      <label className="gen-field" style={{ marginTop: 4 }}>
        <span><Package size={12} /> 这份报告分析的是哪个商品?</span>
        <input className="gen-input" list="xm-voice-products" value={product}
          placeholder="选一个已有商品,或输入新名字新建档案"
          onChange={(e) => setProduct(e.target.value)} />
        <datalist id="xm-voice-products">
          {products.map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
      </label>
      <p className="fact-note" style={{ marginTop: 0 }}>
        报告会挂到这个商品名下、存进<b>「我的商品」</b> —— 之后能回头看「这份报告分析的是哪个商品、用了哪些评论」。
        留空则自动命名为<b>「用户声音分析 · 时间」</b>。
      </p>
      {!quote ? (
        <div className="fact-foot-actions">
          <button className="fill" onClick={askQuote} disabled={busy}>
            {busy ? <><RefreshCw size={12} className="spin" /> 估算中…</> : <>先看预估消耗({mine.length} 条评论{theirs.length ? ` + ${theirs.length} 条竞品` : ""})</>}
          </button>
        </div>
      ) : (
        <div className="deepr-quote">
          <div className="deepr-quote-row">
            <span>预估上限</span>
            <b>{quote.quote.toLocaleString()} 积分</b>
          </div>
          <div className="deepr-quote-row">
            <span>当前余额</span>
            <b className={quote.sufficient ? "" : "neg"}>{quote.available.toLocaleString()} 积分</b>
          </div>
          <p className="fact-note" style={{ margin: "6px 0 8px" }}>
            这是<b>冻结上限</b>不是实际消耗 —— 每段跑完按真实用量结算,多退。实际消耗通常低于预估。
          </p>
          {quote.sufficient ? (
            <div className="fact-foot-actions">
              <button className="fill" onClick={start} disabled={busy}>
                {busy ? <><RefreshCw size={12} className="spin" /> 启动中…</> : <><FileText size={12} /> 生成报告</>}
              </button>
            </div>
          ) : (
            <div className="conflict-item warn">
              <AlertTriangle size={14} />
              <span>余额不足以启动(差 {(quote.quote - quote.available).toLocaleString()} 积分)。可减少评论条数降低预估,或等充值上线后补额。</span>
            </div>
          )}
        </div>
      )}
      {err && <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>}
    </div>
  );
}

/** 样本来源的一句话标注。选了样本之后必须一直摆在输入框旁边 ——
 *  用户很容易忘了自己刚才选的是「只看一星的 50 条」还是完整数据。 */
function describeSampleShort(p: PickedSample): string {
  return describeSample(p.meta);
}

export function InsightPanel() {
  const [csv, setCsv] = useState("");
  const [rivalCsv, setRivalCsv] = useState("");
  // 从档案取的样本,它是怎么来的。手工粘贴的为空。
  const [mineSource, setMineSource] = useState("");
  const [rivalSource, setRivalSource] = useState("");
  const product = useCurrentProduct();
  const [context, setContext] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [progress, setProgress] = useState("");
  const [suggest, setSuggest] = useState<SuggestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);
  /**
   * 这份结果是拿什么输入跑出来的。
   *
   * 用来判断「再点一次分析」是不是白花钱:输入没变,结果就不会变,
   * 而这一步要花积分、要等模型。用户实测时就点重了 —— 界面上没有任何东西
   * 提示他「你已经有结果了」。
   */
  const [ranWith, setRanWith] = useState("");
  /**
   * 未跑完的分析断点。
   *
   * 大样本按 60 条一批分开调模型,**每批都单独结算**。跑到第 3 批时用户切走页面,
   * 前 3 批的钱已经花了,结果却还在内存里等着最后组装 —— 一走全丢。
   * (在途的那一批不收费:闸口捕 CancelledError 会释放冻结,实测确认过。)
   *
   * 所以每批完成就落盘。回来时若输入没变,可以从第 4 批接着跑。
   */
  const [partial, setPartial] = useState<PartialRun | null>(null);

  const fingerprint = inputFingerprint(csv, rivalCsv, context);
  const upToDate = !!result && ranWith === fingerprint;
  const scope = product?.stableId ?? "-";

  // 商品背景跟随当前商品(顶部切换器)—— 让这个工作台天然属于商品档案。
  useProductContextSync(setContext);

  /*
   * 草稿:未保存的工作状态自动留存。
   *
   * 一次分析要花积分、要等模型,而结果只活在 state 里 —— 用户去点一下
   * 「深度报告」再回来就空了,钱和时间都白花。而「映射建议」出一长串之后
   * 报告入口被挤到很下面,这个来回跳转几乎必然发生。
   *
   * 站点是静态导出、跳转会整页重载,所以必须落 localStorage,内存留不住。
   */
  useEffect(() => { pruneDrafts(); }, []);

  // 读断点。输入变了就作废 —— 拿旧批次的结论去配新样本会算出错的占比。
  useEffect(() => {
    const pr = readDraft<PartialRun>(PARTIAL_KEY, scope);
    // 分批大小变了就作废:批次边界不同,续跑接出来的是错结果
    const usable = pr && pr.fingerprint === fingerprint && pr.done < pr.total
      && (pr.batchSize ?? BATCH_SIZE) === BATCH_SIZE;
    setPartial(usable ? pr : null);
    if (pr && !usable) clearDraft(PARTIAL_KEY, scope);
  }, [scope, fingerprint]);

  useEffect(() => {
    // 带 ?snap= 回来是「打开某个已保存快照」,那条路径自己会填状态,别抢
    if (new URLSearchParams(window.location.search).get("snap")) return;
    const d = readDraft<{
      csv?: string; rivalCsv?: string; mineSource?: string; rivalSource?: string;
      result?: Analysis | null; suggest?: SuggestResponse | null; ranWith?: string;
    }>("voice-insight", scope);
    if (!d?.result) return;
    setCsv(d.csv ?? "");
    setRivalCsv(d.rivalCsv ?? "");
    setMineSource(d.mineSource ?? "");
    setRivalSource(d.rivalSource ?? "");
    setResult(d.result ?? null);
    setSuggest(d.suggest ?? null);
    setRanWith(d.ranWith ?? "");
    setRestored(true);
  }, [scope]);

  // 从快照恢复(?snap=)进来时,结果与刚填好的 csv 本就是一对 —— 补上指纹,
  // 否则按钮会显示成「重新分析」,诱使用户再花一次积分跑出同样的结果。
  useEffect(() => {
    if (result && !ranWith && csv) setRanWith(fingerprint);
  }, [result, ranWith, csv, fingerprint]);

  useEffect(() => {
    if (!result) return;
    writeDraft("voice-insight", scope,
      { csv, rivalCsv, mineSource, rivalSource, result, suggest, ranWith },
      // 塞不下时先丢原始 CSV:它可再生(样本还在档案里),而分析结果是花了钱的
      (d) => ({ ...d, csv: "", rivalCsv: "" }));
  }, [scope, csv, rivalCsv, mineSource, rivalSource, result, suggest]);

  function discardDraft() {
    clearDraft("voice-insight", scope);
    setResult(null); setSuggest(null); setCsv(""); setRivalCsv("");
    setMineSource(""); setRivalSource(""); setRestored(false); setRanWith("");
  }


  // #6:从商品档案点主题分析记录回来(?snap=)→ 还原当时的评论 CSV + 分析结果。
  useEffect(() => {
    const snap = new URLSearchParams(window.location.search).get("snap");
    if (!snap) return;
    const v = currentProduct()?.records?.find((r) => r.id === snap)?.values as
      { csv?: string; rivalCsv?: string; result?: Analysis } | undefined;
    if (v?.result) {
      if (v.csv) setCsv(v.csv);
      if (v.rivalCsv) setRivalCsv(v.rivalCsv);
      setResult(v.result);
      // 指纹要在下一轮渲染按新 csv 算,这里先置空;effect 会在 csv 落定后补上
      setRanWith("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = useMemo(() => (csv.trim() ? parseReviewCsv(csv) : null), [csv]);
  const rivalPreview = useMemo(() => (rivalCsv.trim() ? parseReviewCsv(rivalCsv) : null), [rivalCsv]);

  function loadFile(file: File | null | undefined, set: (v: string) => void) {
    if (!file) return;
    setError("");
    /**
     * accept 只是文件对话框的默认筛选,用户切到「所有文件」照样能选中 .xlsx。
     * 而 readAsText 读 xlsx 出来是一堆二进制乱码,静默灌进文本框 ——
     * 下面只会说一句「没认出评论正文列」,把一个「选错文件」说成「表头不对」,
     * 用户会去改表头,越改越不对。
     */
    if (!/\.(csv|tsv|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setError(`不支持这个文件类型（${file.name.split(".").pop()?.toUpperCase() || "未知"}）。请上传 CSV / TXT；Excel 请先「另存为 CSV」。`);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError("读不到这个文件，请重新选择一次。");
    reader.onload = () => {
      const t = String(reader.result || "");
      if (t.trim()) set(t);
      else setError("这个文件是空的，没有可分析的评论。");
    };
    reader.readAsText(file);
  }

  async function analyse(resume?: PartialRun) {
    const p = parseReviewCsv(csv);
    if (p.missingText || !p.reviews.length) {
      setError("没能从 CSV 里认出评论正文列。请确认表头里有 body / text / content / 评论 之类的列名。");
      return;
    }
    setLoading(true);
    setError("");
    setProgress("");
    try {
      const rival = rivalCsv.trim() ? parseReviewCsv(rivalCsv) : null;
      const mine = withIds(p.reviews, MINE_PREFIX);
      const theirs = withIds(rival?.reviews ?? [], THEIRS_PREFIX);

      // 双方合并后一起分批：同一批里既有我方也有竞品，主题词汇天然一致；
      // 跨批则靠 knownThemes 把前面用过的名字带下去。
      const all = [...mine, ...theirs];
      const batches = chunk(all, BATCH_SIZE);
      const assignments: ThemeAssignment[] = [];
      const known = new Set<string>();
      let anyTruncated = false;
      // 整轮分析共用一个 run key(串起同一次操作,便于排查与统计)。
      // 注意:计费**不再**是「整轮只收第一批」—— 每批都真的调了模型、真的花了 token,
      // 现在按每批实际用量走积分公式(最少 1 分)。所以多批 = 多分,与真实成本挂钩。
      // 续跑沿用同一个 run key:同一次操作的流水要串得起来
      const runKey = resume?.runKey ?? crypto.randomUUID();
      let stoppedAt = -1;      // 因额度不足中断在第几批(0-based)

      // 从断点接着跑:前面那些批已经付过钱了,不该再付第二次
      // 批次数与分批大小都要一致才敢续 —— 对不上就从头跑(多花一次钱,
      // 但绝不会把「第 4 批」接到一批不同的评论上得出错结果)
      const startAt = resume && resume.total === batches.length
        && (resume.batchSize ?? BATCH_SIZE) === BATCH_SIZE ? resume.done : 0;
      if (resume && startAt > 0) {
        for (const a of resume.assignments) { assignments.push(a); known.add(a.theme); }
        for (const k of resume.known) known.add(k);
        if (resume.truncated) anyTruncated = true;
      }

      for (const [i, batch] of batches.entries()) {
        if (i < startAt) continue;                 // 已付费、已拿到结果的批次跳过
        if (batches.length > 1) setProgress(`第 ${i + 1} / ${batches.length} 批（共 ${all.length} 条）…`);
        const res = await aiFetch("/api/crossborder/reviews", {
          method: "POST",
          headers: { "content-type": "application/json", "x-run-key": runKey },
          body: JSON.stringify({
            reviews: batch.map((r) => ({ id: r.id, rating: r.rating, text: r.text })),
            knownThemes: [...known],
            productContext: context,
          }),
        });
        let data: BatchResponse;
        try {
          data = await aiJson<BatchResponse>(res);
        } catch (e) {
          /**
           * 额度不足只中断后续批次,**不丢已经分析完的部分**。
           *
           * 计费改成按批计量后,一轮几十批的大样本可能跑到一半额度用尽。
           * 原来这里会直接抛出去,前面几批花掉的积分和分析结果一起作废 ——
           * 用户既扣了分又什么都没拿到。现在保留已完成的部分并如实说明到哪一批。
           */
          const msg = e instanceof Error ? e.message : "";
          if (/额度|积分|not enough|no_credits|guest_limit/i.test(msg) && assignments.length) {
            stoppedAt = i;
            break;
          }
          throw e;
        }
        if (data.truncated) anyTruncated = true;
        for (const a of data.assignments ?? []) {
          assignments.push(a);
          known.add(a.theme);
        }
        /*
         * 每批一落盘。这批的钱已经花掉了 —— 用户下一秒切走页面,
         * 这份结果也不该跟着消失。写失败静默:它是保险,不能反过来打断分析。
         */
        if (batches.length > 1 && i + 1 < batches.length) {
          writeDraft<PartialRun>(PARTIAL_KEY, scope, {
            fingerprint, runKey, done: i + 1, total: batches.length, batchSize: BATCH_SIZE,
            assignments: [...assignments], known: [...known], truncated: anyTruncated,
          }, (d) => d);
        }
      }
      // 跑完了,断点没用了
      clearDraft(PARTIAL_KEY, scope);
      setPartial(null);

      // 统计全部算自实际样本，用的是与服务端同一套纯引擎。
      const themes = aggregateThemes(mine, assignments);
      const profile = profileSample(mine);
      const analysis: Analysis = {
        themes,
        profile,
        warnings: [
          ...detectSampleIssues(profile),
          ...detectThemeIssues(themes, mine.length),
          // 某一批评论太长、单批也被截断 —— 如实说这批没标全，别把不完整当完整。
          ...(anyTruncated ? [{
            id: "batch-truncated", level: "warn" as const,
            text: "有评论特别长，某一批的归类没标完就到了模型输出上限，这部分主题可能缺失。把过长的评论删短，或拆成更小的批次再试。",
          }] : []),
          // 额度中断:必须让读者知道这份报告只覆盖了一部分样本,否则占比会被当成全量结论
          ...(stoppedAt >= 0 ? [{
            id: "quota-stopped", level: "warn" as const,
            text: `积分不足，只分析了前 ${stoppedAt} / ${batches.length} 批（约 ${stoppedAt * BATCH_SIZE} 条评论）。`
                  + "下面的主题与占比只反映这部分样本，不代表全部评论。补充积分后重新分析可得到完整结果。",
          }] : []),
        ],
      };
      if (theirs.length) {
        const theirThemes = aggregateThemes(theirs, assignments);
        const theirProfile = profileSample(theirs);
        analysis.competitor = {
          themes: theirThemes,
          profile: theirProfile,
          comparison: compareThemes(themes, theirThemes),
          warnings: detectComparabilityIssues(profile, theirProfile),
        };
      }
      setResult(analysis);
      // 记下这份结果对应的输入 —— 下次点「分析主题」据此判断会不会白花一次
      setRanWith(fingerprint);
      setRestored(false);

      /*
       * 手工上传/粘贴的评论,存成当前商品的口碑样本。
       *
       * 不存的话它就是一次性的:分析完原始评论就没了,档案里只剩结论,
       * 下次想换个角度重跑还得再传一遍。从档案取的样本不用再存(mineSource
       * 非空即说明来自档案),否则同一批评论会在档案里堆出无数副本。
       *
       * 失败不提示、不阻断 —— 分析结果已经在屏幕上了,存档是附带动作。
       */
      if (!mineSource && product && p.reviews.length) {
        void saveUpload(product, p.reviews.map((r) => ({
          id: r.id, rating: r.rating, date: r.date, variant: r.variant,
          title: "", text: r.text, verified: false, helpful: 0,
        })), `手工上传 · ${p.reviews.length} 条`).catch(() => {});
      }
      setSuggest(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败，请稍后再试。");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  /**
   * 映射用到商品事实库：建议要写进 Listing 的事实若未确认，会被标出来。
   * 事实库来自 Listing 工作台的同一个项目 —— 两个工作台共用一份商品事实。
   */
  async function mapChanges() {
    if (!result?.themes.length) return;
    setMapping(true);
    setError("");
    try {
      const project = readProject();
      const confirmed = project?.facts.filter((f) => f.status === "confirmed" && f.value.trim()) ?? [];
      const unconfirmed = project?.facts.filter((f) => !(f.status === "confirmed" && f.value.trim())) ?? [];
      const res = await aiFetch("/api/crossborder/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          themes: result.themes,
          comparison: result.competitor?.comparison ?? [],
          confirmedFacts: confirmed.map((f) => ({ label: f.label, value: f.value })),
          unconfirmedLabels: unconfirmed.map((f) => f.label),
          productContext: context,
        }),
      });
      const data = await aiJson<SuggestResponse>(res);
      setSuggest(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "映射失败，请稍后再试。");
    } finally {
      setMapping(false);
    }
  }

  const negatives = result?.themes?.filter((t) => t.sentiment === "negative") ?? [];
  const positives = result?.themes?.filter((t) => t.sentiment === "positive") ?? [];
  const [savedAnalysis, setSavedAnalysis] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // 保存本次主题分析为商品档案的一个版本(舆情报告是另一条:tool=voice)。
  function saveAnalysis() {
    if (!result) return;
    const summary = [
      `样本 ${result.profile.total} 条 · 均分 ${result.profile.avgRating}`,
      negatives.length ? `问题主题:${negatives.map((t) => `${t.theme}(${t.share}%)`).join("、")}` : "",
      positives.length ? `亮点主题:${positives.map((t) => `${t.theme}(${t.share}%)`).join("、")}` : "",
      result.competitor ? `竞品对比:你 ${result.profile.total} 条 vs 竞品 ${result.competitor.profile.total} 条` : "",
    ].filter(Boolean).join("\n");
    saveProductRecord("voice_theme", `主题分析 · ${result.themes.length} 主题`, {
      summary, total: result.profile.total, themes: result.themes.length,
      // 存输入(评论 CSV)+ 输出(分析结果),供「带这一版回工作台」原样还原(#6)。
      csv, rivalCsv, result,
    });
    setSavedAnalysis(true); setTimeout(() => setSavedAnalysis(false), 1500);
    window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "happy" } }));
  }

  return (
    <>
    <div className="wb-toolbar">
      <ProductSwitcher />
      <div className="wb-toolbar-right">
        <button className="wb-snapshot-btn" onClick={() => setSaveOpen(true)} disabled={!result}
          title={result ? "保存本次主题分析(选存到商品档案或独立结果)" : "先分析主题,才有可保存的快照"}>
          {savedAnalysis ? <><Check size={14} /> 已保存</> : <><Bookmark size={14} /> 保存本次快照</>}
        </button>
        <a className="wb-toolbar-link" href="/crossborder/report/"><FileText size={14} /> 我的用户声音报告</a>
      </div>
    </div>
    <div className="wb-grid">
      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><Upload size={15} /> 上传评论</span><em>CSV · 从后台导出</em></div>
          <textarea className="mt-textarea" style={{ minHeight: 150 }} value={csv}
            placeholder="粘贴 CSV，或点下方上传。需要含评分 / 日期 / 变体 / 正文列…"
            onChange={(e) => { setCsv(e.target.value); setMineSource(""); }} />
          <div className="fact-import-actions">
            <SamplePicker product={product} mode="mine" onPick={(p: PickedSample) => {
              setCsv(p.csv);
              setMineSource(describeSampleShort(p));
            }} />
            {mineSource && <span className="sample-badge">本商品样本:{mineSource}</span>}
            <label className="fact-upload">
              <Upload size={13} /> 上传 CSV
              <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => loadFile(e.target.files?.[0], setCsv)} />
            </label>
            {/*
              已经有结果、且输入一个字没改 → 不让再点。
              这一步花积分、等模型,而再跑一次的结果必然一样。
              改过内容则按钮变成「重新分析」,明示这次会重新花一次。
            */}
            <button className="gen-btn" onClick={() => void analyse()}
              disabled={loading || !csv.trim() || upToDate}
              title={upToDate ? "评论内容没有变化,结果不会变 —— 改动评论或商品背景后可重新分析" : undefined}>
              {loading ? <><RefreshCw size={14} className="spin" /> {progress || "分析中…"}</>
                : upToDate ? <><FileSearch size={14} /> 已分析(内容未变)</>
                : result ? <><RefreshCw size={14} /> 重新分析</>
                : <><FileSearch size={14} /> 分析主题</>}
            </button>
          </div>
          <div className="wb-sample-row">
            <span>没有评论?用示例(含竞品)一键跑一遍:</span>
            {VOICE_SAMPLES.map((s) => (
              <button key={s.id} className="fact-upload"
                onClick={() => { setCsv(s.reviews); setRivalCsv(s.rival); }}>示例 · {s.label}</button>
            ))}
          </div>

          {preview && (
            <div className={`conflict-item ${preview.missingText ? "warn" : "info"}`}>
              {preview.missingText ? <AlertTriangle size={14} /> : <Info size={14} />}
              <span>
                {preview.missingText
                  ? "没认出评论正文列。表头需要含 body / text / content / 评论 之类的列名。"
                  : `认出 ${preview.reviews.length} 条评论 · 正文列「${preview.columns.text}」${
                      preview.columns.rating ? ` · 评分列「${preview.columns.rating}」` : " · 无评分列"}${
                      preview.columns.variant ? ` · 变体列「${preview.columns.variant}」` : " · 无变体列"}`}
              </span>
            </div>
          )}
          {error && <div className="tool-error"><AlertTriangle size={15} /><span>{error}</span></div>}

          <InsightsHint product={product} />

          <div className="section-heading mt-gap"><span>竞品评论</span><em>选填 · 用于对比</em></div>
          <SamplePicker product={product} mode="rival" onPick={(p: PickedSample) => {
            setRivalCsv(p.csv);
            setRivalSource(`${p.from} · ${describeSampleShort(p)}`);
          }} />
          {rivalSource && <div className="sample-badge">竞品样本:{rivalSource}</div>}
          <textarea className="mt-textarea" style={{ minHeight: 80 }} value={rivalCsv}
            placeholder="粘贴竞品评论 CSV（同样需要含正文列）…"
            onChange={(e) => { setRivalCsv(e.target.value); setRivalSource(""); }} />
          <div className="fact-import-actions">
            <label className="fact-upload">
              <Upload size={13} /> 上传竞品 CSV
              <input type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => loadFile(e.target.files?.[0], setRivalCsv)} />
            </label>
          </div>
          {rivalPreview && (
            <div className={`conflict-item ${rivalPreview.missingText ? "warn" : "info"}`}>
              {rivalPreview.missingText ? <AlertTriangle size={14} /> : <Info size={14} />}
              <span>{rivalPreview.missingText ? "竞品 CSV 没认出正文列。" : `认出 ${rivalPreview.reviews.length} 条竞品评论`}</span>
            </div>
          )}
          <p className="fact-note">
            竞品评论<b>由你自己获取</b> —— 上传 CSV，或用浏览器扩展在你打开的商品页上采集。
            我们不提供竞品 ASIN 数据，服务器也<b>不去抓取任何页面</b>：扩展读的是你自己浏览器里
            已经打开的那一页，不翻页、不后台运行。
            双方评论会<b>合在一起分批归类</b>，主题名才对得齐。超过 {BATCH_SIZE} 条自动分批，
            后面的批次会带上前面用过的主题名 —— 否则「尺寸偏小」和「尺寸比预期小」会各算一个，根本没法比。
          </p>

          <label className="gen-field" style={{ marginTop: 10 }}>
            <span>商品背景（选填，帮模型归类更准）</span>
            <input className="gen-input" value={context} placeholder="如：32oz 保温水杯，主打健身通勤"
              onChange={(e) => setContext(e.target.value)} />
          </label>
          <p className="fact-note">
            评论来自你自己：从商品档案的口碑样本里取、从后台导出 CSV 上传，或用浏览器扩展在你打开的商品页采集。<b>服务器不抓取任何页面</b>。手工上传的评论会存进当前商品档案，下次可直接取用。模型只负责给每条贴主题、引原文；
            <b>频次、占比、评分影响全部由系统按实际样本计算</b> —— 模型报的数字一概不采纳。
          </p>
        </div>

        {result?.warnings && result.warnings.length > 0 && (
          <div className="wb-block">
            <div className="section-heading"><span>样本体检</span><em>先看这里</em></div>
            <div className="cost-modules">
              {result.warnings.map((w) => (
                <div className={`conflict-item ${w.level}`} key={w.id}>
                  {w.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><MessageSquareText size={15} /> 主题洞察 {result && <AigcBadge compact />}</span>
            <em>{result ? `${result.profile.total} 条 · 均分 ${result.profile.avgRating}` : "待分析"}</em>
          </div>

          {partial && (
            <div className="wb-restored wb-resume">
              <span>
                上次分析到第 <b>{partial.done} / {partial.total}</b> 批就中断了。
                这些批次已经扣过积分 —— 接着跑不会重复收费。
              </span>
              <button onClick={() => void analyse(partial)}>接着跑完</button>
            </div>
          )}

          {restored && (
            <div className="wb-restored">
              <span>已恢复上次的分析结果 —— 跳走再回来不会丢。</span>
              <button onClick={discardDraft}>清空重来</button>
            </div>
          )}

          {/*
            结果一长,「映射建议」和「深度报告」的入口就被挤到很下面,
            而用户跳过去再回来又会丢结果 —— 两个问题叠在一起。
            结果出来就在顶部给两个锚点,不用滚到底去找。
          */}
          {result && (
            <div className="wb-jump">
              <a href="#wb-suggest">映射建议</a>
              <a href="#wb-report">深度报告</a>
            </div>
          )}

          {!result ? (
            <div className="wb-skel" aria-hidden="true">
              <p className="wb-skel-cap">取一批评论跑完之后,这里会长成这样 —— 每个主题给<b>频次、占比、评分影响与代表性原文</b>,而不是「用户主要抱怨质量」这类没法行动的结论:</p>
              {[62, 38, 24].map((w, i) => (
                <div className="wb-skel-row" key={i}>
                  <span className="wb-skel-t" style={{ width: `${90 - i * 18}px` }} />
                  <span className="wb-skel-bar"><i style={{ width: `${w}%` }} /></span>
                  <span className="wb-skel-n" />
                </div>
              ))}
              <div className="wb-skel-quote" />
            </div>
          ) : (
            <>
              {negatives.length > 0 && (
                <>
                  <div className="theme-group-head">问题主题 · {negatives.length} 个</div>
                  <div className="theme-list">{negatives.map((t) => <ThemeCard key={t.theme} t={t} />)}</div>
                </>
              )}
              {positives.length > 0 && (
                <>
                  <div className="theme-group-head">亮点主题 · {positives.length} 个</div>
                  <div className="theme-list">{positives.map((t) => <ThemeCard key={t.theme} t={t} />)}</div>
                </>
              )}
              {!result.themes.length && <div className="fact-empty">没有归出明确的主题 —— 样本里可能缺少具体反馈。</div>}

              {result.competitor && (
                <>
                  <div className="theme-group-head">
                    竞品对比 · 你 {result.profile.total} 条 vs 竞品 {result.competitor.profile.total} 条
                  </div>
                  {result.competitor.warnings.map((w) => (
                    <div className={`conflict-item ${w.level}`} key={w.id}>
                      {w.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
                      <span>{w.text}</span>
                    </div>
                  ))}
                  <div className="cmp-list">
                    {result.competitor.comparison
                      .filter((c) => c.sentiment === "negative")
                      .map((c) => <CompareRow key={c.theme} c={c} />)}
                  </div>
                  <p className="fact-note" style={{ marginBottom: 0 }}>
                    <b>我方独有</b>的问题才是真该改的；<b>品类通病</b>改了也不构成差异；
                    <b>对方独有</b>的弱点是可打的差异点 —— 但只有你事实库里<b>已确认</b>的事实才拿得出来打，
                    没确认的差异写进文案就是虚假宣传。
                  </p>
                </>
              )}
              <p className="fact-note">
                「对评分的影响」= 命中该主题的评论平均分 − 整体平均分，是<b>相关不是因果</b>：
                低分评论更愿意写具体问题，因此这个差值会放大。它用来排优先级，不能当成「改了就能涨多少分」。
              </p>

              <div className="section-heading mt-gap" id="wb-suggest">
                <span><ListChecks size={15} /> 改动建议</span>
                <em>{suggest?.suggestions?.length ? `${suggest.suggestions.length} 条` : "待映射"}</em>
              </div>
              <div className="fact-foot-actions">
                <button className="fill" onClick={mapChanges} disabled={mapping || !result.themes?.length}>
                  {mapping ? <><RefreshCw size={12} className="spin" /> 映射中…</> : <><ListChecks size={12} /> 映射成具体改动</>}
                </button>
              </div>

              {suggest?.issues?.map((i) => (
                <div className={`conflict-item ${i.level}`} key={i.id}>
                  {i.level === "warn" ? <AlertTriangle size={14} /> : <Info size={14} />}
                  <span>{i.text}</span>
                </div>
              ))}

              {suggest?.suggestions && (
                <>
                  <div className="sug-list">
                    {suggest.suggestions.map((m, i) => (
                      <div className={`sug-row is-${m.surface}`} key={i}>
                        <div className="sug-head">
                          <span className={`sug-surface ${m.surface}`}>{SURFACE_LABEL[m.surface]}</span>
                          <strong>{m.action}</strong>
                        </div>
                        <p>{m.rationale}</p>
                        <div className="sug-foot">
                          <small>针对「{m.theme}」· {m.count} 条 · {m.share}%{m.ratingDelta ? ` · 评分影响 ${m.ratingDelta}` : ""}</small>
                          {m.needsFacts.length > 0 && (
                            <em title="这条建议要写进 Listing 的事实还没确认">需先确认：{m.needsFacts.join("、")}</em>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="fact-note">
                    改产品要动模具和供应商，改内容只要改文案 —— <b>能靠说清楚解决的预期偏差，别去改产品</b>。
                    每条建议下方的数字来自<b>实际样本</b>，不是模型报的。
                  </p>
                </>
              )}
            </>
          )}
        </div>

        {/* 带上 date/variant:覆盖度(时间跨度、变体分布)要由代码如实算,
            否则模型只能凭空写「样本集中在近三个月」这类没有依据的口径声明。 */}
        {result && preview && !preview.missingText && preview.reviews.length >= 5 && (
          <div id="wb-report"><DeepReportCta
            context={context}
            mine={withIds(preview.reviews, MINE_PREFIX).map((r) => ({
              id: r.id, rating: r.rating || null, text: r.text, date: r.date, variant: r.variant,
            }))}
            theirs={withIds(rivalPreview?.reviews ?? [], THEIRS_PREFIX).map((r) => ({
              id: r.id, rating: r.rating || null, text: r.text, date: r.date, variant: r.variant,
            }))}
          /></div>
        )}
      </section>
    </div>
    {saveOpen && <SaveResultModal toolId="voice_theme" onConfirm={saveAnalysis} onClose={() => setSaveOpen(false)} />}
    </>
  );
}
