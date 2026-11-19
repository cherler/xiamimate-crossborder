"use client";
import { useMemo, useState } from "react";
import { ProductSwitcher } from "../../tools/product-switcher";
import { SaveResultModal } from "../../tools/save-result-modal";
import {
  serviceTemplate,
  type ServiceScenario,
} from "../../../../lib/crossborder/local-workbench";
import {
  redact,
  checkReply,
  detectEscalations,
} from "../../../../lib/crossborder/service-reply";
import { saveProductRecord } from "../../../../lib/crossborder/products";
import { downloadText } from "../../../../lib/crossborder/backup";
export function CopilotPanel() {
  const [message, setMessage] = useState(""),
    [scenario, setScenario] = useState<ServiceScenario>("delivery"),
    [language, setLanguage] = useState<"en" | "zh">("en"),
    [reply, setReply] = useState(""),
    [notice, setNotice] = useState(""),
    [saveOpen, setSaveOpen] = useState(false);
  const preview = useMemo(() => redact(message), [message]),
    issues = useMemo(() => checkReply(reply), [reply]),
    escalations = useMemo(() => detectEscalations(message), [message]);
  const blocked =
    escalations.length > 0 || issues.some((i) => i.level === "violation");
  function prepare() {
    const r = serviceTemplate(message, scenario, language);
    setReply(r.reply);
    setNotice(
      r.escalations.length
        ? "这条消息需要人工处理，未生成模板。"
        : "已填入通用模板，请按真实订单情况修改后再使用。",
    );
  }
  function save() {
    saveProductRecord("service", "客服回复模板", {
      message: preview.text,
      reply: redact(reply).text,
      summary: redact(reply).text,
      scenario,
      language,
    });
    setNotice("脱敏后的消息与回复已保存。");
  }
  return (
    <>
      <ProductSwitcher />
      <p className="local-note">
        模板根据你选择的场景填入，不自动理解订单，也不会代替你发送。消息在本地处理；保存记录会替换可识别的邮箱、电话和订单号，姓名与地址请自行检查。
      </p>
      <div className="local-grid">
        <section className="local-panel">
          <h2>买家消息与场景</h2>
          <label className="local-field">
            买家消息
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setReply("");
              }}
            />
          </label>
          <label className="local-field">
            售后场景
            <select
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value as ServiceScenario);
                setReply("");
              }}
            >
              <option value="delivery">物流与配送</option>
              <option value="damage">损坏或质量问题</option>
              <option value="refund">退货与退款</option>
              <option value="usage">使用指导</option>
            </select>
          </label>
          <label className="local-field">
            回复语言
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as "en" | "zh");
                setReply("");
              }}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
          <div className="local-actions">
            <button
              className="primary"
              onClick={prepare}
              disabled={!message.trim() || !!escalations.length}
            >
              填入回复模板
            </button>
          </div>
          {escalations.map((e) => (
            <p className="local-notice" key={e.id}>
              {e.text}
            </p>
          ))}
          {preview.redactions.length > 0 && (
            <details className="local-record">
              <summary>脱敏预览 · {preview.redactions.length} 处</summary>
              <pre>{preview.text}</pre>
            </details>
          )}
        </section>
        <section className="local-panel">
          <h2>回复草稿</h2>
          <label className="local-field">
            编辑回复
            <textarea
              aria-label="回复草稿"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              style={{ minHeight: 240 }}
            />
          </label>
          <p className="local-note">
            以下为常见风险表达的模式检查，不代表已通过平台审核。请核对当期规则、订单事实和承诺。
          </p>
          {issues.map((i) => (
            <p className="local-notice" key={i.id}>
              <b>{i.title}</b>
              <br />
              {i.detail}
            </p>
          ))}
          <div className="local-actions">
            <button
              disabled={!reply.trim() || blocked}
              onClick={() => setSaveOpen(true)}
            >
              保存回复快照
            </button>
            <button
              disabled={!reply.trim() || blocked}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reply);
                  setNotice("已复制回复。");
                } catch {
                  setNotice("复制未完成，请手动选择文字或导出文本。");
                }
              }}
            >
              复制回复
            </button>
            <button
              disabled={!reply.trim() || blocked}
              onClick={() =>
                downloadText("service-reply.txt", reply, "text/plain")
              }
            >
              导出文本
            </button>
          </div>
        </section>
      </div>
      {notice && (
        <p className="local-note" role="status">
          {notice}
        </p>
      )}
      {saveOpen && (
        <SaveResultModal
          toolId="service"
          onConfirm={save}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </>
  );
}
