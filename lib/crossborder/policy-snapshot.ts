/**
 * 平台政策快照。纯函数。
 *
 * 我们不维护政策库 —— 那是一份永久的人工承诺，一人项目背不动，
 * 而过期的政策库比没有政策库更糟，因为用户会信它。
 * 取而代之：每个商品项目自带一份「检索于某日」的政策快照。
 *
 * 为什么是快照而不是每次诊断实时检索：
 * 1. 可复现。诊断结论必须能被分享、被复查；今天说超限、明天说没事，等于没结论。
 * 2. 成本。政策一周也不变一次，没理由每次诊断都搜一遍。
 * 3. 没有缓存去处（本项目未启用 D1 / R2）。
 * 快照存进项目，重新检索是显式动作，检索日期永远在场。
 *
 * 安全阀（本文件的核心）：
 * - 只有官方来源能产生硬规则。代运营博客、SEO 软文只能是提示，永不作为判定依据 ——
 *   实测「amazon title 75 characters」的检索结果里，官方公告与软文是混在一起的。
 * - 检索不到官方来源时输出「无法判断」，而不是「未发现问题」。
 * - 永不输出「合规」。
 * - 检索结果是不可信文本（软文里可能藏 prompt injection），与用户上传资料同等对待：
 *   只做结构化抽取、强制带原文、一律待确认。
 */

export const POLICY_SNAPSHOT_VERSION = 1;

/** 来源可信度。官方 = 平台自己发布的；其余一律 secondary，无论看起来多权威。 */
export type SourceTier = "official" | "secondary";

/**
 * 平台官方域。只列平台自己发布政策的地方，不含商城页面与第三方。
 *
 * 必须精确匹配，不能用前缀 —— sellercentral.amazon.evil.com 也以
 * 「sellercentral.amazon.」开头，注册这么个域名就能把软文提权成硬规则依据。
 * 而 amazon.co.uk 与 amazon.evil.com 在形状上无法区分，正则也救不了，
 * 只能逐条列出。新增站点 = 新增一行。
 */
export const OFFICIAL_HOSTS = new Set([
  "sellercentral.amazon.com",
  "sellercentral.amazon.ca",
  "sellercentral.amazon.com.mx",
  "sellercentral.amazon.co.uk",
  "sellercentral.amazon.de",
  "sellercentral.amazon.fr",
  "sellercentral.amazon.it",
  "sellercentral.amazon.es",
  "sellercentral.amazon.co.jp",
  "sellercentral.amazon.com.au",
  "sell.amazon.com",
  "sell.amazon.co.uk",
  "advertising.amazon.com",
  "developer.amazon.com",
]);

export function classifySource(url: string): SourceTier {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "secondary";
  }
  return OFFICIAL_HOSTS.has(host) ? "official" : "secondary";
}

/**
 * 可机械校验的约束。绝大多数平台规则是自然语言，机器判不了；
 * 只有极少数（长度上限这类）能变成一个数字，才允许参与自动判定。
 * 判不了的规则照样展示给用户看，但不假装自己检查过。
 */
export type ConstraintKind = "title_max_chars" | "highlights_max_chars";

export type RuleConstraint = { kind: ConstraintKind; value: number };

export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  title_max_chars: "标题字符上限",
  highlights_max_chars: "Item Highlights 字符上限",
};

export type PolicyRule = {
  id: string;
  claim: string;            // 「标题不超过 75 字符（媒体类目除外）」
  scope: string;            // 适用范围，如「amazon-us · 除媒体类目」
  effectiveFrom: string;    // 生效日期，未写则为空
  url: string;
  sourceTitle: string;
  tier: SourceTier;
  quote: string;            // 来源原文，用户据此核对
  /** 能机械校验时才有；没有就只能展示，不能判定。 */
  constraint?: RuleConstraint;
  retrievedAt: number;
  /** 用户核对过才算数 —— 和商品事实同一条规矩。 */
  status: "confirmed" | "unconfirmed";
};

/**
 * 取某个约束的判定依据。只认官方 + 已核对的规则 ——
 * 拿软文里的数字去判定用户的标题，是把传闻当法条。
 * 取不到返回 null，调用方必须据此输出「无法判断」，不能默默跳过检查。
 */
export function constraintFrom(snapshot: PolicySnapshot, kind: ConstraintKind): PolicyRule | null {
  return hardRules(snapshot).find((r) => r.constraint?.kind === kind) ?? null;
}

export type PolicySnapshot = {
  query: string;
  marketplace: string;
  rules: PolicyRule[];
  retrievedAt: number;
  version: number;
};

export function emptySnapshot(marketplace = "amazon-us"): PolicySnapshot {
  return { query: "", marketplace, rules: [], retrievedAt: 0, version: POLICY_SNAPSHOT_VERSION };
}

/* ---------------- 安全阀 ---------------- */

/**
 * 能否作为硬规则参与判定：必须官方来源 + 用户已核对。
 * 二者缺一，这条规则最多只能显示为「提示」。
 */
export function canBeHardRule(rule: PolicyRule): boolean {
  return rule.tier === "official" && rule.status === "confirmed";
}

export function hardRules(snapshot: PolicySnapshot): PolicyRule[] {
  return snapshot.rules.filter(canBeHardRule);
}

/** 只能提示、不能判定的规则：非官方来源，或官方但尚未核对。 */
export function advisoryRules(snapshot: PolicySnapshot): PolicyRule[] {
  return snapshot.rules.filter((r) => !canBeHardRule(r));
}

/**
 * 政策检查的结论只有两种：查过了，或无法判断。
 * 没有「合规」这个选项 —— 我们不是平台，也不是律师。
 */
export type PolicyVerdict = "checked" | "unknown";

export function verdictFor(snapshot: PolicySnapshot): PolicyVerdict {
  return hardRules(snapshot).length > 0 ? "checked" : "unknown";
}

/** 无法判断时对用户说什么。绝不能说成「未发现问题」。 */
export function verdictText(snapshot: PolicySnapshot, now = Date.now()): string {
  if (verdictFor(snapshot) === "unknown") {
    return snapshot.rules.length === 0
      ? "尚未检索到任何平台规则，无法判断 —— 这不代表没有问题。"
      : "检索到的资料里没有官方来源（或你尚未核对），无法判断 —— 这不代表没有问题。";
  }
  return `已按 ${hardRules(snapshot).length} 条官方规则检查（${describeRetrieval(snapshot.retrievedAt, now)}）。结果不替代平台审核或法律意见。`;
}

/* ---------------- 时效 ---------------- */

const DAY = 86_400_000;

/** 政策会变。超过 30 天的快照默认视为过期，提醒重新检索。 */
export function isStale(retrievedAt: number, now = Date.now(), days = 30): boolean {
  if (!retrievedAt) return true;
  return now - retrievedAt > days * DAY;
}

export function describeRetrieval(retrievedAt: number, now = Date.now()): string {
  if (!retrievedAt) return "尚未检索";
  const d = new Date(retrievedAt);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = Math.floor((now - retrievedAt) / DAY);
  if (days <= 0) return `检索于 ${iso}（今天）`;
  return `检索于 ${iso}（${days} 天前）`;
}

/** 该规则是否尚未生效。未写生效日期的视为已生效。 */
export function isUpcoming(rule: PolicyRule, now = Date.now()): boolean {
  if (!rule.effectiveFrom) return false;
  const t = Date.parse(rule.effectiveFrom);
  return Number.isFinite(t) && t > now;
}

/** 生效日期在未来的规则：现在还没生效，但要提前告知。 */
export function upcomingRules(snapshot: PolicySnapshot, now = Date.now()): PolicyRule[] {
  return snapshot.rules.filter((r) => isUpcoming(r, now));
}

/* ---------------- 存取守卫 ---------------- */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

const CONSTRAINT_KINDS: ConstraintKind[] = ["title_max_chars", "highlights_max_chars"];

function sanitizeConstraint(raw: unknown): RuleConstraint | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const kind = r.kind as ConstraintKind;
  const value = Number(r.value);
  if (!CONSTRAINT_KINDS.includes(kind)) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return { kind, value };
}

function sanitizeRule(raw: unknown): PolicyRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const claim = str(r.claim).trim();
  const url = str(r.url).trim();
  const quote = str(r.quote).trim();
  // 没有主张、没有出处、或拿不出原文的，不是规则，是传闻。
  if (!claim || !url || !quote) return null;
  return {
    constraint: sanitizeConstraint(r.constraint),
    id: str(r.id, url),
    claim: claim.slice(0, 300),
    scope: str(r.scope).slice(0, 120),
    effectiveFrom: str(r.effectiveFrom).slice(0, 20),
    url,
    sourceTitle: str(r.sourceTitle, url).slice(0, 200),
    // tier 一律由 URL 重新判定，不信任存下来的值 —— 否则改一改本地存储就能把软文提权成官方。
    tier: classifySource(url),
    quote: quote.slice(0, 400),
    retrievedAt: Number.isFinite(Number(r.retrievedAt)) ? Number(r.retrievedAt) : 0,
    status: r.status === "confirmed" ? "confirmed" : "unconfirmed",
  };
}

export function sanitizeSnapshot(raw: unknown): PolicySnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const version = Number(r.version);
  if (!Number.isFinite(version) || version > POLICY_SNAPSHOT_VERSION) return null;

  const rules: PolicyRule[] = [];
  if (Array.isArray(r.rules)) {
    for (const item of r.rules) {
      const rule = sanitizeRule(item);
      if (rule) rules.push(rule);
    }
  }
  return {
    query: str(r.query).slice(0, 200),
    marketplace: str(r.marketplace, "amazon-us").slice(0, 40),
    rules,
    retrievedAt: Number.isFinite(Number(r.retrievedAt)) ? Number(r.retrievedAt) : 0,
    version: POLICY_SNAPSHOT_VERSION,
  };
}
