"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  FileText,
  Gauge,
  ImagePlus,
  Package,
  Puzzle,
  Search,
  Telescope,
  X,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../site-chrome";
import { SiteLink } from "../site-link";
import {
  CROSSBORDER_TOOLS,
  TOOL_INTENT_KEYWORDS,
} from "../../lib/crossborder/registry";
import { createProductFromRef } from "../../lib/crossborder/products";
import { parseListingRef } from "../../lib/crossborder/asin";
import { sitePath } from "../../lib/site";
import { HeroBubbles } from "./hero-bubbles";
import { LOCAL_RESEARCH_TYPES } from "../../lib/crossborder/research/local";
const WORK = [
  {
    slug: "listing-doctor",
    name: "Listing 检查与事实库",
    note: "核对再发布",
    short: "核对关键词、确认商品事实，编辑并复检文案。",
  },
  {
    slug: "voice-insight",
    name: "评论与竞品样本分析",
    note: "统计有原文",
    short: "导入评论 CSV，按自定义关键词对比问题主题。",
  },
  {
    slug: "service-copilot",
    name: "客服回复工作台",
    note: "模板与检查",
    short: "按售后场景准备中英文回复，检查常见风险表述。",
  },
];

function ResearchRail() {
  const descriptions = {
    voice: "整理评论样本中的需求与问题",
    rival: "对比商品资料与评论主题",
    full: "汇总口碑、竞品与经营假设",
  };
  return (
    <section className="rr-card" aria-labelledby="research-rail-title">
      <h2 className="rr-h" id="research-rail-title">
        <Telescope size={13} /> 深度研究
      </h2>
      <p className="rr-pitch">
        整理采集的商品、评论与补充资料，保留来源，形成研究底稿。自动联网与 AI 生成尚未接入。
      </p>
      {LOCAL_RESEARCH_TYPES.map((r, i) => (
        <div className="rr-tier" key={r.id}>
          <span className="rr-num">{i + 1}</span>
          <div className="rr-tinfo">
            <div className="rr-tn">{r.name}</div>
            <div className="rr-td">{descriptions[r.id]}</div>
          </div>
          <div className="rr-acts">
            <SiteLink
              className="rr-go"
              href={"/crossborder/research/workspace/?type=" + r.id}
              aria-label={"开始整理：" + r.name}
            >
              开始 →
            </SiteLink>
            <SiteLink
              className="rr-sample"
              href={"/crossborder/research/sample/" + r.sample}
              aria-label={"查看样例：" + r.name}
            >
              样例
            </SiteLink>
          </div>
        </div>
      ))}
      <SiteLink className="rr-cta" href="/crossborder/research/">
        了解深度研究 →
      </SiteLink>
    </section>
  );
}

export function CrossborderCenter() {
  const [query, setQuery] = useState("");
  const importHelp = useRef<HTMLDialogElement>(null);
  const q = query.trim().toLowerCase();
  const ref = parseListingRef(query.trim());
  const tools = CROSSBORDER_TOOLS.filter(
    (t) =>
      !q ||
      ref ||
      [t.name, t.short, ...TOOL_INTENT_KEYWORDS[t.id]].some(
        (s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase()),
      ),
  );
  const work = WORK.filter(
    (t) => !q || ref || (t.name + t.short).toLowerCase().includes(q),
  );
  function go() {
    if (ref) {
      createProductFromRef(ref);
      window.location.assign(sitePath("/crossborder/tools/profit-calculator/"));
    } else if (tools[0])
      window.location.assign(sitePath("/crossborder/tools/" + tools[0].slug));
  }
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <SiteHeader />
      <section className="cb-hero">
        <HeroBubbles />
        <div className="cb-brand">
          虾米跨境<em>XIAMIMATE CROSSBORDER</em>
        </div>
        <h1 className="cb-h1-wave">
          把一个商品的账，<b>算清楚。</b>
        </h1>
        <div className="tool-omni">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            placeholder="搜工具、关键词，或贴商品 ASIN 建档"
            aria-label="搜索工具或商品 ASIN"
          />
          <button
            type="button"
            className="omni-run is-go"
            disabled={!q}
            onClick={go}
          >
            {ref ? "建档 →" : "搜索"}
          </button>
        </div>
        <div className="cb-flow" aria-label="每个工具怎么用">
          <button
            type="button"
            className="cb-flow-shot"
            aria-haspopup="dialog"
            onClick={() => importHelp.current?.showModal()}
          >
            <ImagePlus size={12} /> 有截图 / 表格？上传交给 AI 读取 →
            <small className="cb-flow-status">未接入</small>
          </button>
          <span className="cb-flow-div" aria-hidden="true" />
          <span className="cb-fs"><b>料</b> 贴报价 / 截图</span>
          <span className="cb-ar" aria-hidden="true">→</span>
          <span className="cb-fs"><b>AI 读取</b> 带原文</span>
          <span className="cb-ar" aria-hidden="true">→</span>
          <span className="cb-fs"><b>你确认</b> 未确认不进</span>
          <span className="cb-ar" aria-hidden="true">→</span>
          <span className="cb-fs"><b>固定公式算</b> 可核对</span>
        </div>
      </section>
      <div className="cb-board">
        <div className="cb-main">
          <section className="cb-section">
            <div className="cb-section-head">
              <h2>计算工具</h2>
              <small>5 个 · 同一份商品档案，处处复用</small>
            </div>
            <div className="tc-grid">
              {!q && (
                <SiteLink className="acard" href="/crossborder/assess/">
                  <Gauge size={23} />
                  <span className="ac-copy">
                    <b>综合测算 · 一页把账走完</b>
                    <span>成本底盘、单件利润、广告红线与定价空间。</span>
                  </span>
                  <ArrowRight size={16} />
                </SiteLink>
              )}
              {tools.map((t) => (
                <SiteLink
                  key={t.id}
                  className="tcard"
                  href={"/crossborder/tools/" + t.slug}
                >
                  <div className="tc-head">
                    <span className="tc-icon">
                      <t.icon size={19} />
                    </span>
                    <span className="tc-title">
                      <b>{t.name}</b>
                      <span>{t.category}</span>
                    </span>
                  </div>
                  <p>{t.short}</p>
                  <span className="tc-go">开始算 →</span>
                </SiteLink>
              ))}
            </div>
          </section>
          <section className="cb-section">
            <div className="cb-section-head">
              <h2>跨境工作台</h2>
              <small>本地处理 · 可核对，可保存</small>
            </div>
            <div className="tc-grid">
              {work.map((t) => (
                <SiteLink
                  key={t.slug}
                  className="tcard is-wb"
                  href={"/crossborder/workbench/" + t.slug}
                >
                  <div className="tc-head">
                    <span className="tc-icon">
                      <FileText size={19} />
                    </span>
                    <span className="tc-title">
                      <b>{t.name}</b>
                      <span>{t.note}</span>
                    </span>
                  </div>
                  <p>{t.short}</p>
                  <span className="tc-go">进入工作台 →</span>
                </SiteLink>
              ))}
            </div>
            {q && !tools.length && !work.length && !LOCAL_RESEARCH_TYPES.some(t => (t.name + t.description + "深度研究").includes(q)) && (
              <p className="cb-empty">
                没有匹配的工具，试试「利润」「广告」「评论」或「客服」。
              </p>
            )}
          </section>
        </div>
        <aside className="cb-rail">
          <ResearchRail />
          <div className="cb-rail-panel basics-rail">
            <div className="rail-head">
              <h3>浏览器扩展</h3>
              <small>商品与评论采集</small>
            </div>
            <SiteLink className="basics-item" href="/extension/">
              <Puzzle size={15} />
              <div>
                <b>虾米跨境采集助手</b>
                <span>把 Amazon、TikTok Shop 的商品与评论样本带回本地，接着做分析和研究。</span>
              </div>
            </SiteLink>
            <SiteLink className="basics-item" href="/extension/import/">
              <FileText size={15} />
              <div><b>导入采集文件 →</b></div>
            </SiteLink>
          </div>
          <div className="rr-card">
            <div className="rr-h">
              <Package size={15} /> 我的商品
            </div>
            <p className="rr-pitch">
              从一份成本模型开始，把测算快照、商品事实和工作台记录留在一起。
            </p>
            <SiteLink className="rr-cta" href="/crossborder/my/">
              管理档案 / 导出备份 →
            </SiteLink>
          </div>
          <div className="cb-rail-panel basics-rail">
            <div className="rail-head">
              <h3>跨境基础</h3>
            </div>
            <SiteLink className="basics-item" href="/crossborder/wiki/">
              <BookOpen size={16} />
              <div>
                <b>名词与常识</b>
                <span>从 ACoS、FBA 到 VAT，查完就能算。</span>
              </div>
            </SiteLink>
            <SiteLink className="basics-item" href="/crossborder/guide/">
              <BookOpen size={16} />
              <div>
                <b>新手入门教程</b>
                <span>从选品到运营的 90 天行动路线。</span>
              </div>
            </SiteLink>
            <SiteLink
              className="basics-item"
              href="/crossborder/research/sample/"
            >
              <FileText size={16} />
              <div>
                <b>研究报告样例</b>
                <span>了解证据、竞品和风险的组织方式。</span>
              </div>
            </SiteLink>
          </div>
        </aside>
      </div>
      <dialog ref={importHelp} className="home-import-dialog" aria-labelledby="home-import-title">
        <div className="home-import-head">
          <h2 id="home-import-title">商品资料导入</h2>
          <button type="button" aria-label="关闭资料导入说明" onClick={() => importHelp.current?.close()}>
            <X size={18} />
          </button>
        </div>
        <p className="local-note">截图与报价的 AI 读取尚未接入。当前可以导入评论表格、插件采集文件，或手动核对报价后填入计算器。</p>
        <div className="local-actions">
          <SiteLink href="/crossborder/workbench/voice-insight/">上传评论 CSV</SiteLink>
          <SiteLink href="/extension/import/">导入插件采集文件</SiteLink>
          <SiteLink href="/crossborder/tools/profit-calculator/">手动填写报价参数</SiteLink>
        </div>
      </dialog>
      <SiteFooter />
    </main>
  );
}
