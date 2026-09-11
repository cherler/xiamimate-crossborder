/**
 * 客服回复的脱敏与消息合规检查。纯函数、确定性。
 *
 * 两件事都不能交给模型：
 * 1. 脱敏必须发生在调模型之前。买家消息里有真实姓名、地址、订单号，
 *    「请不要泄露隐私」写在提示词里是没用的 —— 内容已经进去了。
 * 2. 违规检查必须是确定性的。模型自己写的回复由模型自己判断有没有违规，
 *    等于让它给自己判卷。
 *
 * 关于覆盖面的诚实声明：
 * 邮箱、电话、订单号、URL、快递单号是能靠模式认出来的；
 * 姓名与地址不能 —— 「Ken」「北京」既可能是人名地名，也可能是普通词，
 * 靠正则去猜只会漏或误伤。所以这里只做能做对的部分，剩下的如实告诉用户自己看。
 * 声称「已完全脱敏」比不脱敏更危险，因为用户会不再检查。
 */

export type RedactionKind = "email" | "phone" | "order_id" | "tracking" | "url";

export const REDACTION_LABEL: Record<RedactionKind, string> = {
  email: "邮箱",
  phone: "电话",
  order_id: "订单号",
  tracking: "快递单号",
  url: "链接",
};

export type Redaction = { kind: RedactionKind; original: string; placeholder: string };

/** 先长后短：订单号里含数字段，先认订单号，免得被电话规则先吃掉。 */
const PATTERNS: Array<{ kind: RedactionKind; re: RegExp }> = [
  { kind: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  // Amazon 订单号是 3-7-7 位数字
  { kind: "order_id", re: /\b\d{3}-\d{7}-\d{7}\b/g },
  { kind: "url", re: /https?:\/\/[^\s<>"）)]+/g },
  // 快递单号：连续 10 位以上的字母数字（UPS 1Z 开头、FedEx 12 位等）
  { kind: "tracking", re: /\b(?:1Z[0-9A-Z]{16}|[A-Z]{2}\d{9}[A-Z]{2}|\d{12,22})\b/g },
  // 电话：带分隔符的 7 位以上号码，避免把普通数字当电话
  { kind: "phone", re: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?/g },
];

/**
 * 把能机械识别的个人信息替换成占位符。
 * 同一个值多次出现用同一个占位符，回复里才能自洽地引用它。
 */
export function redact(input: string): { text: string; redactions: Redaction[] } {
  let text = input;
  const redactions: Redaction[] = [];
  const seen = new Map<string, string>();

  for (const { kind, re } of PATTERNS) {
    text = text.replace(re, (match) => {
      const existing = seen.get(match);
      if (existing) return existing;
      const n = redactions.filter((r) => r.kind === kind).length + 1;
      const placeholder = `[${REDACTION_LABEL[kind]}${n}]`;
      seen.set(match, placeholder);
      redactions.push({ kind, original: match, placeholder });
      return placeholder;
    });
  }
  return { text, redactions };
}

/** 把模型回复里的占位符还原成原值，供用户复制发送。 */
export function restore(text: string, redactions: Redaction[]): string {
  let out = text;
  for (const r of redactions) out = out.split(r.placeholder).join(r.original);
  return out;
}

/* ---------------- 消息合规检查 ---------------- */

export type IssueLevel = "violation" | "warn";

export type MessageIssue = {
  id: string;
  level: IssueLevel;
  title: string;
  detail: string;
  match?: string;
};

/**
 * 常见禁区，不是官方规则库。
 *
 * 我们不维护平台政策 —— 这几条是买卖双方消息里被反复强调的硬线，
 * 用确定性模式先兜住最明显的。权威判断仍需你自己核对平台政策，
 * 或用工作台的联网检索取回官方原文。规则会变，这张表不会自己更新。
 */
export const MESSAGE_RULE_NOTE =
  "以下为常见禁区的模式匹配，非官方规则库，也不会自动更新。以平台当期政策为准。";

type RuleSpec = { id: string; level: IssueLevel; re: RegExp; title: string; detail: string };

const RULES: RuleSpec[] = [
  {
    id: "external-link", level: "violation",
    re: /https?:\/\/[^\s]+/i,
    title: "回复里有外部链接",
    detail: "买卖双方消息通常禁止外部链接。要给资料请走平台内允许的方式。",
  },
  {
    id: "contact-info", level: "violation",
    re: /[\w.+-]+@[\w-]+\.[\w.-]+|\bwhatsapp\b|\bwechat\b|\btelegram\b|微信|加我/i,
    title: "回复里有站外联系方式",
    detail: "把交易引到站外通常直接违规，且会失去平台的交易保障。",
  },
  {
    id: "review-solicit", level: "violation",
    re: /\bleave (us )?a (positive |5[- ]star |five[- ]star )?review\b|\b(5|five)[- ]star\b|好评|给个五星|positive feedback/i,
    title: "回复里在索评",
    detail: "以任何方式请求、诱导或暗示好评都是平台明令禁止的，包括「如果满意请留个评价」。",
  },
  {
    id: "marketing", level: "violation",
    re: /\bcoupon\b|\bdiscount code\b|\bpromo\b|\bcheck out our\b|\bvisit our store\b|优惠券|折扣码|关注我们/i,
    title: "回复里有营销内容",
    detail: "买卖双方消息只能用于完成订单，不得用于营销推广。",
  },
  {
    id: "off-platform-refund", level: "violation",
    re: /\b(paypal|venmo|zelle|bank transfer|wire transfer)\b|私下退款|站外退款/i,
    title: "回复里提到站外付款 / 退款",
    detail: "绕开平台退款会直接触发违规，也让买家失去保障。",
  },
  {
    id: "medical-claim", level: "warn",
    re: /\bcure\b|\btreat\b|\bheal\b|\bfda approved\b|治疗|治愈|疗效/i,
    title: "回复里有医疗功效表述",
    detail: "客服回复同样受商品声明约束，别在消息里做商品页上不敢做的承诺。",
  },
  {
    id: "absolute-claim", level: "warn",
    re: /\b100% (guaranteed|safe|effective)\b|\bnever fails?\b|绝对|百分百保证/i,
    title: "回复里有绝对化承诺",
    detail: "「保证绝不再发生」这类承诺一旦兑现不了，会变成新的纠纷。",
  },
];

/** 检查一条待发送的回复。只提示、不阻断 —— 发不发由用户决定。 */
export function checkReply(text: string): MessageIssue[] {
  const out: MessageIssue[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    out.push({ id: r.id, level: r.level, title: r.title, detail: r.detail, match: m[0].slice(0, 60) });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "violation" ? -1 : 1));
}

/* ---------------- 需要人工升级的情形 ---------------- */

export type Escalation = { id: string; text: string };

/**
 * 有些事客服模板不该接：法律威胁、人身伤害、监管投诉。
 * 这类消息生成一段得体回复是最糟的处理 —— 它会拖延真正需要的人介入。
 */
const ESCALATIONS: Array<{ id: string; re: RegExp; text: string }> = [
  {
    id: "legal", re: /\blawyer\b|\bsue\b|\blawsuit\b|\blegal action\b|\battorney\b|律师|起诉|法律/i,
    text: "买家提到了法律行动。这类消息不该用模板回复，请转给能拍板的人处理。",
  },
  {
    id: "injury", re: /\binjur|\bburn|\bhurt\b|\bhospital\b|\ballerg|受伤|烫伤|过敏|就医/i,
    text: "买家提到了人身伤害。这属于安全事件，需要按正式流程处理并留档，不要即兴回复。",
  },
  {
    id: "regulator", re: /\bfda\b|\bcpsc\b|\bconsumer protection\b|\breport(ing)? you\b|投诉到|举报/i,
    text: "买家提到了监管或投诉。回复内容可能成为证据，请由负责人确认后再发。",
  },
  {
    id: "chargeback", re: /\bchargeback\b|\ba-to-z\b|\bdispute\b|拒付|索赔/i,
    text: "买家提到了拒付 / 索赔。平台会介入，回复措辞直接影响裁决结果。",
  },
];

export function detectEscalations(buyerMessage: string): Escalation[] {
  return ESCALATIONS.filter((e) => e.re.test(buyerMessage)).map((e) => ({ id: e.id, text: e.text }));
}
