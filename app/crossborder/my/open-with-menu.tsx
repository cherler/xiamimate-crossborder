"use client";

/**
 * 「带档案进工具」的去处选择。
 *
 * 原来这个按钮写死跳利润计算器 —— 那是当年只有计算器时的默认值,现在档案名下
 * 挂着财务模型、事实库、口碑样本、竞品组,而利润测算只是其中一条路。
 *
 * 默认去处**记在本机、跟着你的习惯走**:第一次是利润测算,你选过别的之后
 * 主按钮就变成那个。比让人每次都点两下强,也比我替所有人猜一个默认强。
 */

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";

export type ToolTarget = { slug: string; name: string; hint: string };

/** 分组:先算钱、再改内容、最后做研究 —— 和工具中心同一个顺序,别让人重新学一遍。 */
export const TOOL_GROUPS: { group: string; items: ToolTarget[] }[] = [
  {
    group: "计算器",
    items: [
      { slug: "/crossborder/tools/profit-calculator", name: "利润测算", hint: "一单赚多少、红线在哪" },
      { slug: "/crossborder/tools/pricing-calculator", name: "定价", hint: "目标净利率倒推售价" },
      { slug: "/crossborder/tools/landed-cost", name: "到岸成本", hint: "关税、头程、尾程摊到单件" },
      { slug: "/crossborder/tools/acos-break-even", name: "ACoS 盈亏平衡", hint: "广告打到多少就亏了" },
      { slug: "/crossborder/tools/dimensional-weight", name: "体积重", hint: "按尺寸算计费重" },
    ],
  },
  {
    group: "工作台",
    items: [
      { slug: "/crossborder/workbench/listing-doctor", name: "Listing 改写", hint: "标题五点按事实重写" },
      // 短名叫「声音洞察」而不是「口碑洞察」:后者与深度研究「商品口碑与需求洞察」
      // 撞名 —— 同一个抽屉里曾经出现两个「口碑洞察」指向不同页面。
      { slug: "/crossborder/workbench/voice-insight", name: "声音洞察", hint: "你手里的评论 → 主题与改动建议" },
      { slug: "/crossborder/workbench/service-copilot", name: "客服回复", hint: "按差评起草回复" },
    ],
  },
  {
    group: "研究",
    items: [
      { slug: "/crossborder/research/product-insight/?from=product", name: "深度研究", hint: "检索公开网络 → 带来源的报告" },
    ],
  },
];

const ALL = TOOL_GROUPS.flatMap((g) => g.items);
const KEY = "xm_cb_open_with";

export function readPreferredTool(): ToolTarget {
  const fallback = ALL[0]!;
  if (typeof window === "undefined") return fallback;
  const saved = window.localStorage.getItem(KEY);
  return ALL.find((t) => t.slug === saved) ?? fallback;
}

function remember(slug: string) {
  try { window.localStorage.setItem(KEY, slug); } catch { /* 无痕模式忽略 */ }
}

export function OpenWithMenu({ onOpen, compact = false }: {
  /** 切为当前商品并跳转 —— 由调用方决定,因为两处的「切当前」时机不同 */
  onOpen: (slug: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<ToolTarget>(ALL[0]!);

  useEffect(() => { setPref(readPreferredTool()); }, []);

  // 点外面收起。不加这个的话菜单会一直挂着,挡住下面的卡片。
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  function go(t: ToolTarget) {
    remember(t.slug);
    setPref(t);
    setOpen(false);
    onOpen(t.slug);
  }

  return (
    <span className={`ow${compact ? " ow-compact" : ""}`} onClick={(e) => e.stopPropagation()}>
      <button className={compact ? "my-act ow-main" : "drawer-confirm ow-main"}
        onClick={() => go(pref)} title={pref.hint}>
        <ExternalLink size={compact ? 13 : 14} /> 带档案进{pref.name}
      </button>
      <button className={`${compact ? "my-act" : "drawer-confirm"} ow-toggle`}
        onClick={() => setOpen((v) => !v)} aria-label="选择其它工具" aria-expanded={open}>
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="ow-menu">
          {TOOL_GROUPS.map((g) => (
            <div key={g.group} className="ow-group">
              <div className="ow-group-name">{g.group}</div>
              {g.items.map((t) => (
                <button key={t.slug} className={`ow-item${t.slug === pref.slug ? " on" : ""}`}
                  onClick={() => go(t)}>
                  <span className="ow-item-name">{t.name}</span>
                  <span className="ow-item-hint">{t.hint}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="ow-foot">选过之后，主按钮就默认去这里</div>
        </div>
      )}
    </span>
  );
}
