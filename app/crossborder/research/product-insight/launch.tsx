"use client";

/**
 * 商品口碑与需求洞察 —— 扫描与启动页(讨论稿 §八/§九落地)。
 *
 * 流程:输入商品名/链接(?from=product 时从当前商品档案预填)
 *   → 可研究性扫描(2 积分;游客计入日限量)
 *   → 展示识别结果,只问三个高价值问题(单品还是方向 / 站点 / 研究目标)
 *   → 研究预览(拟分析目录、资料可得性、缺什么)
 *   → 确认范围与消耗(预计积分/时间/数据限制/系统假设)后启动正式研究。
 * 红线:消耗前三确认(对象/目录/消耗)缺一不可;身份不确定只能按「商品方向」研究。
 */

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, GitCompare, Globe2, History, Loader2, Package,
  RefreshCw, ScanSearch, Telescope, Upload, X,
} from "lucide-react";
import { AI_ENABLED } from "../../../../lib/api";
import { SiteFooter, SiteHeader } from "../../../site-chrome";
import { LoginModal } from "../../../auth/login-modal";
import { MARKET_LABEL, isTikTokMarket } from "../../../../lib/crossborder/asin";
import { addRecord, currentProduct, defaultProductName, findOrCreateProduct, findProduct, isCloudEnabled, schedulePush } from "../../../../lib/crossborder/products";
import { deleteSavedScan, getSavedScanByKey, listResearch, listSavedScans, scanKey, scanResearch, startResearch, type DeriveInfo, type ScanInput } from "../../../../lib/crossborder/research/api";
import { parseReturnCsv, parseReviewCsv } from "../../../../lib/crossborder/review-insight";
import { SamplePicker, type PickedSample } from "../../sample-picker";
import { describeSample } from "../../../../lib/crossborder/review-samples";
import { useCurrentProduct } from "../../../../lib/crossborder/use-product-context";
import { crossBorderConsented, recordCrossBorderConsent, CROSS_BORDER_RECIPIENTS } from "../../../../lib/legal/cross-border";
import { candidateModules, moduleById } from "../../../../lib/crossborder/research/modules";
import { estimateRun, estimateRival, quoteCredits } from "../../../../lib/crossborder/research/estimate";
import { RESEARCH_PRODUCTS, STATUS_LABEL } from "../../../../lib/crossborder/registry";
import {
  GOAL_LABEL, INTENT_LABEL, type ResearchGoal, type ResearchIntent, type ResearchMode,
  type ResearchRunListItem, type ResearchScope, type ScanResult,
} from "../../../../lib/crossborder/research/types";

/** 「接着跑」的复用阶梯:同档=补资料;向上跨档=升档。低于现档不算干净复用,不提供。 */
const REUSE_LADDER: Record<string, ResearchIntent[]> = {
  market_entry: ["rival_compare", "full"],
  product_optimization: ["rival_compare", "full"],   // 优化现有商品归入需求洞察档
  rival_compare: ["full"],
  full: [],
};

// 扫描结果本地缓存:付费结果,持久化到 localStorage(关标签页也不丢),24h 后过期
// (口碑会变,别拿太旧的当准)。中途退出返回、误点重扫、切档切回都从这里秒复用、不重扫。
const SCAN_TTL_MS = 24 * 3600 * 1000;
function readScanCache(key: string): ScanResult | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { r, exp } = JSON.parse(raw) as { r: ScanResult; exp: number };
    if (!exp || Date.now() > exp) { localStorage.removeItem(key); return null; }
    return r;
  } catch { try { localStorage.removeItem(key); } catch { /* ignore */ } return null; }
}
function writeScanCache(key: string, r: ScanResult) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify({ r, exp: Date.now() + SCAN_TTL_MS })); }
  catch { /* 配额满忽略 */ }
}

/** 已保存扫描条目:本地枚举的带完整 result,服务端摘要的只有 key/名。 */
type RecentScan = { scanKey: string; productName: string; query: string; result?: ScanResult };

/** 枚举本地缓存里所有未过期的扫描结果(含游客;xm:scan:<key>)。 */
function localRecentScans(): RecentScan[] {
  if (typeof localStorage === "undefined") return [];
  const out: RecentScan[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("xm:scan:")) continue;
    const r = readScanCache(k);   // 过期的会被清掉并返回 null
    if (!r) continue;
    out.push({
      scanKey: k.slice("xm:scan:".length),
      productName: r.identity?.name || r.suggestedScope?.query || "已保存扫描",
      query: r.suggestedScope?.query || r.identity?.name || "",
      result: r,
    });
  }
  return out;
}

/** 研究目标(与档位正交):三档(需求洞察/竞品对比/综合)都能选,决定分析框架的倾向。 */
const GOAL_ORDER: ResearchGoal[] = ["new_entry", "optimize"];
const RIVAL_MIN = 2;

/** 从顿号/逗号/换行拆竞品清单。 */
function parseRivals(text: string): string[] {
  return text.split(/[,,、;;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
}

/** 研究产品 id ↔ intent(页内类型切换用;综合研究规划中,无 intent)。 */
const PRODUCT_INTENT: Record<string, ResearchIntent> = {
  "product-insight": "market_entry",
  "product-vs-rivals": "rival_compare",
  "product-full": "full",
};

const ROUGH_LABEL: Record<string, string> = { rich: "充足", some: "有一些", scarce: "很少" };

/** assumed 字段名 → 报告与界面上的人话。 */
const ASSUMED_LABEL: Record<string, string> = {
  marketplace: "平台与地区(默认亚马逊美国)",
  months: "时间范围(近 24 个月)",
  intent: "研究档位(需求洞察)",
  mode: "研究对象(商品方向)",
};

type Seed = {
  productName?: string;
  asin?: string | null;
  marketplace?: string;
  rivals?: string[];
};

export function InsightLaunch() {
  const [hydrated, setHydrated] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [err, setErr] = useState("");
  // 三个高价值问题的答案(以扫描建议为初值,用户可改)
  const [mode, setMode] = useState<ResearchMode>("direction");
  const [marketplace, setMarketplace] = useState("amazon-us");
  // 研究档位:从 URL ?intent= 初始化(落地页竞品对比卡带过来),可在页内 tab 切换。
  const [intent, setIntent] = useState<ResearchIntent>("market_entry");
  // 研究目标(与档位正交):新品进入验证 / 优化现有商品,三档都能选;从 URL ?goal= 初始化。
  const [goal, setGoal] = useState<ResearchGoal>("new_entry");
  const [rivalsText, setRivalsText] = useState("");
  const [notes, setNotes] = useState("");
  // 用户自有数据(P2):评论/退货 CSV 解析后的结构化行,随发起请求直传后端,
  // gather 阶段由代码拼装成多条可引用的 user_upload 证据(不再压成 notes 摘要)。
  const [userReviews, setUserReviews] = useState<Array<{ rating: number; date?: string; variant?: string; text: string }>>([]);
  /** 样本溯源。手工上传的为空(那是用户自己的完整数据);从档案取的要如实标注采样条件。 */
  const [sampleNote, setSampleNote] = useState("");
  // 当前商品:样本选择器要按它去查档案里有哪些口碑样本
  const product = useCurrentProduct();
  const [userReturns, setUserReturns] = useState<Array<{ date?: string; variant?: string; reason: string; qty: number }>>([]);
  const [csvInfo, setCsvInfo] = useState("");         // 评论 CSV:文件名 + 条数,给用户看
  const [returnInfo, setReturnInfo] = useState("");   // 退货 CSV:文件名 + 条数
  const [starting, setStarting] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [xbConsent, setXbConsent] = useState(false);   // 出境单独同意弹窗
  const [ackLowYield, setAckLowYield] = useState(false);   // 可研究性低时,需勾选确认才放行
  // 口径 A:同名+同市场+同 ASIN 已有报告时,发起前给「查看/接着跑/另起」岔口,
  // 别让用户「以为覆盖了其实又开一份」,接着跑还能复用旧证据省积分。
  const [myRuns, setMyRuns] = useState<ResearchRunListItem[]>([]);
  const [continueMode, setContinueMode] = useState(false);   // 用户是否选了「接着上一份跑」
  // 尽量拦截:进行中扫描的 AbortController,组件卸载(SPA 内切走)时中止,少发一次白花请求。
  const scanAbort = useRef<AbortController | null>(null);
  useEffect(() => () => scanAbort.current?.abort(), []);

  useEffect(() => {
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const wantIntent = params.get("intent");
    if (wantIntent === "rival_compare") setIntent("rival_compare");
    else if (wantIntent === "full") setIntent("full");
    if (params.get("goal") === "optimize") setGoal("optimize");
    // 上下文入口:从商品档案预填,少打一遍字,竞品也一起带上。
    if (params.get("from") === "product") {
      const p = currentProduct();
      if (p && (p.name.trim() || p.asin)) {
        const s: Seed = {
          productName: p.name.trim() || undefined,
          asin: p.asin ?? null,
          marketplace: p.marketplace || undefined,
          rivals: (p.rivals || []).map((r) => r.name).filter(Boolean).slice(0, 3),
        };
        setSeed(s);
        setQuery(p.name.trim() || p.asin || "");
        if (s.marketplace && MARKET_LABEL[s.marketplace]) setMarketplace(s.marketplace);
        setRivalsText((s.rivals || []).join("、"));
      }
    }
  }, []);

  // 扫描入参 = 商品身份扫描,与档位/竞品无关(档位、竞品、目标都是扫描后叠加的)。
  // key 只认商品身份,所以这里不带 intent/rivals —— 一次扫描三档共用。
  function buildScanInput(): ScanInput {
    return {
      query: query.trim(),
      seed: seed ? { productName: seed.productName, asin: seed.asin, marketplace: seed.marketplace } : undefined,
    };
  }

  // 页内切研究档位:只换档位 + URL。扫描结果是商品身份级的,三档共用,切档不清 ——
  // 模块与预估按新档位在客户端即时重算(见 effModuleIds / effEstimate)。
  function switchType(pid: string) {
    const it = PRODUCT_INTENT[pid];
    if (!it || it === intent) return;
    setIntent(it); setErr("");
    const url = new URL(window.location.href);
    if (it === "market_entry") url.searchParams.delete("intent");
    else url.searchParams.set("intent", it);
    window.history.replaceState(null, "", url.toString());
  }

  // 扫描结果落地:setScan + 同步范围默认值。缓存命中与 API 成功共用,避免重复。
  function applyScan(r: ScanResult) {
    setScan(r);
    setAckLowYield(false);   // 新扫描重置「低可研究性」确认,别沿用上一次的勾选
    setMode(r.suggestedScope.mode);
    if (MARKET_LABEL[r.suggestedScope.marketplace]) setMarketplace(r.suggestedScope.marketplace);
    if (r.suggestedScope.rivals.length && !rivalsText) setRivalsText(r.suggestedScope.rivals.join("、"));
  }

  // 已保存的扫描(付费产物)—— 不依赖当前输入框,进页面就常驻展示为 chips,一键打开、
  // 三档通用。双源:本地 localStorage 枚举(秒出、含游客)+ 服务端列表(跨设备),按 key 去重。
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  async function refreshRecentScans() {
    const local = localRecentScans();
    const byKey = new Map<string, RecentScan>();
    for (const s of await listSavedScans()) {
      byKey.set(s.scanKey, { scanKey: s.scanKey, productName: s.productName, query: s.query });
    }
    for (const l of local) byKey.set(l.scanKey, l);   // 本地有完整结果,覆盖服务端摘要
    setRecentScans([...byKey.values()].slice(0, 12));
  }
  useEffect(() => { refreshRecentScans(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  // 删一份已保存的扫描:本地缓存 + 服务端都清掉,再刷新 chips。
  async function delScan(rs: RecentScan) {
    if (!window.confirm(`删除已保存的扫描「${rs.productName}」?`)) return;
    try { window.localStorage.removeItem("xm:scan:" + rs.scanKey); } catch { /* ignore */ }
    setRecentScans((xs) => xs.filter((x) => x.scanKey !== rs.scanKey));
    try { await deleteSavedScan(rs.scanKey); } catch { /* 本地已移除,服务端失败静默 */ }
  }

  // 点已保存 chip:本地有完整结果直接用,否则按 key 拉服务端;回填本地并落地。
  async function openSaved(rs: RecentScan) {
    setErr("");
    const r = rs.result ?? await getSavedScanByKey(rs.scanKey);
    if (!r) { setErr("这份已保存的扫描已过期或不可用,重新扫描一次即可。"); return; }
    setQuery(rs.query || r.identity.name);
    writeScanCache("xm:scan:" + rs.scanKey, r);
    applyScan(r);
  }

  async function runScan(force = false) {
    const q = query.trim();
    if (!q || scanning) return;
    // 出境单独同意:检索词会发往境外服务商,首次前需明示同意。
    if (!crossBorderConsented()) { setXbConsent(true); return; }
    const scanInput = buildScanInput();
    // 结果缓存:同一次扫描退出后返回、误点重扫,直接复用,不重打 API、不重扣分。
    // force=true(用户在「已保存」卡片上主动点了「重新扫描」)时跳过,真打一次。
    const cacheKey = "xm:scan:" + scanKey(scanInput);
    const cached = force ? null : readScanCache(cacheKey);
    if (cached) { applyScan(cached); setErr(""); return; }
    setScanning(true); setErr(""); setScan(null);
    scanAbort.current?.abort();
    const ctrl = new AbortController();
    scanAbort.current = ctrl;
    try {
      const r = await scanResearch(scanInput, ctrl.signal);
      applyScan(r);
      writeScanCache(cacheKey, r);
      refreshRecentScans();   // 新扫描进「已保存」列表
    } catch (e) {
      if (ctrl.signal.aborted) return;   // 主动中止(卸载/重扫覆盖):不报错、不改状态
      setErr(e instanceof Error ? e.message : "扫描失败,请稍后再试。");
    } finally {
      if (scanAbort.current === ctrl) { scanAbort.current = null; setScanning(false); }
    }
  }

  const scope: ResearchScope | null = useMemo(() => {
    if (!scan) return null;
    const s = scan.suggestedScope;
    // 用户答过的问题从 assumed 里摘掉 —— 剩下的默认值必须写进报告。
    const assumed = s.assumed.filter((k) =>
      !(k === "mode" || k === "marketplace" || k === "intent"));
    return {
      ...s,
      mode,
      marketplace,
      intent,
      goal,
      rivals: parseRivals(rivalsText),
      notes: notes.trim() || undefined,
      assumed,
    };
  }, [scan, mode, marketplace, intent, goal, rivalsText, notes]);

  // 切研究目标(新品进入验证/优化现有商品):同步 URL,不影响已扫描结果(goal 不改扫描形状)。
  function setGoalAndUrl(g: ResearchGoal) {
    setGoal(g);
    const url = new URL(window.location.href);
    if (g === "new_entry") url.searchParams.delete("goal");
    else url.searchParams.set("goal", g);
    window.history.replaceState(null, "", url.toString());
  }

  // 拉一次自己的已完成报告(带 productRef),用于「同商品已有报告」匹配。未登录/失败静默。
  useEffect(() => {
    listResearch()
      .then((rs) => setMyRuns(rs.filter((r) => r.status === "done" && r.productRef)))
      .catch(() => { /* 未登录时不探测,不打扰 */ });
  }, []);

  // 同商品(同名+同市场+同 ASIN,即同一商品档案)名下的已完成报告,最近的在前。
  const sameProduct = useMemo(() => {
    if (!scope) return [] as ResearchRunListItem[];
    const prod = findProduct({ name: scope.productName, marketplace: scope.marketplace, asin: scope.asin });
    if (!prod) return [] as ResearchRunListItem[];
    return myRuns.filter((r) => r.productRef === prod.stableId);
  }, [scope, myRuns]);

  // 「接着最近一份跑」能落哪种复用关系:同档→补资料;跨档向上→升档;否则不提供(只查看/另起)。
  const continueChoice = useMemo<DeriveInfo | null>(() => {
    const latest = sameProduct[0];
    if (!latest) return null;
    if (intent === latest.intent) return { originRunId: latest.runId, relation: "rerun_supplement" };
    if ((REUSE_LADDER[latest.intent] || []).includes(intent)) return { originRunId: latest.runId, relation: "upgrade_tier" };
    return null;
  }, [sameProduct, intent]);
  // 新扫一个商品就清掉上一次的「接着跑」选择,避免跨商品串味。
  useEffect(() => { setContinueMode(false); }, [scan]);
  const derive = continueMode ? continueChoice : null;

  /**
   * 从商品档案取评论样本。
   *
   * 与上传 CSV 走同一个出口(userReviews),但**必须带上溯源** ——
   * 研究报告要在来源附录里标注每条证据的出处,而「你从后台导出的完整数据」
   * 与「浏览器采的十几条精选评论」在可信度上差着量级。
   * 不标清楚的话,报告会拿一份偏样本得出的占比当结论。
   */
  function onPickSample(picked: PickedSample) {
    const { reviews, missingText } = parseReviewCsv(picked.csv);
    if (missingText || reviews.length === 0) {
      setCsvInfo("这批样本没有可用的评论正文"); return;
    }
    setUserReviews(reviews.slice(0, 200).map((r) => ({
      rating: r.rating, date: r.date || undefined, variant: r.variant || undefined,
      text: r.text.slice(0, 500),
    })));
    setCsvInfo(`档案样本 · ${reviews.length} 条${reviews.length > 200 ? "(取前 200 条)" : ""} · ${picked.from}`);
    setSampleNote(describeSample(picked.meta));
  }

  async function onCsvUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";   // 允许重复选同一文件
    if (!file) return;
    try {
      const { reviews, missingText } = parseReviewCsv(await file.text());
      if (missingText || reviews.length === 0) {
        setUserReviews([]); setCsvInfo("没读到评论 —— CSV 需含 text / review 列"); return;
      }
      // 结构化直传(后端上限 200 条、单条 500 字,这里对齐,不再压成摘要文本)
      setUserReviews(reviews.slice(0, 200).map((r) => ({
        rating: r.rating, date: r.date || undefined, variant: r.variant || undefined,
        text: r.text.slice(0, 500),
      })));
      setCsvInfo(`${file.name} · 读入 ${reviews.length} 条评论${reviews.length > 200 ? "(取前 200 条)" : ""}`);
    } catch {
      setUserReviews([]); setCsvInfo("读取失败,请确认是 CSV 文件");
    }
  }

  async function onReturnCsvUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { returns, missingReason } = parseReturnCsv(await file.text());
      if (missingReason || returns.length === 0) {
        setUserReturns([]); setReturnInfo("没读到退货记录 —— CSV 需含 reason/退货原因 列"); return;
      }
      setUserReturns(returns.slice(0, 200).map((r) => ({
        date: r.date || undefined, variant: r.variant || undefined, reason: r.reason, qty: r.qty,
      })));
      setReturnInfo(`${file.name} · 读入 ${returns.length} 条退货记录${returns.length > 200 ? "(取前 200 条)" : ""}`);
    } catch {
      setUserReturns([]); setReturnInfo("读取失败,请确认是 CSV 文件");
    }
  }

  const isRival = intent === "rival_compare";
  const isFull = intent === "full";
  const rivalsArr = parseRivals(rivalsText);
  const rivalsShort = isRival && rivalsArr.length < RIVAL_MIN;
  // 可研究性低:扫描没搜到任何「充足/有一些」的公开资料(全 scarce 或为空)—— 多半是虚构或
  // 太生僻的商品名,正式研究很可能采集不到有效证据、白跑一趟。软拦截:醒目提示 + 需勾选确认
  // 才放行(不硬堵 —— 真·冷门但存在的商品仍可在用户知情后继续)。
  const lowYield = !!scan && (scan.availability.length === 0 || scan.availability.every((a) => a.rough === "scarce"));

  // 扫描是商品身份级、三档共用;拟分析模块与预估按「当前档位 + 竞品数」在客户端重算
  // (candidateModules + estimate 与服务端同源),这样切档位不必重扫,预估仍准确。
  const effModuleIds = useMemo<string[]>(() => {
    if (!scan) return [];
    return candidateModules(intent, scan.identity.category, goal).filter((m) => m !== "external_events");
  }, [scan, intent, goal]);
  const effEstimate = useMemo(() => {
    if (!scan) return null;
    return isRival ? estimateRival(1 + rivalsArr.length) : estimateRun(effModuleIds.length);
  }, [scan, isRival, rivalsArr.length, effModuleIds.length]);

  async function start() {
    if (!scope || !scan || starting) return;
    // 竞品对比硬门槛:核心产物是差异矩阵,矩阵至少要两列 —— 缺竞品不假装能对比。
    if (isRival && rivalsArr.length < RIVAL_MIN) {
      setErr(`竞品对比至少需要 ${RIVAL_MIN} 个对手 —— 请在下方补充竞品;或把研究档位切回「需求洞察」。`);
      return;
    }
    setStarting(true); setErr("");
    try {
      // 先落商品档案(按 ASIN/名 + 市场组合键),拿 stableId 绑给报告 —— 改名/换设备不断链。
      // 从商品档案进来的挂当前商品;直接输入对象名启动的按组合键 find-or-create 建档。
      const p = seed
        ? currentProduct()
        : findOrCreateProduct({ name: scope.productName || defaultProductName("research"), marketplace: scope.marketplace, asin: scope.asin });
      // 选了「接着跑」则带派生关系:进同一条版本链、复用旧证据(补资料/升档)。
      const run = await startResearch(
        p ? { ...scope, productRef: p.stableId } : scope, effModuleIds, derive ?? undefined,
        { reviews: userReviews, returns: userReturns });
      // 归档:研究报告挂到商品档案名下(records tool=research),形成复购闭环、可溯源。
      if (p) {
        addRecord(p.id, {
          tool: "research",
          label: `${isRival ? "竞品对比" : isFull ? "综合研究" : "口碑与需求洞察"} · ${GOAL_LABEL[goal]} · ${scope.productName}`,
          values: { runId: run.runId, intent: scope.intent, goal },
        });
        if (isCloudEnabled()) schedulePush();
      }
      window.location.href = `/crossborder/research/report/?id=${encodeURIComponent(run.runId)}`;
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 401) { setNeedLogin(true); setErr("正式研究的报告存在账号里 —— 请先登录。"); }
      else setErr(e instanceof Error ? e.message : "启动失败,请稍后再试。");
    } finally {
      setStarting(false);
    }
  }

  const modules = effModuleIds.map((m) => moduleById(m)).filter((m) => !!m);

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <SiteHeader active="crossborder" />
      <section className="tool-page rsp-page">
        <a className="tool-breadcrumb" href="/crossborder/research/"><ArrowLeft size={13} /> 深度研究</a>

        {/* 页内类型切换:口碑洞察 / 竞品对比 / 综合研究(规划中禁用)—— 与样例页对称 */}
        <div className="pi-type-toggle" role="tablist" aria-label="研究类型">
          {RESEARCH_PRODUCTS.map((r) => {
            const it = PRODUCT_INTENT[r.id];
            const active = !!it && it === intent;
            const usable = r.status === "available" && !!it;
            return (
              <button key={r.id} role="tab" aria-selected={active}
                className={`${active ? "on" : ""}${usable ? "" : " disabled"}`}
                disabled={!usable} title={usable ? undefined : STATUS_LABEL[r.status]}
                onClick={() => usable && switchType(r.id)}>
                {r.name}{!usable && ` · ${STATUS_LABEL[r.status]}`}
              </button>
            );
          })}
        </div>

        <div className="rsp-hero">
          <h1><Telescope size={26} strokeWidth={1.8} /> {isRival ? "商品与竞品对比" : isFull ? "商品综合研究" : "商品口碑与需求洞察"}</h1>
          <p>
            {isRival
              ? <>输入你的商品与<b>至少 {RIVAL_MIN} 个竞品</b>,先<b>扫描</b>,再生成一份公开口碑与定位的<b>差异矩阵</b> —— 定性对比,不是参数横评或实时比价。</>
              : isFull
                ? <>输入一个商品,先<b>扫描</b>,再生成一份从需求、口碑到竞品与风险的<b>全景报告</b>,顶部一页决策摘要给去/留/改倾向 —— 竞品选填,不替你下终判。</>
                : <>输入商品名称或链接,先<b>扫描</b>:确认商品身份、能搜到哪些公开资料、报告会分析什么、大概花多少 —— 你确认了,正式研究才开始。</>}
          </p>
        </div>

        {hydrated && seed && (
          <div className="pi-seed">
            <Package size={14} />
            <span>已带入商品档案:<b>{seed.productName || seed.asin}</b>{seed.asin ? ` · ${seed.asin}` : ""}{seed.marketplace && MARKET_LABEL[seed.marketplace] ? ` · ${MARKET_LABEL[seed.marketplace]}` : ""}{seed.rivals?.length ? ` · 竞品 ${seed.rivals.length} 个` : ""}</span>
          </div>
        )}

        {/* 一次扫描只认商品身份;档位/竞品/目标都在扫描后叠加,所以扫描入口始终只要商品名。 */}
        <div className="pi-input">
          <ScanSearch size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runScan(); }}
            placeholder="商品名称或链接,如:挂脖风扇 / neck fan"
            aria-label="要研究的商品名称或链接"
          />
          <button type="button" className="pi-scan-btn" onClick={() => runScan()} disabled={!AI_ENABLED || scanning || !query.trim()}>
            {scanning ? <><Loader2 size={14} className="spin" /> 扫描中…</> : AI_ENABLED ? "扫描" : "即将上线"}
          </button>
        </div>
        <p className="pi-note">
          扫描消耗 2 积分(游客计入每日积分额度)。<b>扫描结果会自动保存,随时回来免费继续使用</b> —— 换研究目标、加竞品、补资料都在这份结果上接着做,不必重扫。不抓取平台商品页,只检索公开网络资料。
        </p>
        <p className="pi-privacy-hint">🔒 商品名/检索词会发往境外检索服务商用于联网检索;<b>请勿在此填写个人信息、账号口令或涉密内容</b>。</p>

        {/* 已保存的扫描:进页面就常驻,不依赖输入框;点一个即打开,三档通用、不重扣积分。 */}
        {!scan && recentScans.length > 0 && (
          <div className="pi-saved">
            <History size={15} />
            <div className="pi-saved-list">
              <b>已保存的扫描:</b>
              <div className="pi-saved-chips">
                {recentScans.map((rs) => (
                  <span key={rs.scanKey} className="pi-saved-chip">
                    <button type="button" className="pi-saved-chip-open" onClick={() => openSaved(rs)} title="打开这份已保存的扫描结果">
                      <ScanSearch size={12} /> {rs.productName}
                    </button>
                    <button type="button" className="pi-saved-chip-del" onClick={() => delScan(rs)} title="删除这份扫描" aria-label="删除">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {err && <div className="tool-error"><AlertTriangle size={15} /><span>{err}</span></div>}

        {scan && (
          <>
            {/* 识别结果:竞品对比时我方 + 每个竞品都要确认身份 */}
            <div className="wb-block">
              <div className="section-heading"><span>识别结果</span><em>{isRival ? "逐个确认主体,别对错商品" : "先确认对象,别研究错商品"}</em></div>
              <div className="pi-identity">
                <b>{isRival ? "我方:" : ""}{scan.identity.name}</b>
                {scan.identity.aliases.length > 0 && <p className="pi-alias">{scan.identity.aliases.join(" · ")}</p>}
                {!scan.identity.confident && (
                  <div className="pi-warn"><AlertTriangle size={13} /> 商品身份还不够确定 —— {isRival ? "对比结果可能对错对象,建议换更明确的名称/链接。" : "本次只能按「商品方向」研究,报告会明确标注。"}</div>
                )}
                {scan.identity.ambiguous.length > 0 && (
                  <p className="pi-ambiguous">已注意区分:{scan.identity.ambiguous.join(";")}</p>
                )}
              </div>
              {isRival && scan.rivalIdentities && scan.rivalIdentities.length > 0 && (
                <div className="pi-rivals-id">
                  {scan.rivalIdentities.map((ri) => (
                    <div key={ri.input} className={`pi-rid${ri.confident ? "" : " weak"}`}>
                      {ri.confident ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                      <div>
                        <b>{ri.name}</b>
                        {ri.name !== ri.input && <em> ← {ri.input}</em>}
                        {!ri.confident && <span className="pi-rid-note">身份不确定,可能对错对象</span>}
                        {ri.ambiguous.length > 0 && <span className="pi-rid-note">区分:{ri.ambiguous.join(";")}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 三个高价值问题 */}
            <div className="wb-block">
              <div className="section-heading"><span>三个问题,把范围定准</span><em>答案会直接写进报告的研究范围</em></div>
              <div className="pi-q">
                <label>研究单个商品,还是整个商品方向?</label>
                <div className="pi-opts">
                  <button type="button" className={mode === "direction" ? "on" : ""} onClick={() => setMode("direction")}>商品方向</button>
                  <button
                    type="button"
                    className={mode === "single" ? "on" : ""}
                    disabled={!scan.identity.confident && !seed?.asin}
                    title={!scan.identity.confident && !seed?.asin ? "需要明确的商品链接 / ASIN 才能研究单个商品" : undefined}
                    onClick={() => setMode("single")}
                  >单个商品</button>
                </div>
              </div>
              <div className="pi-q">
                <label>主要销售国家和平台?</label>
                <select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                  {Object.entries(MARKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {isTikTokMarket(marketplace) && (
                  <p className="pi-fine" style={{ margin: "6px 2px 0", color: "#c17d14" }}>
                    <AlertTriangle size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                    选 TikTok Shop 会额外接入平台的<b>真实商品评价</b>(第三方接口,已去除评价者个人身份、剔除被激励评论);公开网络对 TikTok 覆盖仍弱、平台数据为采样非全量 —— 报告如实标注,建议结合你后台数据交叉印证。
                  </p>
                )}
              </div>
              {/* 研究目标(与档位正交):三档都能选,决定分析框架是「要不要进」还是「怎么优化」。 */}
              <div className="pi-q">
                <label>研究目标</label>
                <div className="pi-opts">
                  {GOAL_ORDER.map((g) => (
                    <button key={g} type="button" className={goal === g ? "on" : ""} onClick={() => setGoalAndUrl(g)}>
                      {GOAL_LABEL[g]}
                    </button>
                  ))}
                </div>
              </div>
              {/* 竞品在扫描结果上叠加:竞品对比必填 ≥2,综合选填,需求洞察也可选填。 */}
              <div className="pi-q">
                <label>{isRival ? `竞品(必填,≥${RIVAL_MIN} 个,最多 5 个)` : "竞品(选填,最多 5 个,名称或链接)"}</label>
                <input value={rivalsText} onChange={(e) => setRivalsText(e.target.value)}
                  placeholder={isRival ? "如:Torras Coolify、JISULIFE" : "用顿号或逗号分隔"} />
                {isRival && rivalsShort && (
                  <small style={{ color: "#c17d14" }}>竞品对比至少需要 {RIVAL_MIN} 个竞品(当前 {rivalsArr.length} 个)。</small>
                )}
                {isFull && <small style={{ color: "#8a95a1" }}>补 ≥{RIVAL_MIN} 个竞品可让「竞品格局」章更扎实;不填也给轻量格局。</small>}
              </div>
              <div className="pi-q">
                <label>补充资料(选填:报价要点、已知差评、说明书摘录…)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="粘贴文字即可,会作为研究资料并在来源附录单独标注" />
                <div className="pi-csv-row">
                  <SamplePicker product={product} mode="mine" onPick={onPickSample} />
                  <label className="pi-csv pi-csv-inline">
                    <input type="file" accept=".csv,text/csv" onChange={onCsvUpload} hidden />
                    <span className="pi-csv-btn"><Upload size={13} /> 上传评论 CSV</span>
                  </label>
                </div>
                {csvInfo
                  ? (
                    <div className="pi-csv-state">
                      <span className="pi-csv-info">
                        {csvInfo}
                        {userReviews.length > 0 && (
                          <button type="button" className="pi-csv-clear"
                            onClick={() => { setUserReviews([]); setCsvInfo(""); setSampleNote(""); }}>清除</button>
                        )}
                      </span>
                      {/* 溯源必须跟着样本走:研究报告要在来源附录标注证据出处,
                          而「后台导出的完整数据」与「浏览器采的十几条精选」差着量级 */}
                      {sampleNote && <span className="pi-csv-prov">{sampleNote}</span>}
                    </div>
                  )
                  : <span className="pi-csv-hint">从商品档案取,或上传含 text/评论 列的 CSV —— 逐条作为「用户提供的资料」证据进研究</span>}
                <label className="pi-csv">
                  <input type="file" accept=".csv,text/csv" onChange={onReturnCsvUpload} hidden />
                  <span className="pi-csv-btn"><Upload size={13} /> 上传退货 CSV</span>
                  {returnInfo
                    ? <span className="pi-csv-info">{returnInfo}{userReturns.length > 0 && <button type="button" className="pi-csv-clear" onClick={() => { setUserReturns([]); setReturnInfo(""); }}>清除</button>}</span>
                    : <span className="pi-csv-hint">含 reason/退货原因 列 —— 原因分布会进报告并可追溯</span>}
                </label>
              </div>
            </div>

            {/* 研究预览 */}
            <div className="wb-block">
              <div className="section-heading"><span>研究预览</span><em>拟分析内容与资料基础</em></div>
              <div className="pi-preview">
                <div>
                  <b>拟分析目录</b>
                  <ul className="pi-modules">
                    {modules.map((m) => <li key={m.module}><CheckCircle2 size={13} /> {m.title}</li>)}
                  </ul>
                  <p className="pi-fine">最终目录按实际搜到的证据二次规划,证据不足的章节会降级或省略。</p>
                </div>
                <div>
                  <b>资料可得性(基于本次扫描)</b>
                  <ul className="pi-avail">
                    {scan.availability.map((a, i) => (
                      <li key={i}><em className={`is-${a.rough}`}>{ROUGH_LABEL[a.rough] ?? a.rough}</em><span>{a.note}</span></li>
                    ))}
                  </ul>
                  {scan.hotspots.length > 0 && <p className="pi-fine">讨论集中在:{scan.hotspots.slice(0, 4).join(";")}</p>}
                </div>
              </div>
            </div>

            {/* 确认范围与消耗 */}
            <div className="wb-block pi-confirm">
              <div className="section-heading"><span>确认范围与消耗</span><em>确认后才开始消耗积分</em></div>

              {/* 口径 A:同商品已有报告 —— 发起前的岔口,避免重复花积分开重份 */}
              {sameProduct.length > 0 && (
                <div className="pi-same">
                  <div className="pi-same-head">
                    <History size={15} />
                    <span>这个商品你已有 <b>{sameProduct.length}</b> 份报告 —— 别重复开,先看看要不要接着上一份跑。</span>
                    <a className="pi-same-view" href={`/crossborder/research/report/?id=${encodeURIComponent(sameProduct[0].runId)}`}>
                      查看最近一份({INTENT_LABEL[sameProduct[0].intent]}) →
                    </a>
                  </div>
                  {continueChoice ? (
                    <div className="pi-same-opts">
                      <button type="button" className={continueMode ? "on" : ""} onClick={() => setContinueMode(true)}>
                        <GitCompare size={13} />
                        接着最近一份跑
                        <em>{continueChoice.relation === "upgrade_tier" ? "升档 · 复用已抓资料更省" : "补资料 · 复用已抓资料更省"}</em>
                      </button>
                      <button type="button" className={continueMode ? "" : "on"} onClick={() => setContinueMode(false)}>
                        <Package size={13} />
                        另起一份新报告
                        <em>全新采集 · 与旧报告并列在同一商品下</em>
                      </button>
                    </div>
                  ) : (
                    <p className="pi-fine" style={{ margin: "6px 2px 0" }}>
                      当前研究目标无法在旧报告上增量续跑,将<b>另起一份</b>新报告,仍归到同一商品名下。
                    </p>
                  )}
                </div>
              )}

              <div className="pi-cost">
                {/* 预估积分上限 = 后端冻结报价(quoteCredits,与报告页 quote 同口径);实扣按用量,通常明显更低。 */}
                <div><b>≤ {quoteCredits(intent, rivalsArr.length)} 积分</b><span>预估积分上限</span></div>
                <div><b>{effEstimate?.searches ?? "—"}</b><span>预计搜索次数</span></div>
                <div><b>≈ {effEstimate?.minutes ?? "—"} 分钟</b><span>预计生成时间</span></div>
              </div>
              {isRival && <p className="pi-fine">预估按 {1 + rivalsArr.length} 个主体算(我方 + {rivalsArr.length} 竞品),竞品越多消耗越高。</p>}
              <div className="pi-limits">
                <b>先说清限制:</b>
                <ul>
                  {scan.missing.slice(0, 4).map((m) => <li key={m}>{m}</li>)}
                  {isRival
                    ? <li>定性口碑与定位对比 —— 不做逐参数功能横评、不比实时价格、不含销量份额;公开资料不足的对比格子会留空。</li>
                    : isTikTokMarket(marketplace)
                      ? <li>TikTok Shop 商品评价经第三方接口<b>采样</b>补入(已去评价者身份、剔除被激励评论),非全量,负面占比不可外推。</li>
                      : <li>报告是公开资料洞察,非全量评论分析 —— 不含平台完整评论样本。</li>}
                </ul>
              </div>
              {scope && scope.assumed.length > 0 && (
                <p className="pi-fine">
                  仍按系统默认的范围:{scope.assumed.map((k) => ASSUMED_LABEL[k] ?? k).join("、")} —— 会在报告中标注为系统假设。
                </p>
              )}
              {lowYield && (
                <div className="pi-lowyield">
                  <AlertTriangle size={15} />
                  <div>
                    <b>这个商品几乎搜不到公开资料</b>
                    <p>本次扫描没找到充足的评论、媒体或论坛讨论 —— 多半是商品名太生僻、拼写不一致,或还没什么公开口碑。此时正式研究很可能采集不到有效证据、白花积分。建议先换用更通用的<b>品类词 / 商品英文名</b>重新扫描,或补一份评论 / 资料再启动。</p>
                    <label className="pi-lowyield-ack">
                      <input type="checkbox" checked={ackLowYield} onChange={(e) => setAckLowYield(e.target.checked)} />
                      我知道资料很少、研究可能采集不到有效证据,仍要启动
                    </label>
                  </div>
                </div>
              )}
              <div className="fact-foot-actions">
                <button className="fill" onClick={start} disabled={starting || rivalsShort || (lowYield && !ackLowYield)}
                  title={rivalsShort ? `竞品对比至少需要 ${RIVAL_MIN} 个对手`
                    : (lowYield && !ackLowYield) ? "公开资料很少 —— 请先确认知情,或换更通用的商品名重新扫描" : undefined}>
                  {starting
                    ? <><RefreshCw size={13} className="spin" /> 启动中…</>
                    : derive
                      ? <>接着上一份续跑 <ArrowRight size={14} /></>
                      : <>启动{isRival ? "竞品对比" : "正式研究"} <ArrowRight size={14} /></>}
                </button>
                <span className="pi-fine">按实际用量分段消耗 AI 积分,预估为上限;积分不足会暂停,补足后续跑不重复扣。</span>
              </div>
            </div>
          </>
        )}
      </section>
      <SiteFooter />
      <LoginModal open={needLogin} onClose={() => setNeedLogin(false)} onDone={() => { setNeedLogin(false); start(); }} />
      {xbConsent && (
        <>
          <button className="drawer-backdrop" aria-label="关闭" onClick={() => setXbConsent(false)} />
          <div className="xb-modal" role="dialog" aria-modal="true" aria-label="个人信息出境同意">
            <h3><Globe2 size={17} /> 联网检索将向境外传输检索内容</h3>
            <p>深度研究依赖联网检索。你输入的<b>商品名 / 检索词</b>会被发送给以下<b>位于境外</b>的检索服务商用于检索:</p>
            <p className="xb-recipients">{CROSS_BORDER_RECIPIENTS}</p>
            <p className="xb-fine">我们不会把你的账号身份、密码或支付信息随检索词一并出境。详见《隐私政策》第五条「个人信息出境」。你可以只用不联网的计算器等功能而不同意此项。</p>
            <div className="xb-actions">
              <button className="xb-cancel" onClick={() => setXbConsent(false)}>取消</button>
              <button className="xb-agree" onClick={() => { recordCrossBorderConsent(); setXbConsent(false); runScan(); }}>
                同意并开始扫描
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
