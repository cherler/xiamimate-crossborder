"use client";

/**
 * 「贴链接读取」—— 链接导入商品信息 v1 的前端入口。
 * 只负责把公开网页抓成纯文本、追加进资料框;之后仍走「AI 读取 → 你确认」,
 * 抓回来的内容看得见、改得了,不越过确认这一关。
 * 平台商品页(Amazon 等)后端会拒并提示走截图 / 等浏览器插件。
 */

import { useEffect, useRef, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { aiFetch, aiJson } from "../../../lib/api";

export function UrlFetchRow({ onText, disabled, initialUrl, autoRun }: {
  onText: (text: string, meta: {
    url: string; title?: string; truncated?: boolean; originalChars?: number; cleanedChars?: number;
  }) => void;
  disabled?: boolean;
  initialUrl?: string;
  /** omnibox 贴链接直达时:带着链接打开抽屉并立即开抓,不用再点一次 */
  autoRun?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // 贴链接直达:挂载后立即开抓一次
  const fired = useRef(false);
  useEffect(() => {
    if (autoRun && initialUrl && !fired.current) {
      fired.current = true;
      go();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function go() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await aiFetch("/api/crossborder/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      // 必须走 aiJson:抓取要串 Jina(25s)→Firecrawl(30s)→Tavily(30s),整条链
      // 最坏 85 秒 —— 撞上网关超时拿到的是一张 HTML 504 页,裸 res.json() 会先抛
      // SyntaxError,用户看到的是「Unexpected token '<'」。同一个坑在两个抽屉里修过。
      const data = await aiJson<{
        ok?: boolean; text?: string; title?: string; url?: string; truncated?: boolean;
        originalChars?: number; cleanedChars?: number; garbled?: number;
      }>(res);
      if (!data.text) throw new Error("这个页面没有抓到正文,换个链接或直接截图上传。");
      onText(data.text, {
        url: data.url || u, title: data.title, truncated: data.truncated,
        originalChars: data.originalChars, cleanedChars: data.cleanedChars,
      });
      const sourceSize = data.originalChars ? `原页 ${data.originalChars.toLocaleString()} 字，` : "";
      const kept = `${data.text.length.toLocaleString()} 字`;
      // 截断时不再说「无需手动删减」——正文确实被挑过,已标注「略去 N 行」,值得用户扫一眼。
      const tail = data.truncated
        ? "（超出部分已按信息量取舍，正文中以「略去 N 行」标出）"
        : "，可直接识别。";
      // 编码没认出来时必须提醒:币种符号、单位很可能已经丢了,默认按美元算会算错账。
      const enc = (data.garbled ?? 0) > 0
        ? " ⚠ 该页字符编码未能识别，币种符号与单位可能已丢失，请务必核对金额单位。"
        : "";
      setNote({ kind: (data.garbled ?? 0) > 0 ? "err" : "ok",
        msg: `已提取${data.title ? `「${data.title.slice(0, 40)}」` : "网页正文"}：${sourceSize}自动去除导航与重复内容，保留 ${kept}${tail}${enc}` });
      setUrl("");
    } catch (e) {
      setNote({ kind: "err", msg: e instanceof Error ? e.message : "抓取失败,请稍后再试。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="urlrow-wrap">
      <div className="urlrow">
        <Link2 size={14} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}
          placeholder="或贴一个公开网页链接(供应商站 / 1688 / 独立站…)"
          aria-label="网页链接"
          disabled={disabled || busy}
        />
        <button type="button" onClick={go} disabled={disabled || busy || !url.trim()}>
          {busy ? <><Loader2 size={13} className="spin" /> 抓取中…</> : "读取网页"}
        </button>
      </div>
      {note && <p className={`urlrow-note is-${note.kind}`}>{note.msg}</p>}
    </div>
  );
}
