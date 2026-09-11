/**
 * Listing 诊断引擎。纯函数、确定性。
 *
 * 刻意不调模型：诊断是判定，判定必须可复现、可核对、可分享。
 * 模型的位置在前一步（从资料里抽事实）和后一步（按问题改写），不在这里。
 *
 * 四类检查，各自的依据都必须能指出来：
 * 1. 事实一致性 —— 文案说了事实库里没确认的东西。依据是事实库本身，不需要外部数据，
 *    也是普通 AI 对话框最做不到的一类（它没有你的事实库）。
 * 2. 高风险声明 —— 材质 / 认证 / 防水 / 质保 写错等于虚假宣传，单独拎出来。
 * 3. 关键词覆盖 —— 只用你上传的关键词，不猜搜索量。
 * 4. 硬规则 —— 只用政策快照里「官方 + 你已核对」的规则；取不到就输出「无法判断」，
 *    绝不因为没查到就说没问题。
 */

import {
  blockedFacts, slotByKey, type ProductProject,
} from "./product-facts";
import {
  constraintFrom, describeRetrieval, isStale, isUpcoming, upcomingRules,
  type PolicyRule, type PolicySnapshot,
} from "./policy-snapshot";

/**
 * violation 违反了官方硬规则；risk 有实质风险（虚假宣传口径）；
 * gap 缺口；info 说明。unknown 专指「查不了」，与「没问题」严格区分。
 */
export type FindingLevel = "violation" | "risk" | "gap" | "unknown" | "info";

export type FindingField = "title" | "bullets" | "keywords" | "policy";

export type Finding = {
  id: string;
  level: FindingLevel;
  field: FindingField;
  title: string;
  detail: string;
  /** 判定依据。没有依据的结论不该出现在这里。 */
  evidence?: string;
  sourceUrl?: string;
};

export type DiagnosisInput = {
  listingTitle: string;
  bullets: string[];
  keywords: string[];
  project: ProductProject;
  snapshot: PolicySnapshot;
  now?: number;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** 判断用词是拉丁文还是中文。跨文字的同义词（不锈钢 / stainless steel）机器比不了。 */
const isLatin = (s: string) => /[a-z]/i.test(s);

/* ---------------- 1 · 事实一致性 ---------------- */

/**
 * 文案里出现了事实库中未确认 / 未知 / 冲突的事实。
 * 这是整个工作台存在的理由：普通对话框会顺嘴写「防水」，这里能指着事实库说不行。
 */
/** 文案里命中了哪个词就等于在声称这条事实。返回命中的那个词，好把依据指出来。 */
function claimedTerm(fact: { key: string; value: string }, text: string): string | null {
  const terms = [fact.value, ...(slotByKey(fact.key)?.aliases ?? [])]
    .map(norm)
    .filter((t) => t.length >= 2);
  return terms.find((t) => text.includes(t)) ?? null;
}

export function factFindings(input: DiagnosisInput): Finding[] {
  const titleText = norm(input.listingTitle);
  const text = norm([input.listingTitle, ...input.bullets].join("\n"));
  const out: Finding[] = [];

  // 一 · 文案声称了事实库里未确认 / 未知 / 冲突的事实
  for (const fact of blockedFacts(input.project)) {
    const term = claimedTerm(fact, text);
    if (!term) continue;

    const risky = Boolean(slotByKey(fact.key)?.risky);
    const statusText = fact.status === "unknown"
      ? "资料里根本没有这条"
      : fact.status === "conflicting"
        ? "多份资料互相打架，尚未裁决"
        : "已抽取但你还没确认";

    out.push({
      id: `fact-${fact.key}`,
      level: risky ? "risk" : "gap",
      field: titleText.includes(term) ? "title" : "bullets",
      title: `文案提到「${term}」，但事实库未确认${fact.label}`,
      detail: risky
        ? `${fact.label}属于高风险项：${statusText}。写错等于虚假宣传，先确认再写。`
        : `${fact.label}：${statusText}。未确认的事实不该出现在成品里。`,
      evidence: `事实库 · ${fact.label} = ${fact.status === "unknown" ? "未知" : fact.value}（${fact.sourceNote}）`,
    });
  }

  // 二 · 用词强于已确认的事实。
  // 典型：资料只确认了 water-resistant，标题却写 waterproof —— 两者不是一回事。
  //
  // 跨语言是这里的真实困难：规格书多半是中文，Listing 是英文。
  // 「304 不锈钢」与「stainless steel」是同一件事，机器却看不出来。
  // 判据：只有当已确认的值里也出现了本槽位的别名时，两个别名才具备可比性；
  // 值里一个别名都没有（例如纯中文值 vs 英文文案），就如实说无法比对，
  // 而不是硬判成夸大 —— 否则每个中文事实都会报一次高风险，用户会被噪音淹没。
  for (const fact of input.project.facts) {
    if (fact.status !== "confirmed" || !fact.value.trim()) continue;
    const slot = slotByKey(fact.key);
    if (!slot?.risky) continue;

    const confirmed = norm(fact.value);
    if (text.includes(confirmed)) continue; // 照实写了，没问题

    const term = claimedTerm({ key: fact.key, value: "" }, text);
    if (!term) continue;

    // 只拿同文字的别名比：文案写 stainless steel（拉丁），值里只有「不锈钢」（中文），
    // 两者是同一件事但机器看不出来，比了只会误报。
    const valueTerms = slot.aliases
      .map(norm)
      .filter((a) => confirmed.includes(a) && isLatin(a) === isLatin(term));
    const field: FindingField = titleText.includes(term) ? "title" : "bullets";

    if (!valueTerms.length) {
      out.push({
        id: `fact-uncomparable-${fact.key}`,
        level: "unknown",
        field,
        title: `文案用「${term}」，无法与已确认的${fact.label}自动比对`,
        detail: `已确认的值是「${fact.value}」，与文案用词不同语言或不同表述，机器无法判断是否一致 —— 请人工核对。要让它可自动比对，把事实库的值改成文案里的写法即可。`,
        evidence: `事实库 · ${fact.label} = ${fact.value}（${fact.sourceNote}）`,
      });
      continue;
    }
    if (valueTerms.includes(term)) continue; // 用的就是已确认的说法

    out.push({
      id: `fact-overclaim-${fact.key}`,
      level: "risk",
      field,
      title: `文案用「${term}」，但已确认的${fact.label}只到「${valueTerms.join("、")}」`,
      detail: `两者不是一回事（如 water-resistant 与 waterproof）。若确实一致，请把事实库的值改成文案的写法；否则按事实库改文案。`,
      evidence: `事实库 · ${fact.label} = ${fact.value}（${fact.sourceNote}）`,
    });
  }
  return out;
}

/* ---------------- 2 · 关键词覆盖 ---------------- */

export type KeywordCoverage = {
  covered: string[];
  missing: string[];
  ratio: number;
};

/** 只回答「你给的词有没有出现在文案里」。不猜搜索量、不排优先级 —— 我们没有那个数据。 */
export function keywordCoverage(input: DiagnosisInput): KeywordCoverage {
  const text = norm([input.listingTitle, ...input.bullets].join(" "));
  const covered: string[] = [];
  const missing: string[] = [];
  for (const k of input.keywords) {
    const key = norm(k);
    if (!key) continue;
    (text.includes(key) ? covered : missing).push(k);
  }
  const total = covered.length + missing.length;
  return { covered, missing, ratio: total ? covered.length / total : 0 };
}

export function keywordFindings(input: DiagnosisInput): Finding[] {
  if (!input.keywords.length) {
    return [{
      id: "kw-none",
      level: "info",
      field: "keywords",
      title: "尚未上传关键词",
      detail: "上传关键词 CSV 后可检查覆盖情况。我们不提供搜索量数据，只核对你自己的词有没有写进去。",
    }];
  }
  const c = keywordCoverage(input);
  if (!c.missing.length) return [];
  return [{
    id: "kw-missing",
    level: "gap",
    field: "keywords",
    title: `${c.missing.length}/${c.covered.length + c.missing.length} 个关键词未出现在标题或五点里`,
    detail: `未覆盖：${c.missing.slice(0, 8).join("、")}${c.missing.length > 8 ? " 等" : ""}。` +
      `覆盖率仅表示「词有没有写进去」，不代表值得写 —— 是否该投这些词需要搜索量数据，本工具没有。`,
    evidence: `你上传的 ${c.covered.length + c.missing.length} 个关键词`,
  }];
}

/* ---------------- 3 · 硬规则（只用官方 + 已核对） ---------------- */

function lengthFinding(
  id: string,
  field: FindingField,
  label: string,
  text: string,
  rule: PolicyRule | null,
  now: number,
): Finding {
  const len = [...text].length; // 按码点数，避免把 emoji 算成两个字符
  if (!rule || !rule.constraint) {
    return {
      id: `${id}-unknown`,
      level: "unknown",
      field,
      title: `${label}：无法判断`,
      detail: `当前 ${len} 字符。未检索到官方规则（或你尚未核对），因此不做判定 —— 这不代表没有问题。`,
    };
  }
  const limit = rule.constraint.value;
  const pending = isUpcoming(rule, now);
  const over = len > limit;
  return {
    id: over ? `${id}-over` : `${id}-ok`,
    level: over ? "violation" : "info",
    field,
    title: over
      ? `${label} ${len} 字符，超出上限 ${limit}`
      : `${label} ${len} / ${limit} 字符`,
    detail: over
      ? `超出 ${len - limit} 个字符。${pending ? `该规则自 ${rule.effectiveFrom} 起生效，现在还有时间改。` : "该规则已生效。"}`
      : `未超出上限。${pending ? `该规则自 ${rule.effectiveFrom} 起生效。` : ""}`,
    evidence: `${rule.claim}｜原文「${rule.quote.slice(0, 90)}」`,
    sourceUrl: rule.url,
  };
}

export function policyFindings(input: DiagnosisInput): Finding[] {
  const now = input.now ?? Date.now();
  const out: Finding[] = [];

  out.push(lengthFinding(
    "title-len", "title", "标题长度", input.listingTitle,
    constraintFrom(input.snapshot, "title_max_chars"), now,
  ));

  if (input.snapshot.rules.length && isStale(input.snapshot.retrievedAt, now)) {
    out.push({
      id: "policy-stale",
      level: "unknown",
      field: "policy",
      title: "政策快照可能过期",
      detail: `${describeRetrieval(input.snapshot.retrievedAt, now)}。平台规则会变，建议重新检索后再据此判断。`,
    });
  }

  for (const r of upcomingRules(input.snapshot, now)) {
    out.push({
      id: `policy-upcoming-${r.id}`,
      level: "info",
      field: "policy",
      title: `${r.effectiveFrom} 起生效：${r.claim.slice(0, 48)}`,
      detail: `该规则尚未生效，但会影响你现在的写法。${r.tier === "official" ? "" : "（来源非官方，仅供参考，需你自行核实）"}`,
      evidence: `原文「${r.quote.slice(0, 90)}」`,
      sourceUrl: r.url,
    });
  }
  return out;
}

/* ---------------- 汇总 ---------------- */

const ORDER: Record<FindingLevel, number> = { violation: 0, risk: 1, gap: 2, unknown: 3, info: 4 };

export function diagnose(input: DiagnosisInput): Finding[] {
  return [...factFindings(input), ...policyFindings(input), ...keywordFindings(input)]
    .sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export type DiagnosisSummary = {
  violations: number;
  risks: number;
  gaps: number;
  unknowns: number;
  /** 能不能给结论。只要有「无法判断」，就不能说「查过了没问题」。 */
  conclusive: boolean;
};

export function summarize(findings: Finding[]): DiagnosisSummary {
  const count = (l: FindingLevel) => findings.filter((f) => f.level === l).length;
  const unknowns = count("unknown");
  return {
    violations: count("violation"),
    risks: count("risk"),
    gaps: count("gap"),
    unknowns,
    conclusive: unknowns === 0,
  };
}

/** 一句话结论。永远不说「合规」，有无法判断项时明说结论不完整。 */
export function summaryText(s: DiagnosisSummary): string {
  const parts: string[] = [];
  if (s.violations) parts.push(`${s.violations} 处违反官方规则`);
  if (s.risks) parts.push(`${s.risks} 处高风险声明`);
  if (s.gaps) parts.push(`${s.gaps} 处待补`);
  const head = parts.length ? parts.join(" · ") : "未发现可判定的问题";
  if (!s.conclusive) {
    return `${head}；另有 ${s.unknowns} 项无法判断，结论不完整 —— 不代表没有问题。`;
  }
  return `${head}。检查范围仅限已确认事实、你上传的关键词与已核对的官方规则，不替代平台审核或法律意见。`;
}
