/**
 * 本地分析。全部在你自己的浏览器里算,不发给任何人、不消耗积分。
 *
 * 刻意只做「页面上摆着但要人肉换算才看得出」的判断,不做需要外部数据的估算
 * (月销量、关键词排名之类)。那些做不准,而一个看起来精确的错数字
 * 比没有数字更容易让人做错决定。
 *
 * 另一条同样重要:**不预设这是谁的商品**。用户可能在看竞品,也可能在看
 * 自己的 listing —— 所以只陈述事实与它的含义,不替他判断「这对你是机会
 * 还是麻烦」。色彩表示这个 listing 健不健康,而不是「对你是好是坏」。
 */
import { type Capture } from "../adapters/index";

export type Note = {
  tone: "good" | "warn" | "info";
  text: string;
};

/** 上架日期原文 → 距今月数。各站点日期写法差别大,认不出就返回 null,不猜。 */
export function monthsSince(raw: string | undefined, now = new Date()): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return diffMonths(new Date(t), now);
  // "15. Januar 2023" / "2023年1月15日" / "2024/3/3" —— 退而求其次只找年份
  const year = raw.match(/(19|20)\d{2}/);
  if (!year) return null;
  const month = raw.match(/(\d{1,2})\s*月/) ?? raw.match(/[.\/-](\d{1,2})[.\/-]/);
  const m = month?.[1] ? Number(month[1]) - 1 : 0;
  return diffMonths(new Date(Number(year[0]), m, 1), now);
}

function diffMonths(from: Date, to: Date): number | null {
  if (from > to) return null;
  return Math.max(0, (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth());
}

/** 大类排名原文里的名次数字。"#1,247 in Home & Kitchen" / "Nr. 3.412 in Küche" */
export function bsrRank(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/[#Nn][ro]?\.?\s*([\d.,]+)/) ?? raw.match(/([\d.,]{2,})/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/[.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function analyze(c: Capture, now = new Date()): Note[] {
  const notes: Note[] = [];
  const f = c.fields;

  /*
   * 口吻与色彩:描述**这个 listing 本身的状况**,不是「你的机会」。
   *
   * 原来的文案是站在「我在看竞品、要不要进这个类目」的视角写的 ——
   * 「对手没上 FBA,有可乘之机」「评分偏低,值得切入」(还标成绿色)。
   * 可用户完全可能采集的是**自己的商品**,那时这些话既冒犯又误导:
   * 自家评分低被标成绿色的好消息,是彻头彻尾的错。
   *
   * 改成:tone 表示这个 listing 健不健康(评分低 = warn,不论是谁的),
   * 文字只陈述事实与它的含义,不替用户判断「这对你是机会还是麻烦」——
   * 我们并不知道他是卖家还是选品的人。
   */

  // 口碑体量:决定后来者能不能在评价数上追平
  if (f.reviewCount !== undefined) {
    if (f.reviewCount >= 5000) {
      notes.push({ tone: "info", text: `评价 ${f.reviewCount.toLocaleString()} 条 —— 口碑体量大,短期内很难在评价数上被追平` });
    } else if (f.reviewCount < 100) {
      notes.push({ tone: "info", text: `评价仅 ${f.reviewCount} 条 —— 体量还小,口碑结论也不够稳` });
    } else {
      notes.push({ tone: "info", text: `评价 ${f.reviewCount.toLocaleString()} 条` });
    }
  }

  // 评分低而样本足够 = 这个 listing 有确实存在的问题,与它属于谁无关
  if (f.rating !== undefined && f.reviewCount !== undefined && f.reviewCount >= 50) {
    if (f.rating <= 4.0) {
      notes.push({ tone: "warn", text: `评分 ${f.rating},样本 ${f.reviewCount.toLocaleString()} 条 —— 差评里通常有反复出现的具体问题` });
    } else if (f.rating >= 4.7) {
      notes.push({ tone: "good", text: `评分 ${f.rating} —— 满意度很高,差异点大概率不在基础体验上` });
    }
  }

  const months = monthsSince(f.firstAvailable, now);
  if (months !== null) {
    if (months <= 6) notes.push({ tone: "info", text: `上架约 ${months} 个月 —— 新品能跑到这个位置,类目仍在流动` });
    else if (months >= 60) notes.push({ tone: "info", text: `上架超过 ${Math.floor(months / 12)} 年 —— 累积数据多,但不代表当下的竞争态势` });
    else notes.push({ tone: "info", text: `上架约 ${months} 个月` });
  }

  const rank = bsrRank(f.bsr);
  if (rank !== null) {
    notes.push({
      tone: "info",
      text: rank <= 1000
        ? `大类排名 #${rank.toLocaleString()} —— 头部位置`
        : `大类排名 #${rank.toLocaleString()}`,
    });
  }

  // 履约方式只陈述事实。谁受益取决于你站在哪一边,那不该由我们替你说
  if (f.fulfillmentType === "亚马逊自营") {
    notes.push({ tone: "info", text: "亚马逊自营 —— 买家框通常由亚马逊占据" });
  } else if (f.fulfillmentType === "FBA") {
    notes.push({ tone: "info", text: "FBA 发货 —— 配送时效由亚马逊承担" });
  } else if (f.fulfillmentType === "FBM") {
    notes.push({ tone: "info", text: "FBM 自发货 —— 配送时效由卖家自己控制" });
  }

  // 这条与视角无关:抓不到就是抓不到,谁的商品都得核对
  if (c.missingFields.length) {
    notes.push({
      tone: "warn",
      text: `有 ${c.missingFields.length} 项没抓到(${c.missingFields.join("、")}) —— 页面结构可能变了,导入前请核对`,
    });
  }
  return notes;
}
