/**
 * 平台预设 —— 同一套引擎,换一套说法和默认值。
 *
 * 五个计算器此前一个平台概念都没有,字段名与默认值全是亚马逊心智
 * (「尾程 / FBA」「点击数」「ACoS」)。而 TikTok Shop 的经营形态不同:
 * 主要自发货、内容驱动、达人分佣是定义性成本 —— 亚马逊完全没有这个概念,
 * 所以现有界面里没有任何东西提示卖家去算这笔钱。
 *
 * **引擎不动**:达人佣金 = pct_sales 积木、样品成本 = batch_alloc 积木,
 * 成本积木系统本来就表达得了。缺的只是「有人告诉他该加这两块」。
 *
 * 费率一律当**占位值**处理,不当行情:
 * TikTok Shop 美区佣金两年里从 2% 调到 6% 再到 8%,而达人佣金是按类目和
 * 达人逐个议价的。写死一个数比不写更危险 —— 用户会以为那是我们查证过的。
 * 所以每份预设都带 asOf 与一句「口径提醒」,并且全部可改。
 */

import type { CostPreset } from "./cost-model";

export type PlatformKey = "amazon" | "tiktok";

/** 从 marketplace(如 amazon-us / tiktok-uk)认出平台。认不出按亚马逊 —— 那是现状。 */
export function platformOf(marketplace: string | null | undefined): PlatformKey {
  return String(marketplace || "").toLowerCase().startsWith("tiktok") ? "tiktok" : "amazon";
}

export type PlatformPreset = {
  key: PlatformKey;
  name: string;
  /** 字段改名:只列与默认不同的。 */
  labels: Partial<Record<string, string>>;
  /** 字段补充说明:平台差异最容易踩的地方。 */
  hints: Partial<Record<string, string>>;
  /** 默认值:仅在用户没动过该字段时作为起点。 */
  defaults: Partial<Record<string, number>>;
  /** 该平台特有、但用户多半想不到要加的成本 —— 主动提示他。 */
  suggestedBlocks: CostPreset[];
  /** 费率口径的更新日期与出处提醒。展示在界面上,不藏。 */
  asOf: string;
  rateNote: string;
};

/**
 * TikTok 特有成本积木。
 *
 * **达人佣金不在这里** —— 它已升为一等字段(ProfitValues.affiliateRate)。
 * 原因:积木不参与跨工具复用,定价倒推与 ACoS 保本线都读不到它,
 * 而那两处恰恰最需要。放在这里会造成「利润页算了、定价页没算」的两套口径,
 * 而且用户看不出来。留成积木还会与字段重复计费。
 */
export const TIKTOK_BLOCKS: CostPreset[] = [
  {
    key: "sample_cost",
    name: "寄样成本",
    category: "促销与销售",
    type: "batch_alloc",
    kind: "cost",
    params: { total: 300, batchUnits: 200 },
    note: "寄给达人的样品(货值 + 运费)÷ 这批样品预计带来的订单数。带不动货的样品也要算进来,否则这笔钱会凭空消失。",
  },
];

export const PLATFORM_PRESETS: Record<PlatformKey, PlatformPreset> = {
  amazon: {
    key: "amazon",
    name: "亚马逊",
    labels: {},
    hints: {},
    defaults: {},
    suggestedBlocks: [],
    asOf: "",
    rateNote: "",
  },
  tiktok: {
    key: "tiktok",
    name: "TikTok Shop",
    labels: {
      // FBA 是亚马逊的说法;TikTok 以自发货为主,FBT 只在部分市场提供
      lastMile: "尾程运费",
      commission: "平台佣金",
    },
    /*
     * 字段下面的一行小字。**每条只写一句、越短越好。**
     *
     * 第一版是按文档的长度写的(每条三四十字),放进输入框下面就是一堵废话墙,
     * 而且五个字段挨在一起,读起来比没有更累 —— 用户是来填数的,不是来读说明的。
     * 判据:这句话能不能防住一个**具体的算错**?防不住就别写。
     * 所以 lastMile 那条删了(「填你实际的快递成本」等于没说)。
     *
     * 更长的口径解释放在参数区顶部那条 rateNote 里,那里只出现一次。
     */
    hints: {
      commission: "按类目浮动,以你后台为准",
      ads: "只填广告花费,达人分佣填下面那项",
      affiliateRate: "逐个达人议价,默认值只是起点;亚马逊填 0",
    },
    defaults: {
      // 起点值,不是行情。用户一改就以他的为准。
      commission: 8,
      refund: 5,           // 内容驱动的冲动下单,退货率通常高于亚马逊
      affiliateRate: 10,   // 达人分佣按类目和达人逐个议价,10% 只是起点
    },
    suggestedBlocks: TIKTOK_BLOCKS,
    asOf: "2026-08",
    rateNote:
      "以上默认值是**起点占位**,不是我们查证过的行情。TikTok Shop 的佣金两年里从 2% 调到 6% 再到 8%," +
      "达人佣金更是按类目和达人逐个议价 —— 请以你后台和实际谈的为准。",
  },
};

/**
 * 商品编号在这个平台上叫什么。
 *
 * 「ASIN」是亚马逊的词。TikTok Shop 的商品号写成「ASIN 1731873437826453780」
 * 会让人以为我们把平台认错了 —— 与之前「亚马逊挑过的评论」出现在 TikTok 采集上
 * 是同一族问题:文案写死了单一平台。
 */
export function externalIdLabel(marketplace: string | null | undefined): string {
  return platformOf(marketplace) === "tiktok" ? "商品编号" : "ASIN";
}

export function presetFor(marketplace: string | null | undefined): PlatformPreset {
  return PLATFORM_PRESETS[platformOf(marketplace)];
}

/** 套用平台改名:没有覆盖的字段保持原样。 */
export function labelFor(preset: PlatformPreset, key: string, fallback: string): string {
  return preset.labels[key] ?? fallback;
}
