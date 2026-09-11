/**
 * 关键词清洗引擎。纯函数。
 * 按换行 / 逗号 / 分号切分，忽略大小写与多余空格去重（保留首次写法）。
 *
 * 这里曾经还有一个「扩词」：拿第一个关键词拼上 7 个写死的修饰语（for women、cheap…）
 * 当长尾建议。它有两个问题 —— 拼出来的词没有任何搜索量依据，纯属编造；
 * 而且只用第一个词做词根，用户粘贴的其余关键词被静默忽略，UI 也不说。
 * 扩词必须建立在真实关键词数据上，在拿到数据之前，这个工具只做它做得对的事：清洗。
 */

export type KeywordResult = {
  rawCount: number;
  unique: string[];
  removed: number;
};

export function processKeywords(text: string): KeywordResult {
  const raw = text.split(/[\n,;，；]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Map<string, string>();
  for (const k of raw) {
    const key = k.toLowerCase().replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, k);
  }
  const unique = Array.from(seen.values());
  return { rawCount: raw.length, unique, removed: raw.length - unique.length };
}
