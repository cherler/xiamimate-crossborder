"use client";

/**
 * 商品实体详情抽屉(#74)—— 商品模型的完整界面。
 *
 * 「我的商品」点卡片打开:一个商品的全部家当摊开看 ——
 * 基本档案 / 平台事实(扩展采集)/ 全量口碑主题(亚马逊统计)/ 口碑样本 /
 * 财务模型(损益单口径,只报数不下结论)/ 测算版本时间线 /
 * 事实库进度 / 研究报告 / 竞品组;名字点击即改。
 * 点记录 = 切为当前商品 + 带参数回到对应工具。
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Calculator, ClipboardList, ExternalLink, FileText, MessagesSquare, Package, Pencil, Pin,
  ChevronDown, History, Loader2, MessageSquareQuote, Puzzle, RotateCcw, Star, Tags, Telescope, Trash2, X,
} from "lucide-react";
import { itemsApi, type ItemVersion } from "../../../lib/items";
import { calculateProfit, PROFIT_FIELD_LABELS } from "../../../lib/crossborder/calculators/profit";
import { baseCost } from "../../../lib/crossborder/product-model";
import {
  isCloudEnabled, ownsRef, removeRecord, schedulePush, setCurrent, toggleStar, updateProduct,
  type PlatformFacts, type Product, type ProductRecord,
} from "../../../lib/crossborder/products";
import { isExampleProduct } from "../../../lib/crossborder/example-product";
import {
  EXAMPLE_RESEARCH_HREF, EXAMPLE_VOICE_HREF,
} from "../../../lib/crossborder/example-reports";
import { deleteResearch, listResearch } from "../../../lib/crossborder/research/api";
import { deleteReport } from "../../../lib/crossborder/deep-report";
import { RELATION_LABEL, type ResearchRunListItem } from "../../../lib/crossborder/research/types";
import {
  deleteSample, describeSample, listSamplesWithTotal, loadInsights, loadSample, negativeShare, samplePenalty,
  type SampleReview,
  shortCount, splitTopics, worthFixing,
  type InsightTopic, type ProductInsights, type ReviewSampleMeta,
} from "../../../lib/crossborder/review-samples";
import { ExampleReportBadge } from "../example-report-ui";
import { OpenWithMenu } from "./open-with-menu";
import { RivalPanel } from "./rival-panel";
import { isTikTokMarket } from "../../../lib/crossborder/asin";

/** 研究报告在商品页的短标签(问句式 INTENT_LABEL 不适合列表)与状态。 */
const RESEARCH_INTENT_SHORT: Record<string, string> = {
  market_entry: "需求洞察", product_optimization: "商品优化", rival_compare: "竞品对比",
  brand_risk: "舆情风险", quality_diagnosis: "质量诊断", full: "综合研究",
};
const RUN_STATUS_SHORT: Record<string, string> = {
  running: "进行中", paused_insufficient: "已暂停", failed: "失败", done: "已完成",
};

export const TOOL_META: Record<string, { slug: string; name: string }> = {
  profit: { slug: "profit-calculator", name: "利润测算" },
  pricing: { slug: "pricing-calculator", name: "定价" },
  landed: { slug: "landed-cost", name: "到岸成本" },
  acos: { slug: "acos-break-even", name: "ACoS 盈亏平衡" },
  dimweight: { slug: "dimensional-weight", name: "体积重" },
};

// 工作台保存的版本(saveProductRecord):label + 打开对应工作台的路径。
const WB_META: Record<string, { name: string; slug: string }> = {
  listing: { name: "Listing 改写", slug: "listing-doctor" },
  voice_theme: { name: "主题分析", slug: "voice-insight" },
  service: { name: "客服回复", slug: "service-copilot" },
};

const MKT_LABELS: Record<string, string> = {
  "amazon-us": "亚马逊 美国站", "amazon-uk": "亚马逊 英国站", "amazon-de": "亚马逊 德国站",
  "amazon-jp": "亚马逊 日本站", "amazon-ca": "亚马逊 加拿大站",
};
export function mktLabel(m: string): string { return MKT_LABELS[m] ?? m; }

/** 点击即改的商品名(②③):平时是名字,点一下变输入框,回车/失焦保存,Esc 放弃。 */
export function EditableName({ value, onSave, big }: {
  value: string;
  onSave: (name: string) => void;
  big?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (!editing) {
    return (
      <button
        className={`pname${big ? " big" : ""}${value.trim() ? "" : " empty"}`}
        title="点击修改商品名"
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}>
        <span>{value.trim() || "未命名商品 · 点击起名"}</span>
        <Pencil size={big ? 13 : 11} />
      </button>
    );
  }
  return (
    <input
      className={`pname-input${big ? " big" : ""}`}
      autoFocus
      value={draft}
      placeholder="商品名字"
      aria-label="商品名字"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();   // 别把回车漏给卡片(卡片的回车 = 打开详情)
        if (e.key === "Enter") { onSave(draft.trim()); setEditing(false); }
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={() => { onSave(draft.trim()); setEditing(false); }}
    />
  );
}

/**
 * 履约方式的一句注解。**只陈述事实,不站队** ——
 * 「对手没上 FBA,有可乘之机」预设了这是竞品,而这块区域对自己的商品同样会显示。
 */
const FULFILL_HINT: Record<string, string> = {
  "亚马逊自营": "买家框通常由亚马逊占据",
  "FBA": "配送时效由亚马逊承担",
  "FBM": "配送时效由卖家自己控制",
};

/**
 * 平台事实 —— 扩展从商品页采集回来的公开信息。
 *
 * 与财务模型分开呈现,因为性质不同:这里全是平台上摆着的客观数字,
 * 会被下一次采集整块换掉;财务模型是用户自己的判断,采集永远不碰。
 * 所以「填入售价」是一个**按钮**而不是自动行为 —— 把平台价当成自己的定价
 * 是用户的决定(尤其这商品可能是竞品),我们不替他做。
 */
function PlatformSection({ facts, onUsePrice }: {
  facts: PlatformFacts;
  onUsePrice: (price: number) => void;
}) {
  const rows: [string, string][] = [];
  if (facts.price !== undefined) rows.push(["页面售价", `${facts.currency ?? ""} ${facts.price}`.trim()]);
  if (facts.rating !== undefined || facts.reviewCount !== undefined) {
    rows.push(["评分 / 评价数", [
      facts.rating !== undefined ? `${facts.rating} 分` : null,
      facts.reviewCount !== undefined ? `${facts.reviewCount.toLocaleString()} 条` : null,
    ].filter(Boolean).join(" · ")]);
  }
  /*
   * 已售数量。TikTok 独有 —— 亚马逊不公开销量,所以亚马逊档案里这一行不会出现。
   *
   * 摆在评分/评价数旁边:它们是同一类「这个品卖得怎么样」的信号,而已售是其中
   * 最直接的一个。此前它被塞在 bulletPoints 里当一句中文备注,而这张表根本不渲染
   * bulletPoints —— 采回来了却没人看得见。
   */
  if (facts.soldCount !== undefined) {
    rows.push(["累计已售", `${facts.soldCount.toLocaleString()} 件`]);
  }
  if (facts.brand) rows.push(["品牌", facts.brand]);
  if (facts.bsr) rows.push(["大类排名", facts.bsr]);
  if (facts.firstAvailable) rows.push(["上架时间", facts.firstAvailable]);
  if (facts.fulfillmentType) {
    const hint = FULFILL_HINT[facts.fulfillmentType];
    rows.push(["履约方式", facts.fulfillmentType + (hint ? ` · ${hint}` : "")]);
  }
  if (facts.sellerName) rows.push(["卖家", facts.sellerName]);
  if (facts.categoryPath) rows.push(["类目", facts.categoryPath]);

  // 采集超过 30 天的数字不该被当成现价用,如实提示而不是悄悄展示。
  // 「现在」在挂载时取一次就够:陈旧与否是天级判断,不需要跟着每次重渲染跳变,
  // 而渲染期直接调 Date.now() 会让同一份数据一会儿标陈旧一会儿不标。
  const [mountedAt] = useState(() => Date.now());
  const stale = mountedAt - facts.capturedAt > 30 * 24 * 3600 * 1000;

  return (
    <Foldable id="platform" count={facts.price !== undefined ? `${facts.currency ?? ""} ${facts.price}`.trim() : undefined}
      head={<><Puzzle size={14} /> 平台事实
        <small>扩展采集 · {when(facts.capturedAt)}{stale ? " · 已过 30 天,建议重新采集" : ""}</small></>}>
      {rows.length ? (
        <table className="pd-ledger"><tbody>
          {rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
      ) : <p className="pd-empty">这次采集没抓到可展示的字段。</p>}
      <div className="pd-plat-actions">
        {facts.price !== undefined && (
          <button className="pd-cta inline" onClick={() => onUsePrice(facts.price!)}>
            把页面售价填进财务模型
          </button>
        )}
        {facts.sourceUrl && (
          <a className="pd-cta inline" href={facts.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            <ExternalLink size={13} /> 原页面
          </a>
        )}
      </div>
    </Foldable>
  );
}

/**
 * 亚马逊算的全量口碑主题。
 *
 * 与下面的「口碑样本」是两回事,刻意分开摆:
 *   这里    = 亚马逊基于该商品**全部**评论的聚类。可信、覆盖完整,但粒度粗,
 *             而且是**它的**分析 —— 出处必须写在标题旁边。
 *   口碑样本 = 我们采到的评论原文,十几条,有采样偏差。
 * 合在一起展示会让人以为我们分析了几万条评论。
 *
 * 亚马逊已关掉评论深度翻页与星级筛选(实测),我们自己拿不到大样本 ——
 * 所以「量级判断」这件事只能靠这一块,采来的原文退居为佐证。
 */
function TopicChip({ t }: { t: InsightTopic }) {
  const share = negativeShare(t);
  return (
    <span className={`pd-topic ${t.sentiment}`}
      title={share !== null ? `${t.mentions} 条提到 · ${t.positive} 正面 / ${t.negative} 负面` : `${t.mentions} 条提到`}>
      {t.name} <b>{shortCount(t.mentions)}</b>
      {share !== null && share > 0 && <i className="pd-topic-neg">{Math.round(share * 100)}% 负面</i>}
    </span>
  );
}

function InsightsSection({ product }: { product: Product }) {
  const [data, setData] = useState<ProductInsights | null | "loading">("loading");
  const [openAll, setOpenAll] = useState(false);
  const [openSummary, setOpenSummary] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadInsights(product).then((r) => { if (alive) setData(r); });
    return () => { alive = false; };
  }, [product]);

  if (data === "loading" || !data || (!data.topics.length && !data.summary)) return null;

  /*
   * 版式的取舍:一屏之内只放「该先改哪几项」,其余折叠。
   *
   * 第一版把八个主题平铺 + 整段摘要直接展开,结果是一大坨谁也不会读的文字
   * (用户原话:「太长、组织太混乱」)。主题多的时候,平铺等于没有重点 ——
   * 而这一块的价值恰恰是「告诉我先看哪个」。
   */
  /*
   * 已展示的与折叠的必须**由同一个来源切分**,不能各算各的。
   * 原来 rest 算的是「不在 fix 里的」,而 fix 为空时(旧版采集的数据没有正负条数)
   * 主区显示的是 topics.slice(0,6) —— 于是 rest = 全部,展开后把已经显示的
   * 六个又列了一遍。实测就是这么重复的。
   */
  const fix = worthFixing(data.topics);
  const { primary, hidden } = splitTopics(data.topics);

  return (
    <Foldable id="insights" count={`${data.topics.length} 个主题`}
      head={<><Tags size={14} /> 全量口碑主题
        <small>
          亚马逊统计{data.totalReviews ? ` · 覆盖全部 ${data.totalReviews.toLocaleString()} 条` : ""}
          {" · "}{fmtIso(data.capturedAt)}
        </small></>}>

      {fix.length > 0 && <div className="pd-topic-lead">值得先看</div>}
      <div className="pd-topics">{primary.map((t) => <TopicChip key={t.name} t={t} />)}</div>
      {fix.length > 0 && (
        <p className="pd-topic-why">
          按「多少人在意 × 其中多少人不满意」排的 —— 不是按负面条数，
          那样只会把最热门的主题排在最前面。
        </p>
      )}

      {hidden.length > 0 && (
        <>
          <button className="pd-more" onClick={() => setOpenAll((v) => !v)} aria-expanded={openAll}>
            <ChevronDown size={13} className={openAll ? "pd-more-open" : ""} />
            {openAll ? "收起" : `其余 ${hidden.length} 个主题`}
          </button>
          {openAll && (
            <div className="pd-topics">{hidden.map((t) => <TopicChip key={t.name} t={t} />)}</div>
          )}
        </>
      )}

      {data.summary && (
        <>
          <button className="pd-more" onClick={() => setOpenSummary((v) => !v)} aria-expanded={openSummary}>
            <ChevronDown size={13} className={openSummary ? "pd-more-open" : ""} />
            {openSummary ? "收起亚马逊的原文摘要" : "看亚马逊的原文摘要"}
          </button>
          {openSummary && <p className="pd-topic-summary">{data.summary}</p>}
        </>
      )}

      <p className="pd-empty">
        这是亚马逊自己对全部评论的归纳，不是我们的分析；它只给方向与量级，
        买家具体说了什么，要看下面的口碑样本。
      </p>
    </Foldable>
  );
}

/**
 * 口碑样本 —— 这个商品有哪些评论数据可供分析。
 *
 * 每一批都必须带着「它是怎么来的」一起显示。同样 320 条评论,后台导出的完整
 * 数据与「只看一星翻了三页」得出的结论完全不是一回事,而两份报告长得一模一样。
 * 所以描述与警告不是装饰,是这个功能的良心。
 */
function SamplesSection({ product, onOpen }: { product: Product; onOpen: (batchId: string) => void }) {
  const [items, setItems] = useState<ReviewSampleMeta[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let alive = true;
    void listSamplesWithTotal(product).then((r) => {
      if (!alive) return;
      setItems(r.items);
      setTotal(r.distinctTotal);
    });
    return () => { alive = false; };
  }, [product]);

  async function remove(batchId: string) {
    setBusy(batchId);
    if (await deleteSample(batchId)) {
      // 删掉一批之后总数必须**重新问服务端**:本地减不出来 ——
      // 不知道这一批里有几条是它独有的,减 reviewCount 会减多。
      const r = await listSamplesWithTotal(product);
      setItems(r.items);
      setTotal(r.distinctTotal);
    }
    setBusy("");
  }

  /*
   * 总数用**服务端去重后**的数,不是各批相加。
   *
   * 重复是正常且必然的:「采集本页商品」顺带采本页评论,用户之后单独采评论
   * 又会采到同一页。实测「2 批 · 共 24 条」去重后其实是 21 条。
   * 虚高的样本量会直接抬高用户对结论的信任度 —— 而这个产品的全部前提
   * 就是「偏样本不许伪装成全样本」,在自家的计数上先破功说不过去。
   */

  return (
    <Foldable id="samples" count={items?.length ? `${items.length} 批 · ${total.toLocaleString()} 条` : "无"}
      head={<><MessageSquareQuote size={14} /> 口碑样本
        <small>{items?.length ? `${items.length} 批 · 共 ${total.toLocaleString()} 条` : ""}</small></>}>
      {items === null ? <p className="pd-empty">加载中…</p>
        : items.length === 0 ? (
          <p className="pd-empty">
            还没有评论数据 —— 自家商品从卖家后台导出 CSV 上传;别人的商品用浏览器扩展在商品页采集。
            <button className="pd-cta inline" onClick={() => onOpen("")}>去声音洞察</button>
          </p>
        ) : items.map((s) => {
          const warn = samplePenalty(s);
          return (
            <div key={s.batchId} className="pd-sample">
              <div className="pd-sample-head">
                <span className={`pd-sample-tag ${s.source}`}>{s.source === "upload" ? "上传" : "扩展采集"}</span>
                <b>{s.reviewCount.toLocaleString()} 条</b>
                <span className="pd-sample-when">{fmtIso(s.createdAt)}</span>
                <button className="pd-sample-del" disabled={busy === s.batchId}
                  onClick={() => void remove(s.batchId)} aria-label="删除样本"><Trash2 size={12} /></button>
              </div>
              {/*
                * 来源与警示合成一行。
                *
                * 拆成两行时它们说的其实是同一件事的两半:「浏览器采集」+
                * 「只采了 0.3%,占比类结论仅供参考」。分开摆占两行、读两遍,
                * 而 TikTok 的来源那半现在只剩「浏览器采集」四个字 ——
                * 单独占一行更显得是废话。
                */}
              <div className={warn ? "pd-sample-warn" : "pd-sample-from"}>
                {describeSample(s)}{warn ? ` · ${warn}` : ""}
              </div>
              {/* 采了什么,得看得见。此前这张卡片唯一的出口是「拿它做声音洞察」——
                  想确认采到的是不是这个商品的评论,得先跳到另一个工具跑一遍。
                  正文列表接口(loadSample)一直都有,只是没人给它一个入口。 */}
              <SamplePeek batchId={s.batchId} count={s.reviewCount} />
              <button className="pd-cta inline" onClick={() => onOpen(s.batchId)}>拿它做声音洞察</button>
            </div>
          );
        })}
    </Foldable>
  );
}

/**
 * 可折叠的档案区块。
 *
 * 档案会越长越长(平台事实、全量口碑主题、口碑样本、财务模型、测算记录、
 * 事实库、研究报告、竞品组…),一屏装不下就等于下面几块没人看见。
 *
 * 折叠状态**记在本机、按区块记**:它是个人阅读习惯,不该跟着档案同步到别的设备
 * (同一个道理见 products.ts 里打开记录那段)。默认全部展开 —— 折叠是给
 * 「我这次不看这块」用的,不该让新用户先去找展开按钮。
 *
 * 折叠时仍显示一句摘要,否则折起来就不知道里面有没有东西。
 */
const FOLD_KEY = "xm_cb_pd_folded";

function readFolded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(window.localStorage.getItem(FOLD_KEY) || "[]") as string[]); }
  catch { return new Set(); }
}

/**
 * 版本时间轴。
 *
 * 本地这份正在从「主本」降级成「云端的缓存」,那之后云端就是唯一的一份 ——
 * 这个时间轴是用户唯一的后悔药。数据一直都在(云端每次写入留一版,保留 20 版),
 * 在此之前只有运营台能取回。
 *
 * 两个刻意的做法:
 *  - **默认折叠**。它是出事时才找的东西,平时不该占地方。
 *  - **对所有人开放**。唯一的付费点是商品档案数,功能一律不分档 ——
 *    把后悔药做成付费项,只会在用户误改后制造一次客诉,换不来什么。
 */
function VersionSection({ product, onRestored }: {
  product: Product;
  onRestored: () => void;
}) {
  const [rows, setRows] = useState<ItemVersion[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const cloudId = product.cloudId;

  useEffect(() => {
    let alive = true;
    if (!cloudId) { setRows([]); return; }
    itemsApi.history(cloudId)
      .then((d) => { if (alive) setRows(d.history); })
      .catch((e) => { if (alive) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); } });
    return () => { alive = false; };
  }, [cloudId, product.updatedAt]);

  async function restore(v: ItemVersion) {
    if (!cloudId) return;
    // 回滚会覆盖当前内容 —— 这是少数几个值得挡一下的操作。
    // 但话要说全:回滚本身也记一版,所以这一步是可以再撤销的。
    if (!window.confirm(
      `把「${product.name || "这份档案"}」恢复到 ${when(new Date(v.createdAt).getTime())} 的那一版?\n\n`
      + "当前内容会被覆盖,但它也会先存成一个新版本 —— 恢复错了还能再退回来。")) return;
    setBusy(v.version); setErr("");
    try {
      await itemsApi.rollback(cloudId, v.version);
      onRestored();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  }

  if (!cloudId) return null;   // 还没上云的档案没有云端历史,不摆一个空壳

  return (
    <Foldable id="versions" defaultOpen={false}
      count={rows?.length ? `${rows.length} 版` : undefined}
      head={<><History size={14} /> 版本历史</>}>
      {rows === null && <p className="pd-empty"><Loader2 size={13} className="spin" /> 正在读取…</p>}
      {rows?.length === 0 && !err && <p className="pd-empty">这份档案还没有历史版本。</p>}
      {err && <p className="pd-vh-err">{err}</p>}
      {!!rows?.length && (
        <div className="pd-timeline">
          {rows.map((v, i) => (
            <div key={v.version} className="pd-rec-row">
              <span className="pd-vh-row">
                <em>{OP_LABEL[v.op] ?? v.op}</em>
                <span>{v.title || "未命名商品"}</span>
                <small>{kb(v.size)}</small>
                <time>{when(new Date(v.createdAt).getTime())}</time>
              </span>
              {i === 0
                ? <span className="pd-vh-now">当前</span>
                : (
                  <button className="pd-rec-del" title="恢复到这一版"
                    disabled={busy !== null} onClick={() => restore(v)}>
                    {busy === v.version ? <Loader2 size={12} className="spin" /> : <RotateCcw size={12} />}
                  </button>
                )}
            </div>
          ))}
        </div>
      )}
      <p className="pd-vh-note">保留最近 20 版。恢复也会存成新的一版，所以恢复错了还能退回来。</p>
    </Foldable>
  );
}

const OPENED_PREFIX = "open:";

const OP_LABEL: Record<string, string> = {
  create: "建档", update: "修改", delete: "删除", rollback: "恢复",
};

function kb(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
}

function Foldable({ id, head, children, count, defaultOpen = true }: {
  id: string;
  head: ReactNode;
  children: ReactNode;
  count?: string;
  /** 默认展开。版本历史是出事才找的东西,默认收起。 */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // 记住的是「用户手动折叠过哪些」。所以默认收起的块要反过来判:
  // 只有用户主动展开过(不在 folded 里 且 曾被点开)才展开 —— 用一个显式标记区分。
  useEffect(() => {
    const folded = readFolded();
    setOpen(defaultOpen ? !folded.has(id) : folded.has(OPENED_PREFIX + id));
  }, [id, defaultOpen]);

  function toggle() {
    const next = !open;
    setOpen(next);
    const folded = readFolded();
    // 默认展开的块记「折叠过」,默认收起的块记「展开过」—— 同一份集合,两种键。
    const key = defaultOpen ? id : OPENED_PREFIX + id;
    if (next === defaultOpen) folded.delete(key); else folded.add(key);
    try { window.localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch { /* 无痕模式忽略 */ }
  }

  return (
    <section className={`pd-sec${open ? "" : " pd-sec-folded"}`}>
      <button className="pd-sec-head pd-sec-toggle" onClick={toggle} aria-expanded={open}>
        {head}
        <span className="pd-fold-right">
          {!open && count && <em>{count}</em>}
          <ChevronDown size={14} className={open ? "pd-fold-open" : ""} />
        </span>
      </button>
      {open && children}
    </section>
  );
}

function when(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 字符串(后端 createdAt)→ 同 when 的短格式;空则占位。 */
function fmtIso(iso?: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : when(t);
}

/** 记录 → 打开链接:测算记录带参数回工具;研究记录进报告页。 */
function recordHref(r: ProductRecord): string | null {
  if (r.tool === "research") {
    const runId = (r.values as { runId?: string }).runId;
    return runId ? `/crossborder/research/report/?id=${encodeURIComponent(String(runId))}` : null;
  }
  if (r.tool === "voice") {
    const runId = (r.values as { runId?: string }).runId;
    return runId ? `/crossborder/report/?id=${encodeURIComponent(String(runId))}` : null;
  }
  const meta = TOOL_META[r.tool];
  if (!meta) return null;
  return `/crossborder/tools/${meta.slug}?s=${encodeURIComponent(JSON.stringify(r.values))}`;
}

function reportHref(runId: string): string {
  return `/crossborder/research/report/?id=${encodeURIComponent(runId)}`;
}

/** 按同类工具分组(保留原顺序:最新在前)。 */
function groupByTool(recs: ProductRecord[]): [string, ProductRecord[]][] {
  const map = new Map<string, ProductRecord[]>();
  for (const r of recs) { const a = map.get(r.tool) ?? []; a.push(r); map.set(r.tool, a); }
  return [...map.entries()];
}

/**
 * 单条记录行:标题 + 时间 + 星标(事实依据)+ 删除 + 点击带参回工具。
 * 星标状态三态:实心=用户固定的事实依据(不可删);虚化实心=没人固定时的「默认最新一条」;
 * 空心=普通记录。默认那条仍可删(删了自动顺延到下一条最新)。
 */
function RecordRow({ r, toolName, href, isDefault, onOpen, onStar, onDel }: {
  r: ProductRecord; toolName: string; href: string | null; isDefault?: boolean;
  onOpen: () => void; onStar: () => void; onDel: () => void;
}) {
  return (
    <div className={`pd-rec-row${r.starred ? " is-star" : isDefault ? " is-default" : ""}`}>
      <button className="pd-rec-main" onClick={onOpen} disabled={!href}
        title={href ? "点击带输入/输出回到工具" : ""}>
        <em>{toolName}</em><span>{r.label}</span><time>{when(r.ts)}</time>
      </button>
      <button className={`pd-rec-star${isDefault ? " is-dim" : ""}`} aria-pressed={!!r.starred}
        title={r.starred ? "取消「事实依据」"
          : isDefault ? "当前默认事实依据(最新一条)· 点击固定为准" : "设为事实依据(取值来源;写回财务模型)"}
        onClick={onStar}>
        <Star size={13} fill={r.starred || isDefault ? "currentColor" : "none"} />
      </button>
      {!r.starred && <button className="pd-rec-del" title="删除记录" onClick={onDel}><Trash2 size={12} /></button>}
    </div>
  );
}

/** 按同类工具折叠:默认显示 3 条,其余展开。 */
function ToolGroup({ recs, render }: { recs: ProductRecord[]; render: (r: ProductRecord) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = open ? recs : recs.slice(0, 3);
  return (
    <div className="pd-tool-group">
      <div className="pd-timeline">{shown.map(render)}</div>
      {recs.length > 3 && (
        <button className="pd-more-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "收起" : `展开其余 ${recs.length - 3} 条`}
        </button>
      )}
    </div>
  );
}

/**
 * 商品名下的研究报告(生命周期口径 B)—— 反向聚合。
 *
 * 权威源是后端(按 productRef 查),而非客户端记录:这样能收全「定期复扫」自动生成、
 * 以及别处/别设备跑出的报告。按 lineageRootId 分组成「版本链」,链内是版本历史
 * (原始 → 补资料/换范围/升档/复扫)。后端拿不到(未登录/离线)才回退客户端记录。
 */
function ProductResearchSection({ product, fallback, onOpen }: {
  product: Product;
  fallback: ProductRecord[];
  onOpen: (href: string) => void;
}) {
  const [runs, setRuns] = useState<ResearchRunListItem[] | null>(null);   // null = 后端未取到
  const isExample = isExampleProduct(product);
  useEffect(() => {
    let alive = true;
    listResearch()
      // 合并过来的旧 stableId 也算本档案的报告 —— 否则合并一次就丢一批报告
      .then((rs) => { if (alive) setRuns(rs.filter((r) => ownsRef(product, r.productRef))); })
      .catch(() => { if (alive) setRuns(null); });   // 未登录/失败 → 保持 null,走回退
    return () => { alive = false; };
  }, [product.stableId]);

  async function del(runId: string, name: string) {
    if (!window.confirm(`删除研究报告「${name}」?已消耗的积分不退回,不可撤销。`)) return;
    try {
      await deleteResearch(runId);
      setRuns((rs) => (rs ?? []).filter((r) => r.runId !== runId));
    } catch (e) { window.alert(e instanceof Error ? e.message : "删除失败,请稍后再试。"); }
  }

  const exampleRow = isExample ? (
    <button className="pd-rec pd-example-report-row" onClick={() => onOpen(EXAMPLE_RESEARCH_HREF)}>
      <em>深度研究</em>
      <span>口碑与需求洞察 · 示例报告 <ExampleReportBadge compact /></span>
      <time>演示数据 · 未消耗积分</time>
    </button>
  ) : null;

  // 后端拿到且有数据 → 权威谱系视图;否则(空或失败)有本地记录才回退平铺。
  if (runs === null || runs.length === 0) {
    if (fallback.length === 0 && !exampleRow) return null;
    return (
      <section className="pd-sec">
        <div className="pd-sec-head">
          <Telescope size={14} /> 研究报告
          <small>{fallback.length + (isExample ? 1 : 0)} 份{isExample ? " · 其中 1 份示例" : ""}</small>
        </div>
        <div className="pd-timeline">
          {exampleRow}
          {fallback.map((r) => {
            const href = recordHref(r);
            return (
              <button key={r.id} className="pd-rec" onClick={() => href && onOpen(href)} disabled={!href}>
                <em>深度研究</em><span>{r.label}</span><time>{when(r.ts)}</time>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // 按 lineageRootId 分组(runs 已按 createdAt 倒序,组内保持倒序:最新在前)。
  const groups: { root: string; items: ResearchRunListItem[] }[] = [];
  const idx = new Map<string, number>();
  for (const r of runs) {
    const root = r.lineageRootId || r.runId;
    if (!idx.has(root)) { idx.set(root, groups.length); groups.push({ root, items: [] }); }
    groups[idx.get(root)!].items.push(r);
  }

  return (
    <section className="pd-sec">
      <div className="pd-sec-head">
        <Telescope size={14} /> 研究报告
        <small>
          {runs.length + (isExample ? 1 : 0)} 份
          {groups.length !== runs.length ? ` · ${groups.length} 条版本链` : ""}
          {isExample ? " · 其中 1 份示例" : ""}
        </small>
      </div>
      <div className="pd-research">
        {exampleRow}
        {groups.map((g) => {
          const latest = g.items[0];
          const hasNew = g.items.some((r) => r.status === "done" && !r.seen);
          return (
            <div key={g.root} className="pd-rchain">
              <div className="pd-rchain-headrow">
                <button className="pd-rchain-head" onClick={() => onOpen(reportHref(latest.runId))}>
                  <b>{RESEARCH_INTENT_SHORT[latest.intent] ?? latest.intent}</b>
                  {g.items.some((r) => r.pinned) && <Pin size={11} className="pd-rchain-pin" />}
                  {hasNew && <span className="pd-rchain-new">NEW</span>}
                  <time>{fmtIso(latest.createdAt)}</time>
                  <span className={`pd-rchain-st is-${latest.status}`}>{RUN_STATUS_SHORT[latest.status] ?? latest.status}</span>
                </button>
                {g.items.length === 1 && (
                  <button className="pd-rec-del" title="删除报告"
                    onClick={() => del(latest.runId, RESEARCH_INTENT_SHORT[latest.intent] ?? latest.intent)}>
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
              {g.items.length > 1 && (
                <div className="pd-rchain-vers">
                  {[...g.items].reverse().map((r, i) => (
                    <span key={r.runId} className={`pd-rver${r.pinned ? " is-pinned" : ""}`}>
                      <button className="pd-rver-open"
                        onClick={() => onOpen(reportHref(r.runId))}
                        title={`${fmtIso(r.createdAt)} · ${RUN_STATUS_SHORT[r.status] ?? r.status}`}>
                        <span>v{i + 1}</span>
                        <em>{i === 0 ? "原始" : (RELATION_LABEL[r.relation ?? "origin"] ?? "版本")}</em>
                        {r.pinned && <Pin size={9} />}
                      </button>
                      <button className="pd-rver-del" title="删除这一版"
                        onClick={() => del(r.runId, `v${i + 1}`)}><Trash2 size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 就地看这批样本采到了什么。正文按需拉取(列表刻意不带正文,几百 KB)。
 * 只做「看一眼确认」,分析仍然去声音洞察 —— 这里不做筛选、不做统计。
 */
function SamplePeek({ batchId, count }: { batchId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SampleReview[] | null>(null);
  const [err, setErr] = useState("");

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (rows) return;                       // 拉过一次就不再拉
    try { setRows(await loadSample(batchId)); }
    catch (e) { setErr(e instanceof Error ? e.message : "样本加载失败。"); }
  }

  return (
    <div className="pd-peek">
      <button className="pd-peek-btn" onClick={() => void toggle()} aria-expanded={open}>
        {open ? "收起" : `查看这 ${count} 条`}
      </button>
      {open && (
        err ? <p className="pd-peek-err">{err}</p>
        : rows === null ? <p className="pd-peek-empty">加载中…</p>
        : rows.length === 0 ? <p className="pd-peek-empty">这批样本里没有正文。</p>
        : <ul className="pd-peek-list">
            {rows.map((r, i) => (
              <li key={r.id || i}>
                <span className="pd-peek-meta">
                  {r.rating ? `${r.rating}★` : "无评分"}
                  {r.date ? ` · ${r.date}` : ""}
                  {r.variant ? ` · ${r.variant}` : ""}
                  {r.verified ? " · 已验证购买" : ""}
                </span>
                <span className="pd-peek-text">{r.text}</span>
              </li>
            ))}
          </ul>
      )}
    </div>
  );
}

export function ProductDetail({ product, isCloud, loading, onClose, onRename, onResearch, onDelete }: {
  product: Product;
  isCloud: boolean;
  /** 详情正在从云端补齐(这份档案本地只有卡片) */
  loading?: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onResearch: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * 把页面售价填进财务模型。**只在用户点按钮时**发生 ——
   * 采集本身绝不写 finance:这个商品很可能是竞品,把对手的定价当成自己的售价
   * 会让下游全部测算失真。是不是「我的定价」,只有用户知道。
   */
  function usePlatformPrice(price: number) {
    updateProduct(product.id, (p) => ({
      ...p,
      finance: { ...p.finance, price, updatedAt: Date.now() },
    }));
    if (isCloudEnabled()) schedulePush();
  }

  /** 带着某一批样本去声音洞察(工作台);batchId 为空则只切商品、不预选样本。 */
  function openVoice(batchId: string) {
    goto(`/crossborder/workbench/voice-insight${batchId ? `?sample=${encodeURIComponent(batchId)}` : ""}`);
  }

  const f = product.finance;
  const filled = f.updatedAt > 0;                    // 用户动过模型才展示,默认值不冒充
  const base = baseCost(f);
  let profit: ReturnType<typeof calculateProfit> | null = null;
  try { profit = filled ? calculateProfit(f) : null; } catch { profit = null; }

  const records = product.records ?? [];
  const calcRecords = records.filter((r) => TOOL_META[r.tool]);
  const researches = records.filter((r) => r.tool === "research");
  const voices = records.filter((r) => r.tool === "voice");
  const isExample = isExampleProduct(product);
  const workbenchRecs = records.filter((r) => WB_META[r.tool]);
  // 事实依据:五个计算器共用一份财务模型 → 全组只一个星标。没人固定时默认最新一条
  // (calcRecords 已按最新在前),给它一个「虚化星」提示当前取值来源。
  const financeDefaultId = calcRecords.some((r) => r.starred) ? null : (calcRecords[0]?.id ?? null);
  const facts = product.project?.facts ?? [];
  const factsOk = facts.filter((x) => x.status === "confirmed").length;

  // 进工具前先把它设为当前商品,工具才会挂它的档案
  function goto(href: string) {
    setCurrent(product.id);
    window.location.href = href;
  }
  const cloud = isCloudEnabled();
  function star(id: string) { toggleStar(product.id, id); if (cloud) schedulePush(); }
  function del(id: string) {
    if (window.confirm("删除这条记录?(不可恢复)")) { removeRecord(product.id, id); if (cloud) schedulePush(); }
  }
  // 删舆情报告:后端删 report_run(有 runId 时)+ 本地移除这条记录。
  async function delVoice(r: ProductRecord) {
    if (!window.confirm("删除这份用户声音报告?已消耗的积分不退回,不可撤销。")) return;
    const runId = (r.values as { runId?: string }).runId;
    if (runId) { try { await deleteReport(String(runId)); } catch { /* 本地仍移除 */ } }
    removeRecord(product.id, r.id); if (cloud) schedulePush();
  }

  return (
    <>
      <button className="drawer-backdrop" aria-label="关闭商品详情" onClick={onClose} />
      <aside className="drawer pd" role="dialog" aria-modal="true" aria-label="商品详情">
        <div className="drawer-head">
          <div>
            <span><Package size={12} /> 商品档案</span>
            <EditableName big value={product.name} onSave={onRename} />
          </div>
          <button onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </div>
        {/*
          详情还在从云端补齐。**必须显式说出来** —— 存根的 records 是空数组、
          finance 是占位值,直接摆出来就是一份「空档案」,和数据丢了长得一模一样。
          离线时这里会停在加载态而不是显示成空,也是刻意的。
        */}
        {(loading || product.stub) && (
          <p className="pd-loading">
            <Loader2 size={13} className="spin" />
            {loading ? "正在从云端取这份档案的详情…" : "这份档案的详情还没取下来 —— 需要联网。"}
          </p>
        )}

        <div className="drawer-body">
          {/* 基本档案 */}
          <div className="pd-meta">
            {product.marketplace && <span>{mktLabel(product.marketplace)}</span>}
            {/* 「ASIN」是亚马逊的说法。asin 这个字段存的是**平台侧身份锚点**
                (见 products.ts 的注释),TikTok 存的是它的商品 ID ——
                标成 ASIN 会让用户以为我们把平台认错了。 */}
            {product.asin && (
              <span>{isTikTokMarket(product.marketplace) ? "商品 ID" : "ASIN"} {product.asin}</span>
            )}
            {isExample && <ExampleReportBadge compact />}
            <span>{isCloud && product.cloudId ? "云端同步" : "本机保存"}</span>
            <span>更新 {when(product.updatedAt)}</span>
          </div>

          {/* 平台事实:扩展采集回来的公开信息。放在财务模型之前 ——
              先看平台上是什么样,再看自己怎么算,阅读顺序即因果顺序。 */}
          {product.platform && <PlatformSection facts={product.platform} onUsePrice={usePlatformPrice} />}

          {/* 全量口碑主题在前、采样原文在后:先看整体量级,再看买家具体说了什么。
              两者可信度来源不同,分开摆才不会被当成一回事。 */}
          <InsightsSection product={product} />

          {/* 口碑样本:平台事实之后 —— 都是「外面是什么样」,财务模型才是「我怎么算」 */}
          <SamplesSection product={product} onOpen={openVoice} />

          {/* 财务模型:损益单口径,只报数 */}
          <Foldable id="finance" count={filled ? `售价 $${f.price}` : "未填"}
            head={<><Calculator size={14} /> 财务模型<small>五个计算器共用这一份</small></>}>
            {filled ? (
              <>
                <table className="pd-ledger"><tbody>
                  <tr><td>{PROFIT_FIELD_LABELS.price}</td><td>${f.price}</td></tr>
                  <tr><td>单件固定成本<small>采购 + 国内 + 头程 + 尾程</small></td><td>${base.toFixed(2)}</td></tr>
                  <tr><td>佣金 / 广告 / 退款</td><td>{f.commission}% / {f.ads}% / {f.refund}%</td></tr>
                  {profit && (
                    <tr className="pd-sum"><td>照此一单</td>
                      <td>{profit.profit >= 0 ? "赚" : "亏"} ${Math.abs(profit.profit).toFixed(2)} · 净利率 {profit.margin}%</td></tr>
                  )}
                  {f.blocks.length > 0 && <tr><td>成本积木</td><td>{f.blocks.length} 块</td></tr>}
                </tbody></table>
                <button className="pd-cta" onClick={() => goto("/crossborder/tools/profit-calculator")}>
                  <ExternalLink size={13} /> 打开利润计算器继续
                </button>
              </>
            ) : (
              <p className="pd-empty">还没填过 —— 去利润计算器填一次,定价、广告、到岸工具就都认识它了。
                <button className="pd-cta inline" onClick={() => goto("/crossborder/tools/profit-calculator")}>去填</button>
              </p>
            )}
          </Foldable>

          {/* 测算版本时间线 */}
          <Foldable id="records" count={calcRecords.length ? `${calcRecords.length} 条` : "无"}
            head={<><ClipboardList size={14} /> 测算记录<small>{calcRecords.length ? `${calcRecords.length} 条 · 按工具折叠 · ⭐=事实依据` : ""}</small></>}>
            {calcRecords.length ? (
              groupByTool(calcRecords).map(([tool, recs]) => (
                <div key={tool} className="pd-tool-sec">
                  <div className="pd-tool-title">{TOOL_META[tool]?.name ?? tool}<small>{recs.length} 条</small></div>
                  <ToolGroup recs={recs} render={(r) => {
                    const href = recordHref(r);
                    return (
                      <RecordRow key={r.id} r={r} toolName={TOOL_META[r.tool]?.name ?? r.tool} href={href}
                        isDefault={r.id === financeDefaultId}
                        onOpen={() => href && goto(href)} onStar={() => star(r.id)} onDel={() => del(r.id)} />
                    );
                  }} />
                </div>
              ))
            ) : <p className="pd-empty">还没有测算记录 —— 工具页点「保存本次快照」就会记在这里。</p>}
          </Foldable>

          {/* 事实库 */}
          <Foldable id="facts" count={product.project ? `${factsOk}/${facts.length} 已确认` : "未用过"}
            head={<><FileText size={14} /> 事实库</>}>
            {product.project ? (
              <p className="pd-line">
                事实 {factsOk}/{facts.length} 已确认{product.project.listing?.title ? " · 已有 Listing 草稿" : ""}
                <button className="pd-cta inline" onClick={() => goto("/crossborder/workbench/listing-doctor")}>打开工作台</button>
              </p>
            ) : <p className="pd-empty">还没用过 Listing 工作台 —— 用了之后,商品的事实与草稿会归档在这里。</p>}
          </Foldable>

          {/* 云端版本历史 —— 本地降级成缓存之后,这是用户唯一的后悔药 */}
          <VersionSection product={product} onRestored={() => window.location.reload()} />

          {/* 研究报告(口径 B:后端按 productRef 反向聚合成版本链;回退客户端记录) */}
          <ProductResearchSection product={product} fallback={researches} onOpen={goto} />

          {/* 用户声音报告 */}
          {(voices.length > 0 || isExample) && (
            <section className="pd-sec">
              <div className="pd-sec-head">
                <MessagesSquare size={14} /> 用户声音报告
                <small>{voices.length + (isExample ? 1 : 0)} 份{isExample ? " · 其中 1 份示例" : ""}</small>
              </div>
              <div className="pd-timeline">
                {isExample && (
                  <button className="pd-rec pd-example-report-row" onClick={() => goto(EXAMPLE_VOICE_HREF)}>
                    <em>用户声音</em>
                    <span>用户声音与竞品洞察 · 示例报告 <ExampleReportBadge compact /></span>
                    <time>演示数据 · 未消耗积分</time>
                  </button>
                )}
                {voices.map((r) => {
                  const href = recordHref(r);
                  return (
                    <div key={r.id} className="pd-rec-row">
                      <button className="pd-rec-main" onClick={() => href && goto(href)} disabled={!href}>
                        <em>用户声音</em><span>{r.label}</span><time>{when(r.ts)}</time>
                      </button>
                      <button className="pd-rec-del" title="删除报告" onClick={() => delVoice(r)}><Trash2 size={12} /></button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 工作台版本(Listing 改写 / 主题分析 / 客服回复)—— 按工具折叠,展开看输入/输出快照 */}
          {workbenchRecs.length > 0 && (
            <section className="pd-sec">
              <div className="pd-sec-head"><ClipboardList size={14} /> 工作台记录<small>{workbenchRecs.length} 条 · 按工具折叠 · ⭐=事实依据</small></div>
              {groupByTool(workbenchRecs).map(([tool, recs]) => {
                // 工作台各工具独立成组;没人固定时默认最新一条(recs 已最新在前)。
                const wbDefaultId = recs.some((x) => x.starred) ? null : (recs[0]?.id ?? null);
                return (
                <div key={tool} className="pd-tool-sec">
                  <div className="pd-tool-title">{WB_META[tool]?.name ?? tool}<small>{recs.length} 条</small></div>
                  <ToolGroup recs={recs} render={(r) => {
                    const summary = String((r.values as { summary?: string }).summary || "");
                    const meta = WB_META[r.tool];
                    const isDefault = r.id === wbDefaultId;
                    return (
                      <details key={r.id} className={`pd-wb-rec${r.starred ? " is-star" : isDefault ? " is-default" : ""}`}>
                        <summary>
                          <em>{meta?.name ?? r.tool}</em><span>{r.label}</span><time>{when(r.ts)}</time>
                          <span className="pd-wb-acts">
                            <button className={`pd-rec-star${isDefault ? " is-dim" : ""}`} onClick={(e) => { e.preventDefault(); star(r.id); }}
                              title={r.starred ? "取消「事实依据」" : isDefault ? "当前默认事实依据(最新一条)· 点击固定" : "设为事实依据"}>
                              <Star size={12} fill={r.starred || isDefault ? "currentColor" : "none"} />
                            </button>
                            {!r.starred && <button className="pd-rec-del" onClick={(e) => { e.preventDefault(); del(r.id); }}
                              title="删除记录"><Trash2 size={11} /></button>}
                          </span>
                        </summary>
                        {summary && <pre className="pd-wb-summary">{summary}</pre>}
                        <button className="pd-cta inline"
                          onClick={() => meta && goto(`/crossborder/workbench/${meta.slug}/?snap=${encodeURIComponent(r.id)}`)}>
                          <ExternalLink size={12} /> 带这一版回工作台
                        </button>
                      </details>
                    );
                  }} />
                </div>
                );
              })}
            </section>
          )}

          {/* 竞品组 */}
          <section className="pd-sec">
            <RivalPanel product={product} />
          </section>
        </div>

        <div className="drawer-foot pd-foot">
          <button className="my-act danger" onClick={onDelete}><Trash2 size={13} /> 删除商品</button>
          <span className="pd-foot-gap" />
          {/* 这个按钮跳的是**深度研究**。原来写着「口碑洞察」,而上面下拉里的
              「口碑洞察」跳的是工作台 —— 同一个抽屉里同名两个目的地。 */}
          <button className="my-act" onClick={onResearch}><Telescope size={13} /> 深度研究</button>
          <OpenWithMenu onOpen={(slug) => goto(slug)} />
        </div>
      </aside>
    </>
  );
}
