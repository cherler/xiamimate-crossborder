"use client";

/**
 * 客服回复 Copilot。
 *
 * 与旧的「客服回复模板」的差别不在模型，在这条顺序：
 *   脱敏 → 调模型 → 确定性违规检查 → 还原 → 你自己发送
 *
 * 脱敏与还原都在浏览器里做，原文根本不离开你的机器 —— 连我们的服务端都不经过。
 * 「请注意隐私」写在提示词里是没用的：内容已经进去了。
 * 违规检查不由模型做 —— 让它判断自己写的回复合不合规，是自己判卷。
 * 我们不接管发送 —— 发送等于替你承担违规风险。
 */

import { useEffect, useMemo, useState } from "react";
import { aiFetch, aiJson } from "../../../../lib/api";
import {
  AlertTriangle, Bookmark, Check, Copy, EyeOff, Info, MessageSquareText, RefreshCw, ShieldCheck, UserX,
} from "lucide-react";
import {
  MESSAGE_RULE_NOTE, REDACTION_LABEL, checkReply, detectEscalations, redact, restore,
  type MessageIssue,
} from "../../../../lib/crossborder/service-reply";
import { currentProduct, saveProductRecord } from "../../../../lib/crossborder/products";
import { SaveResultModal } from "../../tools/save-result-modal";
import { useProductContextSync } from "../../../../lib/crossborder/use-product-context";
import { SERVICE_SAMPLES } from "../../../../lib/crossborder/workbench-samples";
import { AigcBadge, withAigcMark } from "../../aigc";
import { ProductSwitcher } from "../../tools/product-switcher";

type ApiResponse = {
  intent?: string;
  reply?: string;
  notes?: string[];
  issues?: MessageIssue[];
  error?: string;
};

export function CopilotPanel() {
  const [msg, setMsg] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("友好、真诚道歉");
  const [language, setLanguage] = useState("English");
  const [result, setResult] = useState<ApiResponse | null>(null);
  /**
   * 起草那一刻的脱敏表(占位符 → 原值)。
   *
   * 不能用随输入框实时重算的 preview 来还原:连续处理两个买家时(给 A 起草完,
   * 直接把 B 的消息粘进输入框),preview 已经是 B 的表,而 result 还是 A 的回复 ——
   * 还原出来会把 **B 的订单号/邮箱** 写进给 A 的回复里,发出去就是跨买家信息泄露。
   */
  const [draftRedactions, setDraftRedactions] = useState<ReturnType<typeof redact>["redactions"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  // 商品背景跟随当前商品(顶部切换器)—— 客服 Copilot 天然带上商品档案的上下文。
  useProductContextSync(setContext);

  // #6:从商品档案点客服回复记录回来(?snap=)→ 还原当时的买家消息(脱敏)+ 回复草稿。
  useEffect(() => {
    const snap = new URLSearchParams(window.location.search).get("snap");
    if (!snap) return;
    const v = currentProduct()?.records?.find((r) => r.id === snap)?.values as
      { message?: string; result?: ApiResponse } | undefined;
    if (v?.result) { if (v.message) setMsg(v.message); setResult(v.result); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 本地先算一遍，让用户在点按钮之前就看到「什么会被脱敏、这条要不要转人工」。
  const preview = useMemo(() => (msg.trim() ? redact(msg) : null), [msg]);
  const escalations = useMemo(() => (msg.trim() ? detectEscalations(msg) : []), [msg]);

  async function draft() {
    setLoading(true);
    setError("");
    try {
      // 只发脱敏版与占位符清单，原文留在本地。
      const { text: safeMessage, redactions } = redact(msg);
      const res = await aiFetch("/api/crossborder/service", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          safeMessage,
          placeholders: redactions.map((r) => r.placeholder),
          productContext: context, tone, language,
        }),
      });
      const data = await aiJson<ApiResponse>(res);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "起草失败，请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  async function copyReply() {
    if (!result?.reply) return;
    try {
      // 还原也在本地：服务端没有原值，还原不了。复制时附 AIGC 标识随内容流出。
      // 用起草时冻结的脱敏表,不是当前输入框的 —— 否则会还原成另一位买家的信息。
      await navigator.clipboard.writeText(withAigcMark(restore(result.reply, draftRedactions)));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }

  /**
   * 复检必须对着**还原后的成品**——服务端 checkReply 查的是含 [链接1] 的脱敏版,
   * 而用户复制走的是 restore() 把真实 URL/邮箱写回去之后的文本。站外链接正是
   * 判 violation 的那一类:只查脱敏版等于让它一路绿灯。这里用同一份规则(客户端
   * 同源 checkReply)对成品再查一遍,两边的问题合并后再决定放不放行。
   */
  const restoredReply = result?.reply ? restore(result.reply, draftRedactions) : "";
  const restoredIssues = restoredReply ? checkReply(restoredReply) : [];
  const seen = new Set((result?.issues ?? []).map((i) => i.id));
  const issues = [...(result?.issues ?? []), ...restoredIssues.filter((i) => !seen.has(i.id))];
  const violations = issues.filter((i) => i.level === "violation");
  const clean = Boolean(result) && violations.length === 0;
  const [savedReply, setSavedReply] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // 保存本次回复为商品档案的一个版本。只存脱敏版(result.reply 里是占位符、未还原),不落买家隐私。
  function saveReply() {
    if (!result?.reply) return;
    const summary = [
      result.intent ? `诉求:${result.intent}` : "",
      `语气 ${tone} · ${language}`,
      "【回复(脱敏)】", result.reply,
    ].filter(Boolean).join("\n");
    saveProductRecord("service", `客服回复 · ${result.intent || "回复"}`, {
      summary, intent: result.intent || "", reply: result.reply,
      // 存输入(买家消息脱敏版,不落隐私)+ 输出(回复草稿),供「带这一版回工作台」还原(#6)。
      message: preview?.text || "", result,
    });
    setSavedReply(true); setTimeout(() => setSavedReply(false), 1500);
    window.dispatchEvent(new CustomEvent("xm-pet", { detail: { mood: "happy" } }));
  }

  return (
    <>
    <div className="wb-toolbar">
      <ProductSwitcher />
      <button className="wb-snapshot-btn" onClick={() => setSaveOpen(true)} disabled={!result?.reply}
        title={result?.reply ? "保存本次回复(脱敏版,选存到商品档案或独立结果)" : "先起草回复,才有可保存的快照"}>
        {savedReply ? <><Check size={14} /> 已保存</> : <><Bookmark size={14} /> 保存本次快照</>}
      </button>
    </div>
    <div className="wb-grid">
      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><MessageSquareText size={15} /> 买家消息</span><em>粘贴原文</em></div>
          <textarea className="mt-textarea" style={{ minHeight: 130 }} value={msg}
            placeholder="粘贴买家的原始消息…" onChange={(e) => setMsg(e.target.value)} />
          <div className="fact-import-actions">
            <button className="gen-btn" onClick={draft} disabled={loading || !msg.trim()}>
              {loading ? <><RefreshCw size={14} className="spin" /> 起草中…</> : <><MessageSquareText size={14} /> 起草回复</>}
            </button>
          </div>
          <div className="wb-sample-row">
            <span>用示例消息一键试(不同诉求):</span>
            {SERVICE_SAMPLES.map((s) => (
              <button key={s.id} className="fact-upload" onClick={() => setMsg(s.message)}>{s.label}</button>
            ))}
          </div>

          {preview && preview.redactions.length > 0 && (
            <div className="redact-card">
              <div className="card-title"><span><EyeOff size={13} /> 交给模型前会脱掉</span><small>{preview.redactions.length} 项</small></div>
              <div className="redact-list">
                {preview.redactions.map((r, i) => (
                  <div key={i}>
                    <span className="redact-kind">{REDACTION_LABEL[r.kind]}</span>
                    <code>{r.original}</code>
                    <b>{r.placeholder}</b>
                  </div>
                ))}
              </div>
              <p>
                脱敏在<b>你的浏览器里</b>完成，这些值<b>连我们的服务端都不会经过</b>。
                回复里的占位符会在你复制时于本地还原。
              </p>
            </div>
          )}
          {preview && preview.redactions.length === 0 && msg.trim() && (
            <div className="conflict-item info">
              <Info size={14} />
              <span>没认出可机械识别的个人信息。<b>姓名与地址认不出来</b>——「Ken」「北京」既可能是人名地名也可能是普通词，靠模式匹配只会漏或误伤，请你自己看一眼再发。</span>
            </div>
          )}

          {escalations.length > 0 && (
            <div className="cost-modules">
              {escalations.map((e) => (
                <div className="conflict-item warn" key={e.id}>
                  <UserX size={14} />
                  <span><b>建议转人工：</b>{e.text}</span>
                </div>
              ))}
            </div>
          )}
          {error && <div className="tool-error"><AlertTriangle size={15} /><span>{error}</span></div>}

          <div className="field-grid" style={{ marginTop: 12 }}>
            <label className="gen-field">
              <span>回复语言</span>
              <input className="gen-input" value={language} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="gen-field">
              <span>语气</span>
              <input className="gen-input" value={tone} onChange={(e) => setTone(e.target.value)} />
            </label>
          </div>
          <label className="gen-field">
            <span>商品背景（选填）</span>
            <input className="gen-input" value={context} placeholder="如：32oz 保温水杯，仅防泼溅"
              onChange={(e) => setContext(e.target.value)} />
          </label>
          <p className="fact-note">
            订单与商品上下文<b>由你粘贴，我们不接入卖家后台</b>。生成后<b>不接管发送</b>——
            发送等于替你承担违规风险，最后一步必须你自己按。
          </p>
        </div>
      </section>

      <section className="wb-col">
        <div className="wb-block">
          <div className="section-heading"><span><ShieldCheck size={15} /> 回复草稿</span>
            <em>{result ? (clean ? "未触发禁区" : `${violations.length} 处违规`) : "待起草"}</em>
          </div>

          {!result ? (
            <div className="wb-skel" aria-hidden="true">
              <p className="wb-skel-cap">起草后,这里会出现<b>回复草稿 + 逐条合规检查</b> —— 检查用确定性规则,不让模型自己判断自己合不合规:</p>
              <div className="wb-skel-para"><i style={{ width: "94%" }} /><i style={{ width: "88%" }} /><i style={{ width: "62%" }} /></div>
              {["索评 / 好评引导", "站外联系方式", "营销与促销用语"].map((t) => (
                <div className="wb-skel-check" key={t}><span className="wb-skel-dot" /><span className="wb-skel-ct">{t}</span><span className="wb-skel-n" /></div>
              ))}
            </div>
          ) : (
            <>
              {result.intent && (
                <div className="conflict-item info"><Info size={14} /><span>识别诉求：<b>{result.intent}</b></span></div>
              )}

              <div className={`diag-summary ${clean ? "" : "is-partial"}`}>
                {clean ? <Check size={14} /> : <AlertTriangle size={14} />}
                <span>
                  {clean
                    ? "未触发常见禁区。检查仅供参考，不是官方规则库，发送前仍需你自己过一遍。"
                    : `触发了 ${violations.length} 处禁区，不建议直接发送。`}
                </span>
              </div>

              <div className="reply-draft">
                <div className="card-title"><span>回复正文 <AigcBadge compact /></span></div>
                <p>{result.reply}</p>
              </div>

              {issues.length > 0 && (
                <div className="finding-list" style={{ marginTop: 10 }}>
                  {issues.map((i) => (
                    <div className={`finding is-${i.level === "violation" ? "violation" : "risk"}`} key={i.id}>
                      <div className="finding-head">
                        <span className={`finding-badge ${i.level === "violation" ? "violation" : "risk"}`}>
                          {i.level === "violation" ? "违规" : "注意"}
                        </span>
                        <strong>{i.title}</strong>
                      </div>
                      <p>{i.detail}{i.match ? `　命中：「${i.match}」` : ""}</p>
                    </div>
                  ))}
                </div>
              )}

              {result.notes && result.notes.length > 0 && (
                <div className="rewrite-notes">
                  <div className="card-title"><span>为什么这么回</span><small>模型自述</small></div>
                  <ul>{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </div>
              )}

              <div className="fact-foot-actions">
                <button className="fill" onClick={copyReply} disabled={!clean}
                  title={clean ? "" : "触发了禁区，先修改再复制"}>
                  {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制（还原占位符）</>}
                </button>
              </div>
              <p className="fact-note">{MESSAGE_RULE_NOTE}我们<b>不代你发送</b>，复制后请自行在平台内发出。</p>
            </>
          )}
        </div>
      </section>
    </div>
    {saveOpen && <SaveResultModal toolId="service" onConfirm={saveReply} onClose={() => setSaveOpen(false)} />}
    </>
  );
}
