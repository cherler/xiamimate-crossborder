import { Fragment, type ReactNode } from "react";

/**
 * 内容文案里的 `**加粗**` —— 渲染成 <strong>。
 *
 * 教程、词条、平台预设这些长文案是当 markdown 写的,而渲染器一律
 * `<p>{text}</p>` 直出纯文本,于是页面上到处是裸露的星号
 * (实测:入门指南 8 处、跨境基础 5 处、利润计算器的平台口径提醒 2 处)。
 * 强调完全失效,还额外显示了一堆噪声字符。
 *
 * **只支持加粗一种写法,这是刻意的。**
 * 内容里目前也确实只用了这一种(有测试钉住)。上一个完整的 markdown 库
 * 换来的是几十 KB 依赖、以及 HTML 注入这条必须一直看住的口子;
 * 而这些文案要的只是「把一句话里的重点标出来」。
 *
 * **不经过 HTML。** 返回的是 React 节点数组,内容始终是文本节点 ——
 * 换成 dangerouslySetInnerHTML 的话,任何一处文案将来接上用户输入
 * (反馈摘录、AI 生成的段落)就成了 XSS。这一步省不得。
 *
 * 不配对的 `**` 原样保留:那说明文案写错了,显示出来才看得见,
 * 悄悄吞掉只会让人以为加粗生效了。
 */
const BOLD = /\*\*(.+?)\*\*/g;

export function rich(text: string): ReactNode {
  if (!text || !text.includes("**")) return text;

  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<strong key={`b${at}`}>{m[1]}</strong>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</>;
}
