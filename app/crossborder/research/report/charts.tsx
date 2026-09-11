"use client";

/**
 * 研究报告图表组件(2026-07-19 图表化改版)。
 *
 * 全部从 report_json 的真实数据渲染,铁律与报告本身一致:
 *  - 长度/大小只编码「样本内真实计数」(证据 ids 的个数),绝不伪装成占比;
 *  - 定性维度(频率/影响 高中低)只做三档定位,图注明写「定性」;
 *  - 证据不足(ids < 2)用空心标记;
 *  - 数据缺失(老报告没有 themes/findings)时组件返回 null,页面自然回落到纯文字。
 * 配色只用两个数据色:teal(正面/主度量)与赭(负面/风险),已过校验脚本;
 * 灰只作参考线与文字,不当数据色。
 */

import type { ReportFindings, ReportTheme } from "../../../../lib/crossborder/research/types";
import { EVIDENCE_KIND_LABEL, type EvidenceKind } from "../../../../lib/crossborder/research/types";

const TEAL = "#0c9488";
const NEG = "#b45309";

/* ---------------- 差异矩阵(竞品对比核心):主体 × 维度 ---------------- */

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  adv: { label: "优", cls: "adv" },
  mid: { label: "中", cls: "mid" },
  weak: { label: "劣", cls: "weak" },
};

export function DiffMatrix({ diff }: { diff?: ReportFindings["diffMatrix"] }) {
  const dm = diff;
  const subjects = (dm?.subjects || []).filter(Boolean);
  const dims = (dm?.dimensions || []).filter(Boolean);
  if (!dm || subjects.length < 2 || dims.length < 2) return null;
  // 格子索引:只有带证据的格子进表;缺失的显式留空(可比性陷阱防护)。
  const cellMap = new Map<string, NonNullable<typeof dm.cells>[number]>();
  for (const c of dm.cells || []) {
    if (c.subject && c.dimension && (c.ids?.length ?? 0) > 0) cellMap.set(`${c.subject}|||${c.dimension}`, c);
  }
  const cov = dm.coverage || {};
  return (
    <figure className="rc-fig">
      <figcaption>差异矩阵 · 主体 × 维度(定性优劣,非参数横评)</figcaption>
      <div className="rr-table-wrap">
        <table className="rc-matrix">
          <thead>
            <tr>
              <th>主体 \ 维度</th>
              {dims.map((d) => <th key={d}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s, i) => {
              const low = (cov[s] ?? 99) < 2;
              return (
                <tr key={s}>
                  <td className="rc-mx-subj">
                    {i === 0 ? <b>{s}</b> : s}
                    {i === 0 && <em> · 我方</em>}
                    {low && <span className="rc-mx-low" title="公开资料有限,该主体对比仅供参考">资料有限</span>}
                  </td>
                  {dims.map((d) => {
                    const c = cellMap.get(`${s}|||${d}`);
                    if (!c) return <td key={d} className="rc-mx-empty" title="该主体×维度公开资料不足,留空">—</td>;
                    const m = VERDICT_META[c.verdict] ?? { label: c.verdict, cls: "mid" };
                    return (
                      <td key={d} className={`rc-mx-cell is-${m.cls}`} title={`${c.note || ""}(${c.ids.length} 来源)`}>
                        <b>{m.label}</b><span>{c.ids.length}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rc-note">
        格 = 该主体在该维度的<b>定性优劣</b>(优/中/劣)+ 证据来源数;空格 <b>—</b> = 该组合公开资料不足,留空不脑补。
        {dm.insufficient ? ` ${dm.insufficient}。` : ""} 这是口碑与定位的定性对比,不是参数横评或实时比价。
      </p>
    </figure>
  );
}

/* ---------------- 证据点阵:1 点 = 1 来源 ---------------- */

export function EvidenceDots({ count, neg, cap = 14 }: { count: number; neg?: boolean; cap?: number }) {
  if (!count || count <= 0) return null;
  const shown = Math.min(count, cap);
  return (
    <span className="rc-dots" title={`${count} 个来源`}>
      {Array.from({ length: shown }).map((_, i) => (
        <i key={i} style={{ background: neg ? NEG : TEAL }} />
      ))}
      {count > cap && <small>+{count - cap}</small>}
    </span>
  );
}

/* ---------------- 覆盖条形图:来源构成(真实计数) ---------------- */

export function CoverageBars({ counts }: { counts?: Partial<Record<EvidenceKind, number>> }) {
  const rows = Object.entries(counts || {})
    .map(([k, v]) => ({ label: EVIDENCE_KIND_LABEL[k as EvidenceKind] ?? k, n: Number(v) || 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 7);
  if (rows.length < 2) return null;
  const max = rows[0].n;
  const H = rows.length * 28;
  return (
    <figure className="rc-fig">
      <figcaption>来源构成(个)</figcaption>
      <svg viewBox={`0 0 440 ${H}`} width="440" height={H} role="img" aria-label="来源渠道构成条形图">
        {rows.map((r, i) => {
          const w = Math.max(10, (r.n / max) * 300);
          const y = i * 28;
          return (
            <g key={r.label}>
              <text x="0" y={y + 15} fontSize="11.5" fill="#3d4a57">{r.label}</text>
              <rect x="96" y={y + 4} width={w} height="14" rx="4" fill={TEAL}>
                <title>{`${r.label} · ${r.n} 个来源`}</title>
              </rect>
              <text x={96 + w + 7} y={y + 15} fontSize="11" fill="#16212c" fontWeight="600">{r.n}</text>
            </g>
          );
        })}
      </svg>
      <p className="rc-note">条长 = 样本内来源个数;不含平台商品页(产品承诺不抓取)。</p>
    </figure>
  );
}

/* ---------------- 正负口碑双向图(主题 × 来源数) ---------------- */

export function DivergingThemes({ themes }: { themes?: ReportTheme[] }) {
  const pos = (themes || []).filter((t) => t.sentiment === "positive" && t.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length).slice(0, 5);
  const neg = (themes || []).filter((t) => t.sentiment === "negative" && t.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length).slice(0, 6);
  if (pos.length + neg.length < 3) return null;
  const max = Math.max(...[...pos, ...neg].map((t) => t.ids.length));
  const rowH = 30;
  const H = (pos.length + neg.length) * rowH + 8;
  const MID = 440;
  const scale = (n: number) => Math.max(14, (n / max) * 235);
  return (
    <figure className="rc-fig">
      <div className="rc-legend">
        <span><i style={{ background: TEAL }} /> 正面主题</span>
        <span><i style={{ background: NEG }} /> 负面主题</span>
        <em>条长 = 样本内来源数</em>
      </div>
      <svg viewBox={`0 0 880 ${H}`} width="880" height={H} role="img" aria-label="正负口碑双向条形图">
        <line x1={MID} y1="4" x2={MID} y2={H - 4} stroke="#dfe4e7" strokeWidth="1.5" />
        {pos.map((t, i) => {
          const y = i * rowH + 6;
          const w = scale(t.ids.length);
          return (
            <g key={t.theme}>
              <rect x={MID + 2} y={y} width={w} height="14" rx="4" fill={TEAL}>
                <title>{`${t.theme} · ${t.ids.length} 来源`}</title>
              </rect>
              <text x={MID + w + 10} y={y + 11.5} fontSize="11.5" fill="#3d4a57">
                {t.theme} <tspan fill="#16212c" fontWeight="600">{t.ids.length}</tspan>
              </text>
            </g>
          );
        })}
        {neg.map((t, i) => {
          const y = (pos.length + i) * rowH + 6;
          const w = scale(t.ids.length);
          return (
            <g key={t.theme}>
              <rect x={MID - 2 - w} y={y} width={w} height="14" rx="4" fill={NEG}>
                <title>{`${t.theme} · ${t.ids.length} 来源`}</title>
              </rect>
              <text x={MID - w - 10} y={y + 11.5} fontSize="11.5" fill="#3d4a57" textAnchor="end">
                {t.theme} <tspan fill="#16212c" fontWeight="600">{t.ids.length}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <p className="rc-note">标注为负面 ≠ 差评占比 —— 仅指样本内出现负面讨论的来源数。</p>
    </figure>
  );
}

/* ---------------- 问题优先级矩阵(频率 × 影响,定性三档) ---------------- */

const LEVEL_POS: Record<string, number> = { low: 0.22, mid: 0.5, high: 0.78 };

export function PriorityMatrix({ negatives }: { negatives?: NonNullable<ReportFindings["voice"]>["negatives"] }) {
  const items = (negatives || []).filter((n) => n.theme).slice(0, 8);
  if (items.length < 2) return null;
  // viewBox 放大到接近渲染宽度(max-width 640),把文字缩放系数压到 ~1,
  // 标签视觉大小才与正文一致(旧版 460→640 放大 1.39×,标签显得偏大)。
  const W = 620, H = 320, L = 66, B = 268, T = 30, R = 596;
  // 同格多点:横向错开圆心防重叠,标签再上下交错 —— 双保险,标签绝不叠字。
  const cellSeen = new Map<string, number>();
  const placed = items.map((n) => {
    const fx = LEVEL_POS[n.freq ?? "mid"] ?? 0.5;
    const fy = LEVEL_POS[n.impact ?? "mid"] ?? 0.5;
    const key = `${fx}-${fy}`;
    const k = cellSeen.get(key) ?? 0;
    cellSeen.set(key, k + 1);
    const cx = L + fx * (R - L) + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * 58;
    const cy = B - fy * (B - T);
    const r = Math.min(16, 7 + n.ids.length * 1.8);
    const weak = n.ids.length < 2;   // 证据不足 → 空心,不下结论
    const labelAbove = k % 2 === 0;  // 同格第 2 个标签翻到圆下方,与第 1 个错开
    return { ...n, cx, cy, r, weak, labelAbove };
  });
  return (
    <figure className="rc-fig">
      <figcaption>问题优先级矩阵 · 频率 × 影响 × 证据</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="问题优先级矩阵">
        <rect x={(L + R) / 2} y={T} width={(R - L) / 2} height={(B - T) / 2} fill="#fbf1e8" rx="10" />
        <text x={R - 6} y={T + 16} fontSize="10" fill={NEG} fontWeight="700" textAnchor="end">优先处理</text>
        <line x1={L} y1={B} x2={R} y2={B} stroke="#dfe4e7" strokeWidth="1.5" />
        <line x1={L} y1={B} x2={L} y2={T} stroke="#dfe4e7" strokeWidth="1.5" />
        <text x={(L + R) / 2} y={H - 8} fontSize="10.5" fill="#8a95a1" textAnchor="middle">观察频率(样本内,低 → 高)</text>
        <text x="24" y={(T + B) / 2} fontSize="10.5" fill="#8a95a1" transform={`rotate(-90 24 ${(T + B) / 2})`} textAnchor="middle">业务影响(低 → 高)</text>
        {placed.map((n) => (
          <g key={n.theme}>
            {n.weak
              ? <circle cx={n.cx} cy={n.cy} r={n.r} fill="none" stroke={NEG} strokeWidth="2"><title>{`${n.theme} · 证据不足(${n.ids.length} 来源),仅作关注项`}</title></circle>
              : <circle cx={n.cx} cy={n.cy} r={n.r} fill={NEG} opacity={n.impact === "high" ? 1 : 0.78}><title>{`${n.theme} · 频率${n.freq} 影响${n.impact} · ${n.ids.length} 来源`}</title></circle>}
            <text x={n.cx} y={n.labelAbove ? n.cy - n.r - 6 : n.cy + n.r + 13} fontSize="10.5" fill={n.weak ? "#8a95a1" : "#16212c"} fontWeight={n.weak ? 400 : 600} textAnchor="middle">{n.theme.slice(0, 8)}</text>
          </g>
        ))}
      </svg>
      <p className="rc-note">位置为定性三档(高/中/低);圆大小 = 证据来源数;<b>空心圈 = 证据不足</b>,只作关注项。</p>
    </figure>
  );
}

/* ---------------- 矩阵的文字兜底:排序表(P0 兜底策略) ---------------- */

const LEVEL_RANK: Record<string, number> = { high: 3, mid: 2, low: 1 };
const LEVEL_TXT: Record<string, string> = { high: "高", mid: "中", low: "低" };

/** 负面问题不足以成矩阵时,按「频率×影响」排序表呈现 —— 无图也有交代。 */
export function PriorityTable({ negatives }: { negatives?: NonNullable<ReportFindings["voice"]>["negatives"] }) {
  const items = (negatives || []).filter((n) => n.theme)
    .sort((a, b) =>
      ((LEVEL_RANK[b.freq ?? "mid"] ?? 2) + (LEVEL_RANK[b.impact ?? "mid"] ?? 2))
      - ((LEVEL_RANK[a.freq ?? "mid"] ?? 2) + (LEVEL_RANK[a.impact ?? "mid"] ?? 2)));
  if (!items.length) return null;
  return (
    <figure className="rc-fig">
      <figcaption>负面问题排序 · 频率 × 影响(定性)</figcaption>
      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>问题</th><th>观察频率</th><th>影响</th><th>证据来源</th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.theme}>
                <td><b>{n.theme}</b></td>
                <td>{LEVEL_TXT[n.freq ?? "mid"] ?? n.freq}</td>
                <td>{LEVEL_TXT[n.impact ?? "mid"] ?? n.impact}</td>
                <td>{n.ids.length} 个</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rc-note">样本不足以成矩阵图,以排序表呈现;频率与影响为样本内定性分档。</p>
    </figure>
  );
}

/* ---------------- 期望落差哑铃图(P1 · 电子):只画真数字 ---------------- */

export function ClaimGap({ gaps }: { gaps?: ReportFindings["claimGaps"] }) {
  const items = (gaps || [])
    .filter((g) => g.attr && Number.isFinite(g.claimedValue) && Number.isFinite(g.observedValue))
    .slice(0, 2);
  if (!items.length) return null;
  return (
    <figure className="rc-fig">
      <figcaption>期望落差 · 宣称口径 vs 样本观察</figcaption>
      {items.map((g) => {
        const max = Math.max(g.claimedValue, g.observedValue) * 1.15 || 1;
        const X = (v: number) => 80 + (v / max) * 300;
        const cx = X(g.claimedValue), ox = X(g.observedValue);
        return (
          <svg key={g.attr} viewBox="0 0 460 92" width="460" height="92" role="img" aria-label={`${g.attr}宣称与观察落差`}>
            <text x="8" y="45" fontSize="11.5" fill="#16212c" fontWeight="650">{g.attr.slice(0, 6)}</text>
            <line x1="76" y1="41" x2="392" y2="41" stroke="#e2e7ea" strokeWidth="2" />
            <line x1={Math.min(cx, ox)} y1="41" x2={Math.max(cx, ox)} y2="41"
              stroke={NEG} strokeWidth="3" strokeDasharray="1 6" strokeLinecap="round" />
            <circle cx={ox} cy="41" r="8" fill={NEG}><title>{g.observedText}</title></circle>
            <circle cx={cx} cy="41" r="8" fill={TEAL}><title>{g.claimedText}</title></circle>
            <text x={ox} y="21" fontSize="11" fill="#16212c" fontWeight="650" textAnchor="middle">
              {g.observedValue}{g.unit || ""}
            </text>
            <text x={ox} y="67" fontSize="9.5" fill="#8a95a1" textAnchor="middle">{g.observedText.slice(0, 12)}</text>
            <text x={cx} y="21" fontSize="11" fill="#16212c" fontWeight="650" textAnchor="middle">
              {g.claimedValue}{g.unit || ""}
            </text>
            <text x={cx} y="67" fontSize="9.5" fill="#8a95a1" textAnchor="middle">{g.claimedText.slice(0, 12)}</text>
            {g.note && <text x="234" y="86" fontSize="10" fill={NEG} textAnchor="middle">{g.note.slice(0, 30)}</text>}
          </svg>
        );
      })}
      <p className="rc-note">两端数值均有证据出处(见来源附录);落差可能源于口径差异,不必然是品质问题。</p>
    </figure>
  );
}

/* ---------------- 竞品定位图(P1 · 电子/家居):轴来自品类候选 ---------------- */

export function PositionMap({ rivalMap }: { rivalMap?: ReportFindings["rivalMap"] }) {
  const rm = rivalMap;
  const points = (rm?.points || []).filter((p) => p.label).slice(0, 5);
  if (!rm || points.length < 2) return null;
  // 与优先级矩阵同一画布尺寸,两张定位类图视觉一致;标签上下交错防叠字。
  const W = 620, H = 320, L = 66, B = 272, T = 26, R = 596;
  const POS: Record<string, number> = { low: 0.2, mid: 0.5, high: 0.8 };
  const seen = new Map<string, number>();
  const placed = points.map((p) => {
    const key = `${p.x}-${p.y}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    return {
      ...p,
      cx: L + (POS[p.x] ?? 0.5) * (R - L) + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 56,
      cy: B - (POS[p.y] ?? 0.5) * (B - T),
      labelAbove: k % 2 === 0,
    };
  });
  return (
    <figure className="rc-fig">
      <figcaption>竞品方向定位 · 定性示意,不指向具体品牌</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="竞品方向定位图">
        <line x1={L} y1={B} x2={R} y2={B} stroke="#dfe4e7" strokeWidth="1.5" />
        <line x1={L} y1={B} x2={L} y2={T} stroke="#dfe4e7" strokeWidth="1.5" />
        <text x={(L + R) / 2} y={H - 8} fontSize="10.5" fill="#8a95a1" textAnchor="middle">{rm.x}(低 → 高)</text>
        <text x="24" y={(T + B) / 2} fontSize="10.5" fill="#8a95a1" transform={`rotate(-90 24 ${(T + B) / 2})`} textAnchor="middle">{rm.y}(弱 → 强)</text>
        {placed.map((p) => (
          <g key={p.label}>
            <circle cx={p.cx} cy={p.cy} r="15" fill={TEAL} opacity=".55">
              <title>{`${p.label}${p.note ? ` · ${p.note}` : ""} · ${p.ids.length} 来源`}</title>
            </circle>
            <text x={p.cx} y={p.labelAbove ? p.cy - 21 : p.cy + 28} fontSize="10.5" fill="#16212c" textAnchor="middle">{p.label.slice(0, 11)}</text>
          </g>
        ))}
      </svg>
      <p className="rc-note">
        轴取自品类候选({rm.x} × {rm.y});坐标为公开讨论的定性三档归纳。
        {rm.reason ? `选轴依据:${rm.reason.slice(0, 60)}` : ""}
      </p>
    </figure>
  );
}

/* ---------------- 购买动机条形图(真实来源计数) ---------------- */

export function MotivationBars({ demand }: { demand?: ReportFindings["demand"] }) {
  const rows = (demand?.motivations || []).filter((m) => m.text && m.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length).slice(0, 5);
  if (rows.length < 2) return null;
  const max = rows[0].ids.length;
  const H = rows.length * 30;
  return (
    <figure className="rc-fig">
      <figcaption>购买动机(提及来源数)</figcaption>
      <svg viewBox={`0 0 440 ${H}`} width="440" height={H} role="img" aria-label="购买动机条形图">
        {rows.map((m, i) => {
          const w = Math.max(14, (m.ids.length / max) * 260);
          const y = i * 30;
          return (
            <g key={m.text}>
              <text x="0" y={y + 15} fontSize="11.5" fill="#3d4a57">{m.text.slice(0, 10)}</text>
              <rect x="130" y={y + 4} width={w} height="15" rx="4" fill={TEAL}>
                <title>{`${m.text} · ${m.ids.length} 个来源提及`}</title>
              </rect>
              <text x={130 + w + 7} y={y + 16} fontSize="11" fill="#16212c" fontWeight="600">{m.ids.length}</text>
            </g>
          );
        })}
      </svg>
      {(demand?.decisionAttrs?.length ?? 0) > 0 && (
        <div className="rc-chips">
          <em>决策关键属性(按讨论热度排序):</em>
          {demand!.decisionAttrs!.slice(0, 6).map((a, i) => <i key={a}><b>{i + 1}</b>{a}</i>)}
        </div>
      )}
    </figure>
  );
}
