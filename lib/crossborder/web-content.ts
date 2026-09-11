/**
 * 网页读取后的确定性整理。
 *
 * 抓取服务返回的 Markdown 往往夹着导航、登录、Cookie、图片链接与重复菜单。
 * 这里不让模型“猜正文”，只做可解释的清洗、去重与限长；超长时优先保留
 * 含数字、规格、价格、包装等高信息量行，并始终把送去智能读取的文字控制在上限内。
 */

export const MATERIAL_TEXT_LIMIT = 6_000;

/**
 * Listing 医生的事实抽取上限。比 MATERIAL_TEXT_LIMIT 宽 —— 规格书/现有 Listing
 * 本来就长,而这一步不做参数计算,长一点无妨。
 *
 * 与 MATERIAL_TEXT_LIMIT 放在一起是有意的:两个数此前一个写在 lib、一个写在
 * server 路由里,页面上还各自抄了一遍。同一条限制散在三处,改一处就对不上。
 */
export const FACTS_TEXT_LIMIT = 12_000;

export type FittedText = {
  text: string;
  originalChars: number;
  truncated: boolean;
};

export type PreparedWebContent = FittedText & {
  cleanedChars: number;
  removedChars: number;
  /**
   * 解码失败留下的替换字符(U+FFFD)个数。
   * 曾经这些字符在清洗第一步就被静默删掉 —— 而它们是非 UTF-8 站点(GBK 中文站、
   * Shift-JIS 日站)唯一的失败信号。删掉之后「￥9.99」变成「9.99」,下游的币种提示
   * 检不到符号,就会按美元问用户一句「是否都按美元计算」,人民币价直接进利润模型。
   * 现在原样保留并计数,让调用方能如实告诉用户「这页编码没认出来」。
   */
  garbled: number;
};

const META_LINE = /^(?:title|url source|published time|markdown content)\s*:/i;
const NOISE_LINE = /^(?:skip to (?:content|main)|sign in|log in|register|subscribe|accept(?: all)? cookies?|cookie settings?|privacy policy|terms (?:of (?:use|service)|and conditions)|back to top|share(?: this)?|menu|home)$/i;
const PRODUCT_SIGNAL = /(?:price|cost|sku|model|material|size|dimension|weight|capacity|volume|color|package|packaging|carton|shipping|freight|moq|minimum order|lead time|warranty|compatible|specification|feature|售价|价格|成本|型号|材质|尺寸|长|宽|高|重量|容量|颜色|包装|箱规|运费|物流|起订|交期|质保|兼容|规格|参数)/i;
const NUMBER_SIGNAL = /(?:\d|[$€£¥￥%]|(?:mm|cm|kg|g|lb|oz|inch|in|pcs|piece|ml|l)\b)/i;

function cleanLine(raw: string): string {
  let line = raw
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    /**
     * \u53EA\u5265\u771F\u6B63\u7684 HTML \u6807\u7B7E:`<` \u540E\u9762\u5FC5\u987B\u7D27\u8DDF\u5B57\u6BCD\u6216 `/`\u3002
     *
     * \u539F\u6765\u662F /<[^>]+>/ \u2014\u2014 \u5B83\u628A\u300C\u51C0\u91CD <5kg \u4E14 \u957F\u5EA6 >30cm\u300D\u6574\u6BB5\u5F53\u6210\u4E00\u4E2A\u6807\u7B7E\u5220\u6389,
     * \u53EA\u5269\u300C\u51C0\u91CD 30cm\u300D\u3002\u800C\u89C4\u683C\u9875\u91CC `<5kg`\u3001`>30cm`\u3001`<40\u2103` \u662F\u5E38\u89C4\u5199\u6CD5\u3002
     * \u6700\u574F\u7684\u662F\u8FD9\u79CD\u7BE1\u6539\u65E0\u6CD5\u88AB\u4E0B\u6E38\u53D1\u73B0:\u6A21\u578B\u770B\u5230\u7684\u539F\u6587\u5C31\u662F\u300C\u51C0\u91CD 30cm\u300D,
     * \u5B83\u5F15\u7528\u7684 source_quote \u4E0E\u88AB\u6539\u8FC7\u7684\u6587\u672C\u5B8C\u5168\u5BF9\u5F97\u4E0A,\u300C\u5FC5\u987B\u9644\u539F\u6587\u300D\u90A3\u9053\u9632\u7EBF\u4E00\u6761\u90FD\u62E6\u4E0D\u4F4F\u3002
     */
    .replace(/<\/?[A-Za-z][^<>]*>/g, " ")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+/, "• ")
    .replace(/^\s*>\s?/, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (META_LINE.test(line)) return "";
  line = line.replace(/^[_~`]{1,3}|[_~`]{1,3}$/g, "").trim();
  if (line.length < 2) return "";
  if (line.length < 160 && NOISE_LINE.test(line)) return "";
  if (/^https?:\/\/\S+$/i.test(line)) return "";
  return line;
}

/**
 * 超长行分段。切点优先落在空白/分隔符上,而不是定长硬切。
 *
 * 定长硬切会从数字中间下刀:`1,299.00` 切成 `1,2` + `99.00`,两截都是合法数字,
 * 模型照读不误,而且没有任何痕迹。表格行被切成半截表格也是同理。
 */
function splitLongLine(line: string, max = 700): string[] {
  if (line.length <= max) return [line];
  const parts: string[] = [];
  let start = 0;
  while (start < line.length) {
    if (line.length - start <= max) {
      parts.push(line.slice(start).trim());
      break;
    }
    const window = line.slice(start, start + max);
    // 在末尾 120 字符内找一个安全切点(空白、竖线、分号、逗号、顿号、句号)
    const safe = Math.max(
      window.lastIndexOf(" "), window.lastIndexOf("|"), window.lastIndexOf(";"),
      window.lastIndexOf(","), window.lastIndexOf("、"), window.lastIndexOf("。"),
    );
    const cut = safe > max - 120 ? safe : max;
    parts.push(window.slice(0, cut).trim());
    start += cut;
  }
  return parts.filter(Boolean);
}

function informationScore(line: string): number {
  let score = 0;
  if (NUMBER_SIGNAL.test(line)) score += 5;
  if (PRODUCT_SIGNAL.test(line)) score += 5;
  if (/[:：|]/.test(line)) score += 2;
  if (line.length >= 30 && line.length <= 300) score += 2;
  return score;
}

export function fitMaterialText(value: string, maxChars = MATERIAL_TEXT_LIMIT): FittedText {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length <= maxChars) {
    return { text: normalized, originalChars: normalized.length, truncated: false };
  }
  const candidate = normalized.slice(0, maxChars);
  const lastBreak = candidate.lastIndexOf("\n");
  const text = (lastBreak >= Math.floor(maxChars * 0.8) ? candidate.slice(0, lastBreak) : candidate).trim();
  return { text, originalChars: normalized.length, truncated: true };
}

/**
 * 反爬 / 登录墙 / 人机校验页识别。
 *
 * 抓取服务对这些页面是「成功」的 —— 它确实拿到了 200 和一段正文,只不过正文写的是
 * 「Access Denied」。原来的成功判据只有「provider 没抛错 && 正文非空」,于是用户花 1 积分
 * 抓回一张拒访页,接着可能再花 1 积分让模型去这张页上抽参数。这里按整页特征拦下来,
 * 让它走失败路径(非 2xx),后端据此释放冻结、不扣费。
 *
 * 判据刻意保守 —— 误判的代价是用户一次正当的读取被拒。所以分两档:
 *  - 强特征(整页就是一句拒访/盾页):这种页面即使带页脚也很短,放宽到 1500 字;
 *  - 弱特征(captcha、限流、需登录):这些词在正常评测文章里也会出现,只在 600 字
 *    以内的**短页**才作数。
 */
const BLOCK_STRONG: Array<[RegExp, string]> = [
  [/access denied|403 forbidden|you don't have permission|not authorized/, "站点拒绝访问"],
  [/just a moment|checking your browser|enable javascript and cookies|cf-browser-verification/, "站点启用了人机校验"],
  [/访问被拒绝|请开启 ?javascript/, "站点拒绝访问"],
];
const BLOCK_WEAK: Array<[RegExp, string]> = [
  [/are you (?:a )?(?:robot|human)|captcha|unusual traffic|verify you are human/, "站点要求人机验证"],
  [/sign in to continue|please log ?in|login required|subscribe to (?:read|continue)/, "页面需要登录或订阅"],
  [/rate limit|too many requests/, "站点限流"],
  [/安全验证|人机验证|请登录后查看/, "站点要求验证或登录"],
];

export function looksBlocked(text: string): string | null {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (t.length <= 1500) {
    for (const [re, why] of BLOCK_STRONG) if (re.test(low)) return why;
  }
  if (t.length <= 600) {
    for (const [re, why] of BLOCK_WEAK) if (re.test(low)) return why;
  }
  return null;
}

export type MergedMaterial = FittedText & {
  /** 新读进来的这一段有没有整段装下(被截掉一部分时为 false) */
  fullyKept: boolean;
  /** 可直接展示给用户的一句话;没什么可说时为空串 */
  note: string;
};

/**
 * 往资料框里追加一段新读到的内容(网页正文 / 表格文件),并保证结果不超上限。
 *
 * 为什么必须收在一个函数里:三个入口(工具页抽屉、omnibox 智能路由、Listing 医生)
 * 各自手写过一遍这段拼接,而只有 omnibox 那份记得裁剪。另外两处是裸拼,后果:
 *
 *   fetch 接口单页最多返回 6,000 字(prepareWebContent 的 maxChars),而服务端对
 *   超长直接 400。所以「已有资料 + 再读一页」「连读两页」必然越界;单页恰好顶到
 *   上限时,再加一行「【标题】」也会越界。于是「读网页」这一步花掉的那 1 积分
 *   换回一句「单次读取请控制在 6000 字以内」,界面上既没有字数、也没有裁剪按钮。
 *
 * 截断是从**尾部**切的,而刚读进来的内容正好在尾部 —— 所以要如实区分
 * 「整段装下了,只是把旧资料挤掉一点」和「这一页根本没装进去」,后者得给出下一步。
 */
export function mergeMaterial(
  existing: string,
  incoming: string,
  maxChars = MATERIAL_TEXT_LIMIT,
): MergedMaterial {
  const add = String(incoming || "").trim();
  const base = String(existing || "").trim();
  const fitted = fitMaterialText(base ? `${base}\n\n${add}` : add, maxChars);
  if (!fitted.truncated) return { ...fitted, fullyKept: true, note: "" };

  const tail = add.slice(-40);
  const fullyKept = tail.length > 0 && fitted.text.includes(tail);
  const limit = maxChars.toLocaleString();
  return {
    ...fitted,
    fullyKept,
    note: fullyKept
      ? `合并后的资料超过 ${limit} 字，已自动按识别上限保留，无需手动删除。`
      : `资料框已接近 ${limit} 字上限，本次读取的内容没能全部装下（超出的部分已被截掉）。建议先清空已有资料，再单独读取这一页。`,
  };
}

export function prepareWebContent(raw: string, maxChars = MATERIAL_TEXT_LIMIT): PreparedWebContent {
  const original = String(raw || "").replace(/\r\n?/g, "\n").trim();
  const garbled = (original.match(/�/g) || []).length;
  const seen = new Set<string>();
  const lines = original
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .flatMap((line) => splitLongLine(line))
    .filter((line) => {
      /**
       * 整行去重只对付重复的导航/菜单,不能对付数据行。
       *
       * 变体表里「同价不同尺码」「重复的 N/A 单元格」本来就是内容相同的多行,
       * 全局去重会把它们当噪声删掉 —— 数量统计随之失真,而且看不出少了东西。
       * 判据只用「含阿拉伯数字」:数据行几乎都带数字,而重复的菜单/面包屑/规格标签
       * (如两遍 "Material: food-grade silicone")不带,仍照常去重。
       * 这里不能复用 NUMBER_SIGNAL —— 它的 `l\b` 之类的单位分支会命中 "Material" 的
       * 那个 l,几乎所有英文行都算「有数据」,去重就形同虚设了。
       */
      if (/\d/.test(line)) return true;
      const key = line.toLocaleLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const cleaned = lines.join("\n").trim();
  if (cleaned.length <= maxChars) {
    return {
      text: cleaned,
      originalChars: original.length,
      cleanedChars: cleaned.length,
      removedChars: Math.max(0, original.length - cleaned.length),
      truncated: false,
      garbled,
    };
  }

  // 先占约 70% 给高信息量行，再按原始顺序补上下文；最终仍恢复原网页顺序。
  // 留一小段预算给「略去 N 行」标记,否则标记会把正文挤掉。
  const hardCap = Math.max(0, maxChars - 300);
  const selected = new Set<number>();
  let used = 0;
  const priorityBudget = Math.floor(maxChars * 0.7);
  const priority = lines
    .map((line, index) => ({ index, score: informationScore(line), length: line.length + 1 }))
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  for (const item of priority) {
    if (used + item.length > priorityBudget) continue;
    if (!selected.has(item.index)) {
      selected.add(item.index);
      used += item.length;
    }
    /**
     * 连带上一行(短行才带)。
     *
     * 目录页/变体表的排布是「商品名」在上、「price: $97.50」在下,而只有下面那行
     * 拿得到高分。只挑走高分行的结果实测是:200 条价格全留、商品名只剩 56 条 ——
     * 剩下 144 个价格失去归属,模型会把它们挂到别的商品名下,还挂得理直气壮。
     * 宁可少留几条完整记录,也不要留一堆对不上号的数字。
     */
    const prev = item.index - 1;
    if (prev >= 0 && !selected.has(prev) && lines[prev].length <= 120
        && used + lines[prev].length + 1 <= priorityBudget) {
      selected.add(prev);
      used += lines[prev].length + 1;
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (selected.has(index)) continue;
    const length = lines[index].length + 1;
    if (used + length > hardCap) continue;
    selected.add(index);
    used += length;
  }

  /**
   * 被跳过的行留下显式标记。
   *
   * 原来是把入选行无缝拼在一起 —— 模型看到的是一段连续正文,无从知道中间断过,
   * 于是把断点两侧本不相干的内容当成同一条记录读。标出「略去 N 行」不解决取舍问题,
   * 但至少让「这里缺了东西」是可见的。
   */
  const picked = [...selected].sort((a, b) => a - b);
  const out: string[] = [];
  let prevIndex = -1;
  for (const index of picked) {
    if (prevIndex >= 0 && index > prevIndex + 1) out.push(`…(略去 ${index - prevIndex - 1} 行)…`);
    out.push(lines[index]);
    prevIndex = index;
  }
  if (prevIndex >= 0 && prevIndex < lines.length - 1) {
    out.push(`…(略去 ${lines.length - 1 - prevIndex} 行)…`);
  }

  const fitted = fitMaterialText(out.join("\n"), maxChars);
  return {
    text: fitted.text,
    originalChars: original.length,
    cleanedChars: cleaned.length,
    removedChars: Math.max(0, original.length - cleaned.length),
    truncated: true,
    garbled,
  };
}
