/**
 * 商品项目与事实库。纯数据 + 纯函数，本轮只定义结构，尚未接线。
 *
 * 这是 Listing 工作台与普通 AI 对话框的根本差别：对话框会顺嘴补出「防水」「医用级」
 * 「终身质保」，而这里每一条事实都必须有来源与状态，未确认的不得写进成品。
 *
 * 设计沿用站内已经跑通的两套先例，不另起炉灶：
 * - 确认流程沿用智能读取：AI 识别 → 展示来源与缺口 → 用户确认才生效，字段标注来源。
 *   （见 import-config.ts 的字段声明与 tool-kit.tsx 的 useToolImport）
 * - 存取与版本守卫沿用 product-model.ts：sanitize 后再用，版本不认识就不用。
 *
 * 关键约束：writableFacts() 是白名单。成品文案只能引用它返回的事实；
 * blockedFacts() 里的东西，AI 一个字都不许写。
 *
 * 与 product-model.ts（计算类工具的共享商品模型）刻意不合并：
 * 那边是纯财务数字，填错只是自己屏幕上算错一个数，所以 sanitize 遇到垃圾直接回退默认值；
 * 这边是会被发布出去的对外声明，填错就是虚假宣传。两者错误代价不同，
 * 保证级别就不能混。将来若要统一，统一的是「商品项目」这个身份，不是字段表。
 */

import * as productStore from "./products";
import {
  emptySnapshot, sanitizeSnapshot, type PolicySnapshot,
} from "./policy-snapshot";

/** v2：项目开始持有诊断的对象（现有 Listing、关键词）与政策快照。 */
export const PRODUCT_PROJECT_VERSION = 2;


/** 事实的可信状态。只有 confirmed 能写进成品。 */
export type FactStatus =
  | "confirmed"    // 用户已确认，或来自权威资料且经用户核对
  | "unconfirmed"  // AI 从资料里提取到，但用户还没确认
  | "unknown"      // 资料里没有 —— 显式记下来，防止 AI 顺嘴补上
  | "conflicting"; // 多份资料互相打架，必须人工裁决

/** 事实从哪来。用于展示依据，也用于判断可信度。 */
export type FactSource =
  | "user"       // 用户手填
  | "document"   // 规格书 / 说明书 / 报价单
  | "listing"    // 现有 Listing / ASIN 页面
  | "image"      // 商品图 / 截图
  | "inferred";  // AI 推断 —— 永远不能直接算 confirmed

export type Confidence = "high" | "medium" | "low";

export type ProductFact = {
  key: string;          // 稳定标识，如 material / waterproof / dimensions
  label: string;        // 材质 / 防水等级 / 尺寸
  value: string;        // unknown 时为空字符串
  status: FactStatus;
  source: FactSource;
  sourceNote: string;   // 出处：「规格书第 2 页」「用户填写」「未找到」
  /** 资料原文。sourceNote 说的是从哪来，这里是资料到底怎么写的 —— 用户据此核对。 */
  sourceQuote?: string;
  confidence: Confidence;
  updatedAt: number;
};

/** 现有 Listing —— 诊断的对象。 */
export type ListingDraft = { title: string; bullets: string[] };

/**
 * 一个商品项目。事实、待诊断的 Listing、关键词、政策快照都挂在这里 ——
 * 诊断要可复现、可分享，就不能一半状态在项目里、一半飘在页面上。
 */
export type ProductProject = {
  id: string;
  name: string;
  marketplace: string;  // 站点，如 amazon-us —— 政策与规则按站点而异
  category: string;     // 类目，影响标题规则与合规判断
  facts: ProductFact[];
  listing: ListingDraft;
  /** 用户自己上传的关键词。我们没有搜索量数据，只核对有没有写进去。 */
  keywords: string[];
  snapshot: PolicySnapshot;
  version: number;
  updatedAt: number;
};

/* ---------------- 标准事实槽位 ---------------- */

/**
 * 一条 Listing 通常要说清楚的事实。预先列出来，是为了让「资料里没有」变成
 * 一个显式的 unknown 槽位，而不是一个没人注意到的空白 —— AI 最爱往空白里填东西。
 * risky 的槽位一旦写错就是虚假宣传或合规问题，UI 要额外警示。
 */
export type FactSlot = {
  key: string;
  label: string;
  hint: string;
  /**
   * 文案里出现这些词，就等于在声称这条事实。
   * 必须含英文 —— Listing 是写给英文买家的，标题写的是 Waterproof 而不是「防水」，
   * 只拿中文 label 去匹配，这项检查在真实文案上一次都不会触发。
   * 只放能独立指代该事实的词：放 "water" 会把 "water bottle" 误判成防水声明。
   */
  aliases: string[];
  /** 写错会构成虚假宣传 / 合规风险的槽位。 */
  risky?: boolean;
};

// 商品名称不在槽位里：它是项目身份（ProductProject.name），不是一条对外声明。
// 放进来会出现「标题栏显示 HydraPeak、槽位却说资料里没有」的自相矛盾。
export const FACT_SLOTS: FactSlot[] = [
  {
    key: "material", label: "材质", hint: "如 304 不锈钢 / 食品级硅胶", risky: true,
    aliases: ["材质", "不锈钢", "stainless steel", "silicone", "食品级", "food grade", "food-grade", "bpa free", "bpa-free"],
  },
  {
    key: "dimensions", label: "商品尺寸", hint: "长 × 宽 × 高，注明单位（不是包装尺寸）",
    aliases: ["尺寸", "dimensions"],
  },
  {
    key: "weight", label: "商品重量", hint: "注明单位（不是含包装重量）",
    aliases: ["重量", "weighs", "lightweight", "轻便"],
  },
  {
    key: "capacity", label: "容量 / 规格", hint: "如 32oz / 500ml",
    aliases: ["容量", "capacity"],
  },
  {
    key: "color", label: "颜色 / 款式", hint: "在售的全部变体",
    aliases: ["颜色", "colors", "colours"],
  },
  {
    key: "package_contents", label: "包装内含", hint: "开箱后到手的全部物品",
    aliases: ["包装内含", "includes", "what's in the box", "package includes"],
  },
  {
    key: "audience", label: "适用人群", hint: "谁会买、给谁用",
    aliases: ["适用人群", "perfect for", "ideal for"],
  },
  {
    key: "scenario", label: "使用场景", hint: "在什么情况下用",
    aliases: ["使用场景", "健身", "通勤", "户外", "gym", "commute", "outdoor", "camping"],
  },
  {
    key: "care", label: "清洁 / 保养方式", hint: "如可否洗碗机、手洗",
    aliases: ["清洁", "手洗", "洗碗机", "dishwasher", "hand wash", "hand-wash", "easy to clean"],
  },
  {
    key: "certification", label: "认证", hint: "如 FDA / CE / BPA-Free —— 必须有证书佐证", risky: true,
    aliases: ["认证", "certified", "certification", "fda approved", "rohs", "iso 9001"],
  },
  {
    key: "waterproof", label: "防水 / 防护等级", hint: "如 IPX7；water-resistant 与 waterproof 不是一回事", risky: true,
    aliases: ["防水", "防泼水", "防漏", "waterproof", "water resistant", "water-resistant", "ipx", "ip67", "leak proof", "leakproof"],
  },
  {
    key: "warranty", label: "质保", hint: "期限与范围，必须与实际承诺一致", risky: true,
    aliases: ["质保", "保修", "终身", "warranty", "lifetime", "guarantee", "guaranteed"],
  },
  {
    key: "compatibility", label: "兼容性", hint: "适配哪些机型 / 尺寸", risky: true,
    aliases: ["兼容", "适配", "compatible", "fits", "universal"],
  },
];

export function slotByKey(key: string): FactSlot | undefined {
  return FACT_SLOTS.find((s) => s.key === key);
}

/**
 * 未知事实：显式记下来，好让「没有」也是一条事实，而不是一个可被填补的空白。
 * 只要 key 与 label —— 调用方不必为了退回一条未知事实去凑一个完整槽位。
 */
export function unknownFact(slot: Pick<FactSlot, "key" | "label">): ProductFact {
  return {
    key: slot.key, label: slot.label, value: "",
    status: "unknown", source: "inferred", sourceNote: "资料中未找到",
    confidence: "low", updatedAt: 0,
  };
}

/**
 * 判断模型返回的是「这个字段没有资料」，而不是真正的商品事实。
 *
 * 不能只靠提示词：模型偶尔会把 “No warranty information is provided”
 * 当成质保值原样抽回来。这样的句子有原文证据，却没有可用于 Listing 的事实值，
 * 应继续保持 unknown。匹配刻意要求 information / 资料 / 说明等缺失语义，
 * 避免误伤 “No warranty”（明确无质保）、“Not dishwasher safe”（明确禁用）
 * 和 “BPA-Free”（明确认证声明）这类真正的否定事实。
 */
export function isMissingFactValue(value: string): boolean {
  const normalized = String(value || "")
    .trim()
    .replace(/[.。;；]+$/u, "")
    .replace(/\s+/g, " ");
  if (!normalized) return true;

  const lower = normalized.toLowerCase();
  if (/^(?:n\/?a|not applicable|unknown|unspecified|not specified|not stated|not provided|not available|not disclosed|not mentioned|none)$/i.test(lower)) {
    return true;
  }
  if (/^[^:：]{1,60}[:：]\s*(?:n\/?a|unknown|unspecified|not specified|not stated|not provided|not available|not disclosed|not mentioned|none)$/i.test(normalized)) {
    return true;
  }
  if (/^no\s+(?:information|details?|data|specifications?)(?:\s+(?:is|are))?\s+(?:provided|available|stated|specified|listed|disclosed|mentioned|given)$/i.test(lower)) {
    return true;
  }
  if (/^no\s+.+\s+(?:information|details?|data|specifications?)(?:\s+(?:is|are))?\s+(?:provided|available|stated|specified|listed|disclosed|mentioned|given)$/i.test(lower)) {
    return true;
  }
  if (/^.+\s+(?:information|details?|data|specifications?)\s+(?:is|are)\s+not\s+(?:provided|available|stated|specified|listed|disclosed|mentioned|given)$/i.test(lower)) {
    return true;
  }

  if (/^(?:未知|不详|不适用|未提供|未说明|未注明|未提及|暂无资料|暂无信息|没有提供)(?:相关)?(?:信息|资料|说明|数据|规格)?$/u.test(normalized)) {
    return true;
  }
  if (/^[^:：]{1,40}[:：]\s*(?:未知|不详|不适用|未提供|未说明|未注明|未提及|暂无资料|暂无信息|没有提供)$/u.test(normalized)) {
    return true;
  }
  return /^(?:未|没有|暂无|无).{0,60}(?:信息|资料|说明|数据|规格)(?:可用|提供|注明|说明|披露|提及|记录)?$/u.test(normalized)
    || /^.{1,60}(?:信息|资料|说明|数据|规格)(?:未|没有)(?:提供|注明|说明|披露|提及|记录)$/u.test(normalized);
}

export function emptyProject(id: string, name: string): ProductProject {
  return {
    id, name, marketplace: "amazon-us", category: "",
    facts: [], listing: { title: "", bullets: [] }, keywords: [],
    snapshot: emptySnapshot(), version: PRODUCT_PROJECT_VERSION, updatedAt: 0,
  };
}

/** 盖上改动时间。散落各处的 updatedAt: Date.now() 收敛到这里。 */
export function touch(project: ProductProject): ProductProject {
  return { ...project, updatedAt: Date.now() };
}

/** 建一个把全部标准槽位都摊开为 unknown 的项目。 */
export function seededProject(id: string, name: string): ProductProject {
  return { ...emptyProject(id, name), facts: FACT_SLOTS.map(unknownFact) };
}

/**
 * 把抽取到的事实并入项目：命中已有 key 就更新，否则追加。
 * 一律落成 unconfirmed —— 抽取不等于确认，用户逐条点头才算数。
 */
export function mergeExtracted(project: ProductProject, incoming: ProductFact[], now = Date.now()): ProductProject {
  const facts = project.facts.map((f) => ({ ...f }));
  for (const inc of incoming) {
    const i = facts.findIndex((f) => f.key === inc.key);
    // 用户已确认的事实优先于模型的任何再次抽取，包括模型误报的「资料未提供」。
    if (i >= 0 && facts[i].status === "confirmed") continue;

    // 「没有该字段的资料」不是一个待确认的商品事实。标准槽位退回 unknown；
    // 自定义槽位则直接忽略，避免凭空多出一条“未提供 XX 信息”。
    if (isMissingFactValue(inc.value)) {
      const slot = slotByKey(inc.key);
      if (!slot) continue;
      const nextUnknown = { ...unknownFact(slot), updatedAt: now };
      if (i >= 0) facts[i] = nextUnknown;
      else facts.push(nextUnknown);
      continue;
    }

    const next: ProductFact = { ...inc, status: "unconfirmed", updatedAt: now };
    if (i >= 0) {
      // 已确认的事实不被抽取结果覆盖：用户的确认优先于模型的再次猜测。
      facts[i] = next;
    } else {
      facts.push(next);
    }
  }
  return { ...project, facts, updatedAt: now };
}

/* ---------------- 存取:委托到商品实体仓(products.ts) ----------------
 * 事实库项目 = 「当前商品」的 project 字段;签名不变,调用方零改动。
 * 与 products.ts 互相引用:双方只在函数体内取用对方,ESM 循环引用安全。 */

export function readProject(): ProductProject | null {
  if (typeof window === "undefined") return null;
  const raw = productStore.currentProject();
  return raw ? sanitizeProject(raw) : null;
}

export function writeProject(project: ProductProject): void {
  if (typeof window === "undefined") return;
  productStore.writeCurrentProject(project);
  if (productStore.isCloudEnabled()) productStore.schedulePush();
}

export function clearProject(): void {
  if (typeof window === "undefined") return;
  productStore.clearCurrentProject();
  if (productStore.isCloudEnabled()) productStore.schedulePush();
}

/* ---------------- 白名单：谁能写进成品 ---------------- */

/** 只有已确认、且有值的事实能被文案引用。 */
export function isWritable(fact: ProductFact): boolean {
  return fact.status === "confirmed" && fact.value.trim().length > 0;
}

export function writableFacts(project: ProductProject): ProductFact[] {
  return project.facts.filter(isWritable);
}

/** 明确禁止 AI 自行补充的事实：未确认、未知、或有冲突。 */
export function blockedFacts(project: ProductProject): ProductFact[] {
  return project.facts.filter((f) => !isWritable(f));
}

/**
 * 成品里出现了不该出现的事实，就是幻觉。
 * 用事实的 label 与 value 在文案里做朴素匹配 —— 确定性检查，
 * 不依赖模型自觉。语义级的核查另需人工或二次校验，这里只兜住最明显的一类。
 */
export function violatingFacts(project: ProductProject, copy: string): ProductFact[] {
  const text = copy.toLowerCase();
  return blockedFacts(project).filter((f) => {
    const needle = (f.value.trim() || f.label).toLowerCase();
    return needle.length > 1 && text.includes(needle);
  });
}

/** 事实库的完成度：还有多少条没确认。用于提示「资料还不够，先别急着生成」。 */
export type FactCoverage = {
  total: number;
  confirmed: number;
  pending: number;   // unconfirmed + conflicting
  unknown: number;
  ratio: number;     // confirmed / total
};

export function factCoverage(project: ProductProject): FactCoverage {
  const total = project.facts.length;
  const confirmed = project.facts.filter((f) => f.status === "confirmed").length;
  const unknown = project.facts.filter((f) => f.status === "unknown").length;
  const pending = project.facts.filter((f) => f.status === "unconfirmed" || f.status === "conflicting").length;
  return { total, confirmed, pending, unknown, ratio: total > 0 ? confirmed / total : 0 };
}

/* ---------------- 存取守卫（沿用 product-model 的做法） ---------------- */

const STATUSES: FactStatus[] = ["confirmed", "unconfirmed", "unknown", "conflicting"];
const SOURCES: FactSource[] = ["user", "document", "listing", "image", "inferred"];
const CONFIDENCES: Confidence[] = ["high", "medium", "low"];

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function sanitizeFact(raw: unknown): ProductFact | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !r.key) return null;

  const status = STATUSES.includes(r.status as FactStatus) ? (r.status as FactStatus) : "unconfirmed";
  const source = SOURCES.includes(r.source as FactSource) ? (r.source as FactSource) : "inferred";
  return {
    key: r.key,
    label: str(r.label, r.key),
    value: str(r.value),
    // 认不出的状态一律降级为未确认，绝不默认 confirmed —— 宁可多问一次，也不放行幻觉。
    status,
    source,
    sourceNote: str(r.sourceNote, "未标注来源"),
    sourceQuote: typeof r.sourceQuote === "string" ? r.sourceQuote.slice(0, 200) : undefined,
    confidence: CONFIDENCES.includes(r.confidence as Confidence) ? (r.confidence as Confidence) : "low",
    updatedAt: Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : 0,
  };
}

export function sanitizeProject(raw: unknown): ProductProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = Number(r.version);
  // 未来版本的结构未知，读了只会填错 —— 拒绝比猜测安全。
  if (!Number.isFinite(version) || version > PRODUCT_PROJECT_VERSION) return null;

  const facts: ProductFact[] = [];
  if (Array.isArray(r.facts)) {
    for (const item of r.facts) {
      const f = sanitizeFact(item);
      if (f) facts.push(f);
    }
  }
  const rawListing = (r.listing && typeof r.listing === "object" ? r.listing : {}) as Record<string, unknown>;
  const bullets = Array.isArray(rawListing.bullets)
    ? rawListing.bullets.filter((b): b is string => typeof b === "string").slice(0, 10)
    : [];
  const keywords = Array.isArray(r.keywords)
    ? r.keywords.filter((k): k is string => typeof k === "string").slice(0, 500)
    : [];

  return {
    id: str(r.id, "project"),
    name: str(r.name, "未命名商品"),
    marketplace: str(r.marketplace, "amazon-us"),
    category: str(r.category),
    facts,
    listing: { title: str(rawListing.title).slice(0, 500), bullets },
    keywords,
    // v1 项目没有快照字段；读不出来就给空快照，诊断会据此输出「无法判断」。
    snapshot: sanitizeSnapshot(r.snapshot) ?? emptySnapshot(str(r.marketplace, "amazon-us")),
    version: PRODUCT_PROJECT_VERSION,
    updatedAt: Number.isFinite(Number(r.updatedAt)) ? Number(r.updatedAt) : 0,
  };
}
