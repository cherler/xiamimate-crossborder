"use client";

/**
 * 研究报告正文的迷你 Markdown 渲染器。
 *
 * compose 的输出约定只用有限语法:#/##/### 标题、- 列表、> 引用、| 表格、**加粗**。
 * 全部构造成 React 节点,不走 dangerouslySetInnerHTML —— 模型输出是不可信文本,
 * 防御与 report.tsx 的 toText 同一立场。不认识的行按普通段落渲染,坏不了页面。
 */

import type { ReactNode } from "react";

// 决策动词:决策摘要正文里加粗的 去 / 改 / 留 用颜色区分(与样例同一语言)。
const DECISION_VERB = /^(去|改|留)([：:\s]|$)/;

/** 加粗段:内容以 去/改/留 开头时染色。 */
function boldRun(text: string, key: number): ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return text;
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const verb = DECISION_VERB.exec(p);
        return <b key={i} className={verb ? `rr-dt${verb[1]}` : undefined}>{p}</b>;
      })}
    </span>
  );
}

/** 行内:先切 [文字](url) 链接(仅放行 http/https —— 文本不可信,防 javascript: 注入),
 *  再在其余片段里处理 **bold**。资料库研究卡全靠原文链接,报告引用也受益。 */
function inline(text: string, key: number): ReactNode {
  const parts = text.split(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/video\/[^\s)]+)\)/g);
  if (parts.length === 1) return boldRun(text, key);
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) nodes.push(boldRun(parts[i], i));
    if (i + 2 < parts.length) {
      nodes.push(
        parts[i + 2].startsWith("/")
          ? <a key={i + 1} href={parts[i + 2]}>{parts[i + 1]}</a>
          : <a key={i + 1} href={parts[i + 2]} target="_blank" rel="noreferrer noopener">{parts[i + 1]}</a>,
      );
    }
  }
  return <span key={key}>{nodes}</span>;
}

// 决策表「倾向」列常以裸露的 去/改/留 + 破折号开头(模型未加粗时),同样染色。
const VERB_CELL = /^(去|改|留)(\s*[—–\-：:]\s*)([\s\S]*)$/;
function cellNode(text: string, key: number): ReactNode {
  const m = VERB_CELL.exec(text);
  if (m) return <span key={key}><b className={`rr-dt${m[1]}`}>{m[1]}</b>{m[2]}{inline(m[3], 0)}</span>;
  return inline(text, key);
}

function tableNode(rows: string[], key: number): ReactNode {
  const cells = rows
    .map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
    .filter((r) => r.some((c) => c && !/^[-: ]+$/.test(c)));
  if (!cells.length) return null;
  const [head, ...body] = cells;
  return (
    <div className="rr-table-wrap" key={key}>
      <table className="rr-table">
        <thead><tr>{head.map((c, i) => <th key={i}>{inline(c, i)}</th>)}</tr></thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{cellNode(c, j)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = String(text || "").split("\n");
  const out: ReactNode[] = [];
  let i = 0, key = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    // 分隔线(---/***/___,常见于模型分主体/分小节时用来隔断):渲染成真的横线,
    // 不然会像实测里那样把 "---" 当纯文本段落印出来。
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { out.push(<hr key={key++} />); i++; continue; }
    if (t.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim()); i++; }
      out.push(tableNode(rows, key++));
      continue;
    }
    if (/^#{1,4}\s/.test(t)) {
      const level = t.match(/^#+/)![0].length;
      const body = t.replace(/^#+\s*/, "");
      // 章标题已由模块 title 呈现,正文里的 #/## 一律降为小节标题
      out.push(level <= 2 ? <h3 key={key++}>{inline(body, 0)}</h3> : <h4 key={key++}>{inline(body, 0)}</h4>);
      i++; continue;
    }
    if (t.startsWith("- ") || t.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i++; }
      out.push(<ul key={key++}>{items.map((x, j) => <li key={j}>{inline(x, j)}</li>)}</ul>);
      continue;
    }
    if (t.startsWith("> ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { items.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      out.push(<blockquote key={key++}>{items.map((x, j) => <p key={j}>{inline(x, j)}</p>)}</blockquote>);
      continue;
    }
    out.push(<p key={key++}>{inline(t, 0)}</p>);
    i++;
  }
  return <div className="rr-md">{out}</div>;
}
